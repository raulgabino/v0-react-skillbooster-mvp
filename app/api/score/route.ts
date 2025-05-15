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

    // --- INICIO: Bloque para generar feedback_especifico por indicador ---
    if (openai) {
      // Solo proceder si OpenAI está configurado
      for (const indScore of likertScores) {
        // Opcional: Decidir si se genera feedback para la pregunta abierta.
        // Si la pregunta abierta no tiene una 'descripcion_indicador' clara o si se prefiere no darle feedback específico aquí,
        // se puede añadir una condición para saltarla o darle un texto por defecto.
        if (indScore.id === skillDefinition.open_question_id && !indScore.descripcion_indicador) {
          indScore.feedback_especifico =
            "Tu desempeño en la situación práctica ha sido considerado en tu puntaje global y en la sesión con el mentor."
          continue // Saltar a la siguiente iteración del bucle
        }

        // Si no hay descripción del indicador, usar un texto genérico para el prompt de IA.
        const descripcionParaPrompt =
          indScore.descripcion_indicador || `Este es un aspecto clave de la habilidad '${skillDefinition.name}'.`

        const systemContent = `Eres un tutor experto en ${skillDefinition.name}, con un tono alentador, conciso y orientado a la acción. Tu tarea es proporcionar un feedback muy breve (1-2 frases concisas, idealmente menos de 30 palabras) sobre el desempeño del usuario en un indicador específico. No utilices Markdown en tu respuesta.`

        let userContent = ""
        const score = indScore.score
        const indicatorName = indScore.name

        if (score >= 75) {
          // Puntuación Alta
          userContent = `El usuario obtuvo ${score}/100 en el indicador "${indicatorName}" (Descripción: "${descripcionParaPrompt}"). 
Proporciona un reconocimiento positivo y una sugerencia breve sobre cómo puede seguir aprovechando o expandiendo esta fortaleza. Ejemplo: "¡Excelente desempeño en ${indicatorName}! Sigue aplicando esta claridad para liderar con impacto."`
        } else if (score >= 40) {
          // Puntuación Media
          userContent = `El usuario obtuvo ${score}/100 en el indicador "${indicatorName}" (Descripción: "${descripcionParaPrompt}").
Proporciona una observación constructiva y una sugerencia simple y accionable, o una pregunta breve para la reflexión enfocada en mejorar este aspecto. Ejemplo: "Has mostrado una base en ${indicatorName}. Para mejorar, considera practicar [acción simple]."`
        } else {
          // Puntuación Baja
          userContent = `El usuario obtuvo ${score}/100 en el indicador "${indicatorName}" (Descripción: "${descripcionParaPrompt}").
Proporciona un comentario de apoyo con un primer paso muy concreto y alcanzable, o una pregunta que le ayude a identificar un posible obstáculo. Ejemplo: "Este es un área para enfocar tu desarrollo en ${indicatorName}. Un buen inicio sería [acción muy básica]."`
        }
        userContent +=
          "\n\nInstrucciones Adicionales: Responde directamente al usuario. Tu respuesta debe ser solo el feedback, sin saludos, introducciones ni despedidas. Mantén la respuesta entre 1 y 2 frases concisas, no más de 35 palabras."

        try {
          const feedbackResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemContent },
              { role: "user", content: userContent },
            ],
            temperature: 0.55, // Ligeramente más determinista para feedback consistente
            max_tokens: 60, // Espacio para ~40 palabras + buffer
            n: 1,
          })
          let generatedFeedback =
            feedbackResponse.choices[0]?.message?.content?.trim() ||
            "Continúa practicando para fortalecer este aspecto."

          // Opcional: Truncar si es muy largo, aunque el prompt ya lo limita.
          const words = generatedFeedback.split(" ")
          if (words.length > 40) {
            generatedFeedback = words.slice(0, 38).join(" ") + "..."
          }
          indScore.feedback_especifico = generatedFeedback
        } catch (feedbackError) {
          console.error(
            `Error generando feedback específico para el indicador '${indicatorName}' (ID: ${indScore.id}):`,
            feedbackError,
          )
          // Fallback genérico si la IA falla para este indicador específico
          if (score >= 75) {
            indScore.feedback_especifico = `¡Buen trabajo en ${indicatorName}! Sigue aplicando tus fortalezas.`
          } else if (score >= 40) {
            indScore.feedback_especifico = `Sigue esforzándote en ${indicatorName}, ¡la práctica constante es clave!`
          } else {
            indScore.feedback_especifico = `Identificar áreas de mejora es el primer paso. ¡Con enfoque en ${indicatorName}, progresarás!`
          }
        }
      }
    } else {
      // Fallback si la instancia de OpenAI no está disponible
      likertScores.forEach((indScore) => {
        indScore.feedback_especifico = "El servicio de análisis detallado no está disponible en este momento."
      })
    }
    // --- FIN: Bloque para generar feedback_especifico por indicador ---

    return NextResponse.json({
      indicatorScores: likertScores,
      globalScore,
    })
  } catch (error) {
    console.error("Error al calcular la puntuación:", error)
    return NextResponse.json({ error: "Error al calcular la puntuación." }, { status: 500 })
  }
}
