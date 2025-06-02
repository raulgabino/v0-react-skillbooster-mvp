import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import OpenAI from "openai"
import { z } from "zod"

// --- Validation Schemas ---
const AnswerSchema = z.object({
  questionId: z.string(),
  value: z.union([z.string(), z.number()]),
})

const ScoreRequestSchema = z.object({
  skillId: z.string().min(1, "skillId es requerido"),
  answers: z.array(AnswerSchema).min(1, "Se requiere al menos una respuesta"),
})

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

interface IndicatorScore {
  id: string
  name: string
  score: number
  descripcion_indicador?: string
  feedback_especifico?: string
}

interface ScoreResponsePayload {
  indicatorScores: IndicatorScore[]
  globalScore: number
}

interface ErrorResponse {
  error: string
  details?: string
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
  const mapping = {
    1: 20,
    2: 40,
    3: 60,
    4: 80,
    5: 100,
  }
  return mapping[value as keyof typeof mapping] || 0
}

// --- Función mejorada para generar feedback por lotes ---
async function generateBatchFeedback(
  indicatorScores: IndicatorScore[],
  skillName: string,
): Promise<Record<string, string>> {
  if (!openai) {
    return {}
  }

  try {
    // Preparar datos para el prompt
    const indicatorsData = indicatorScores
      .map((indicator) => ({
        id: indicator.id,
        name: indicator.name,
        score: indicator.score,
        description: indicator.descripcion_indicador || "Sin descripción disponible",
      }))
      .slice(0, 6) // Limitar a 6 indicadores para evitar prompts muy largos

    const systemPrompt = `Eres un tutor experto en ${skillName}. Tu tarea es generar feedback breve y específico para múltiples indicadores de desempeño. 

Para cada indicador, proporciona un comentario de 1-2 frases (máximo 35 palabras) que sea:
- Alentador y constructivo
- Específico al nivel de desempeño
- Orientado a la acción

Responde ÚNICAMENTE con un objeto JSON válido donde las claves sean los IDs de los indicadores y los valores sean los comentarios de feedback.`

    const userPrompt = `Genera feedback para los siguientes indicadores de ${skillName}:

${indicatorsData
  .map(
    (ind) =>
      `ID: "${ind.id}"
Nombre: "${ind.name}"
Puntuación: ${ind.score}/100
Descripción: "${ind.description}"`,
  )
  .join("\n\n")}

Formato de respuesta requerido:
{
  "indicador_id_1": "feedback específico aquí",
  "indicador_id_2": "feedback específico aquí"
}`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 800,
      response_format: { type: "json_object" },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("No se recibió respuesta de OpenAI")
    }

    const feedbackData = JSON.parse(content)
    return feedbackData
  } catch (error) {
    console.error("Error generando feedback por lotes:", error)
    return {}
  }
}

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<ScoreResponsePayload | ErrorResponse>> {
  console.log("API /api/score iniciada para evaluación de habilidad")

  try {
    if (!openai) {
      return NextResponse.json(
        { error: "OpenAI API no está configurada.", details: "Contacte al administrador del sistema." },
        { status: 500 },
      )
    }

    // Validar entrada
    let requestData
    try {
      const rawData = await request.json()
      requestData = ScoreRequestSchema.parse(rawData)
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "Datos de entrada inválidos",
            details: validationError.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
          },
          { status: 400 },
        )
      }
      return NextResponse.json(
        { error: "Error al procesar la solicitud", details: "Formato de datos incorrecto" },
        { status: 400 },
      )
    }

    const { skillId, answers } = requestData

    // Cargar definiciones de habilidades
    const definitions = loadSkillDefinitions()
    const skillDefinition = definitions[skillId]
    if (!skillDefinition) {
      return NextResponse.json(
        { error: `Habilidad con ID '${skillId}' no encontrada.`, details: "Verifique el ID de la habilidad." },
        { status: 404 },
      )
    }

    // Procesar respuestas Likert
    const likertScores: IndicatorScore[] = []
    let likertTotal = 0

    for (const indicator of skillDefinition.likert_indicators) {
      const answer = answers.find((a) => a.questionId === indicator)
      if (answer && typeof answer.value === "number") {
        const score = mapLikertToScore(answer.value)

        const indicadorInfo = skillDefinition.indicadores_info.find((info) => info.id === indicator)

        if (!indicadorInfo) {
          console.error(
            `Error: No se encontró indicadorInfo para el ID: ${indicator} en la habilidad: ${skillDefinition.name}`,
          )
        }

        const indicatorName = indicadorInfo ? indicadorInfo.nombre : `[NOMBRE PENDIENTE - ${indicator}]`
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

    // Procesar respuesta abierta con formato JSON estructurado
    const openAnswer = answers.find((a) => a.questionId === skillDefinition.open_question_id)
    let openScore = 0

    if (openAnswer && typeof openAnswer.value === "string" && openAnswer.value.trim()) {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Eres un evaluador experto en ${skillDefinition.name}. Evalúa la respuesta del usuario y devuelve un JSON con la puntuación y justificación.`,
            },
            {
              role: "user",
              content: `${skillDefinition.prompt_score_rubric_text}

Respuesta del usuario: "${openAnswer.value}"

Evalúa esta respuesta y responde con un JSON en este formato exacto:
{
  "score": [número entre 0 y 100],
  "justification": "breve explicación de la puntuación"
}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 200,
          response_format: { type: "json_object" },
        })

        const content = response.choices[0]?.message?.content
        if (content) {
          const result = JSON.parse(content)
          openScore = Math.max(0, Math.min(100, Number(result.score) || 0))
        }
      } catch (error) {
        console.error("Error evaluando respuesta abierta:", error)
        openScore = 60 // Puntuación por defecto en caso de error
      }
    }

    // Calcular puntuación global ponderada
    const globalScore = Math.round(
      likertAverage * skillDefinition.scoring_weights.likert + openScore * skillDefinition.scoring_weights.open,
    )

    // Añadir la puntuación de la pregunta abierta a los indicadores
    const openQuestionIndicadorInfo = skillDefinition.indicadores_info.find(
      (info) => info.id === skillDefinition.open_question_id,
    )

    likertScores.push({
      id: skillDefinition.open_question_id,
      name: openQuestionIndicadorInfo ? openQuestionIndicadorInfo.nombre : "Aplicación Práctica",
      score: openScore,
      descripcion_indicador:
        openQuestionIndicadorInfo?.descripcion_indicador ||
        "Evaluación de tu capacidad para aplicar esta habilidad en una situación práctica concreta.",
    })

    // Generar feedback por lotes (mejorado)
    const batchFeedback = await generateBatchFeedback(likertScores, skillDefinition.name)

    // Aplicar feedback generado o usar fallbacks
    likertScores.forEach((indScore) => {
      if (batchFeedback[indScore.id]) {
        indScore.feedback_especifico = batchFeedback[indScore.id]
      } else {
        // Fallback basado en puntuación
        if (indScore.score >= 75) {
          indScore.feedback_especifico = `¡Excelente desempeño en ${indScore.name}! Sigue aplicando esta fortaleza.`
        } else if (indScore.score >= 40) {
          indScore.feedback_especifico = `Buen progreso en ${indScore.name}. Con práctica constante seguirás mejorando.`
        } else {
          indScore.feedback_especifico = `${indScore.name} es un área de oportunidad. Enfócate en desarrollar este aspecto.`
        }
      }
    })

    console.log(`Evaluación completada exitosamente para la habilidad: ${skillDefinition.name}`)
    return NextResponse.json({ indicatorScores: likertScores, globalScore }, { status: 200 })
  } catch (error) {
    console.error("Error al calcular la puntuación:", error)
    return NextResponse.json(
      {
        error: "Error interno al procesar la evaluación",
        details: "Por favor, intente nuevamente o contacte al soporte técnico.",
      },
      { status: 500 },
    )
  }
}
