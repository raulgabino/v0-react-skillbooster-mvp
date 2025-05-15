import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import OpenAI from "openai"

// --- Tipos ---
interface IndicadorInfo {
  id: string
  nombre: string
  descripcion_indicador?: string
}

interface SkillDefinition {
  name: string
  rubrica: Record<string, string>
  likert_indicators: string[]
  indicadores_info: IndicadorInfo[]
  open_question_id: string
  scoring_weights: {
    likert: number
    open: number
  }
  prompt_score_rubric_text: string
}

interface AllSkillDefinitions {
  [key: string]: SkillDefinition
}

interface Answer {
  questionId: string
  value: string | number
}

interface ScoreRequestPayload {
  skillId: string
  answers: Answer[]
}

interface IndicatorScore {
  id: string
  name: string
  score: number
  descripcion_indicador?: string
  feedback_especifico?: string // Para el feedback de IA
}

interface ScoreResponsePayload {
  indicatorScores: IndicatorScore[]
  globalScore: number
}

interface ErrorResponse {
  error: string
}

// --- Configuración OpenAI ---
const openaiApiKey = process.env.OPENAI_API_KEY
let openai: OpenAI | null = null

if (openaiApiKey) {
  openai = new OpenAI({
    apiKey: openaiApiKey,
  })
} else {
  console.warn("OPENAI_API_KEY no está configurada. La API de puntuación no funcionará correctamente.")
}

// --- Carga de Definiciones ---
let skillDefinitions: AllSkillDefinitions | null = null

function loadSkillDefinitions(): AllSkillDefinitions {
  if (skillDefinitions) return skillDefinitions

  try {
    const filePath = path.join(process.cwd(), "data", "skill_definitions.json")
    const fileContent = fs.readFileSync(filePath, "utf8")
    skillDefinitions = JSON.parse(fileContent)
    return skillDefinitions
  } catch (error) {
    console.error("Error al cargar las definiciones de habilidades:", error)
    throw new Error("No se pudieron cargar las definiciones de habilidades.")
  }
}

// --- Mapeo Likert ---
function mapLikertToScore(value: number): number {
  // Mapea valores Likert (1-5) a puntuaciones (0-100)
  const mapping = {
    1: 20,
    2: 40,
    3: 60,
    4: 80,
    5: 100,
  }
  return mapping[value as keyof typeof mapping] || 0
}

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<ScoreResponsePayload | ErrorResponse>> {
  try {
    if (!openai) {
      return NextResponse.json({ error: "OpenAI API no está configurada." }, { status: 500 })
    }

    const { skillId, answers } = (await request.json()) as ScoreRequestPayload

    // Cargar definiciones de habilidades
    const definitions = loadSkillDefinitions()
    const skillKey = Object.keys(definitions).find(
      (key) => definitions[key].name.toLowerCase().replace(/\s+/g, "_") === skillId,
    )

    if (!skillKey) {
      return NextResponse.json({ error: "Habilidad no encontrada." }, { status: 404 })
    }

    const skillDefinition = definitions[skillKey]

    // Procesar respuestas Likert
    const likertScores: IndicatorScore[] = []
    let likertTotal = 0

    for (const indicator of skillDefinition.likert_indicators) {
      const answer = answers.find((a) => a.questionId === indicator)
      if (answer && typeof answer.value === "number") {
        const score = mapLikertToScore(answer.value)

        // Buscar el nombre descriptivo del indicador
        const indicadorInfo = skillDefinition.indicadores_info.find((info) => info.id === indicator)
        const indicatorName = indicadorInfo ? indicadorInfo.nombre : indicator
        const descripcionIndicador = indicadorInfo ? indicadorInfo.descripcion_indicador : undefined

        likertScores.push({
          id: indicator,
          name: indicatorName,
          score,
          descripcion_indicador: descripcionIndicador,
        })

        likertTotal += score
      }
    }

    const likertAverage = likertScores.length > 0 ? likertTotal / likertScores.length : 0

    // Procesar respuesta abierta
    const openAnswer = answers.find((a) => a.questionId === skillDefinition.open_question_id)
    let openScore = 0

    if (openAnswer && typeof openAnswer.value === "string" && openAnswer.value.trim()) {
      // Usar OpenAI para evaluar la respuesta abierta
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Eres un evaluador experto en ${skillDefinition.name}. Tu tarea es evaluar objetivamente la respuesta de un usuario según los criterios proporcionados.`,
          },
          {
            role: "user",
            content: `${skillDefinition.prompt_score_rubric_text}\n\nRespuesta del usuario: "${openAnswer.value}"\n\nPor favor, evalúa esta respuesta y asigna una puntuación de 0 a 100. Proporciona solo el número, sin explicación.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 10,
      })

      const scoreText = response.choices[0]?.message?.content?.trim() || "0"
      openScore = Number.parseInt(scoreText.match(/\d+/)?.[0] || "0", 10)

      // Validar que el score esté en el rango correcto
      openScore = Math.max(0, Math.min(100, openScore))
    }

    // Calcular puntuación global ponderada
    const globalScore = Math.round(
      likertAverage * skillDefinition.scoring_weights.likert + openScore * skillDefinition.scoring_weights.open,
    )

    // Añadir la puntuación de la pregunta abierta a los indicadores
    likertScores.push({
      id: skillDefinition.open_question_id,
      name: "Respuesta Abierta",
      score: openScore,
      descripcion_indicador:
        "Evaluación de tu capacidad para aplicar esta habilidad en una situación práctica concreta.",
    })

    // Generar feedback específico para cada indicador
    if (openai) {
      // Asegurarse que openai está inicializado
      for (const indScore of likertScores) {
        // Omitir generación de feedback específico para la pregunta abierta si no tiene descripción o no se desea
        if (indScore.id === skillDefinition.open_question_id && !indScore.descripcion_indicador) {
          indScore.feedback_especifico =
            "Tu respuesta a la situación práctica es un componente valioso de esta evaluación."
          continue // Saltar a la siguiente iteración
        }

        const systemContent = `Eres un tutor experto en desarrollo de habilidades, especializado en ${skillDefinition.name}. Tu tono es alentador, conciso y orientado a la acción. Debes generar un feedback breve (1-2 frases, máximo 35 palabras) para un indicador específico. No uses markdown.`

        let userContent = ""
        const score = indScore.score
        const indicatorName = indScore.name
        const indicatorDescription = indScore.descripcion_indicador || `Este es un aspecto de ${skillDefinition.name}.`

        if (score >= 75) {
          // Puntuación Alta
          userContent = `El usuario ha obtenido una puntuación de ${score}/100 en el indicador "${indicatorName}", que se refiere a: "${indicatorDescription}". 
Genera un feedback positivo que refuerce esta fortaleza y sugiera brevemente cómo puede seguir aplicándola o apalancándola. Ejemplo: "¡Excelente trabajo en ${indicatorName}! Sigue aplicando esta habilidad para potenciar tus proyectos."`
        } else if (score >= 40) {
          // Puntuación Media
          userContent = `El usuario ha obtenido una puntuación de ${score}/100 en el indicador "${indicatorName}", que se refiere a: "${indicatorDescription}".
Genera un feedback constructivo que reconozca el área y sugiera una acción simple o una pregunta para reflexionar sobre cómo mejorar. Ejemplo: "Buen avance en ${indicatorName}. Considera cómo [acción simple] podría fortalecer aún más este aspecto."`
        } else {
          // Puntuación Baja
          userContent = `El usuario ha obtenido una puntuación de ${score}/100 en el indicador "${indicatorName}", que se refiere a: "${indicatorDescription}".
Genera un feedback de apoyo que ofrezca un primer paso muy básico y alentador, o una pregunta simple para ayudar a identificar una barrera. Ejemplo: "Este es un buen punto de partida para ${indicatorName}. Un primer paso podría ser [acción muy básica]."`
        }

        userContent +=
          "\nResponde únicamente con el feedback directo al usuario (1-2 frases, máximo 35 palabras). No incluyas saludos ni despedidas."

        try {
          const feedbackResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemContent },
              { role: "user", content: userContent },
            ],
            temperature: 0.5, // Un poco menos de variabilidad para consistencia
            max_tokens: 50, // Suficiente para 35 palabras y algo de margen
            n: 1, // Solo una respuesta
          })
          let generatedFeedback =
            feedbackResponse.choices[0]?.message?.content?.trim() || "Sigue practicando este aspecto para mejorar."

          // Simple post-procesamiento para asegurar brevedad si es necesario
          if (generatedFeedback.split(" ").length > 40) {
            // Un poco más de margen que 35
            generatedFeedback = generatedFeedback.split(".")[0] + "." // Tomar solo la primera frase
          }

          indScore.feedback_especifico = generatedFeedback
        } catch (feedbackError) {
          console.error(`Error generando feedback para indicador ${indScore.id} (${indicatorName}):`, feedbackError)
          // Fallback más genérico si falla la IA
          if (score >= 75) {
            indScore.feedback_especifico = `¡Buen trabajo en ${indicatorName}! Sigue así.`
          } else if (score >= 40) {
            indScore.feedback_especifico = `Continúa desarrollando tu ${indicatorName}, ¡vas por buen camino!`
          } else {
            indScore.feedback_especifico = `Con práctica, mejorarás en ${indicatorName}. ¡Ánimo!`
          }
        }
      }
    } else {
      // Fallback si OpenAI no está disponible
      likertScores.forEach((indScore) => {
        indScore.feedback_especifico = "El servicio de feedback no está disponible actualmente."
      })
    }

    return NextResponse.json({
      indicatorScores: likertScores,
      globalScore,
    })
  } catch (error) {
    console.error("Error al calcular la puntuación:", error)
    return NextResponse.json({ error: "Error al calcular la puntuación." }, { status: 500 })
  }
}
