import { NextResponse } from "next/server"
import { z } from "zod"
import OpenAI from "openai"

// Importación directa de archivos JSON para mayor robustez en serverless
import skillDefinitionsData from "@/data/skill_definitions.json"

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

// --- Validación de Consistencia de Datos ---
function validateDataConsistency(skillDefinition: SkillDefinition): string[] {
  const errors: string[] = []

  // Verificar que todos los likert_indicators tengan su correspondiente indicadorInfo
  for (const indicatorId of skillDefinition.likert_indicators) {
    const indicadorInfo = skillDefinition.indicadores_info.find((info) => info.id === indicatorId)
    if (!indicadorInfo) {
      errors.push(`Indicador Likert '${indicatorId}' no tiene información descriptiva en indicadores_info`)
    }
  }

  // Verificar que la pregunta abierta tenga su información
  const openQuestionInfo = skillDefinition.indicadores_info.find((info) => info.id === skillDefinition.open_question_id)
  if (!openQuestionInfo) {
    errors.push(
      `Pregunta abierta '${skillDefinition.open_question_id}' no tiene información descriptiva en indicadores_info`,
    )
  }

  return errors
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
  validIndicatorScores: IndicatorScore[],
  skillName: string,
): Promise<Record<string, string>> {
  if (!openai || validIndicatorScores.length === 0) {
    return {}
  }

  try {
    // Solo procesar indicadores que tienen información completa
    const indicatorsForAI = validIndicatorScores
      .filter((indicator) => indicator.name && !indicator.name.includes("[NOMBRE PENDIENTE"))
      .slice(0, 6) // Limitar para evitar prompts muy largos

    if (indicatorsForAI.length === 0) {
      console.warn("No hay indicadores válidos para generar feedback con IA")
      return {}
    }

    const systemPrompt = `Eres un tutor experto en ${skillName}. Tu tarea es generar feedback breve y específico para múltiples indicadores de desempeño. 

Para cada indicador, proporciona un comentario de 1-2 frases (máximo 35 palabras) que sea:
- Alentador y constructivo
- Específico al nivel de desempeño
- Orientado a la acción

Responde ÚNICAMENTE con un objeto JSON válido donde las claves sean los IDs de los indicadores y los valores sean los comentarios de feedback.`

    const userPrompt = `Genera feedback para los siguientes indicadores de ${skillName}:

${indicatorsForAI
  .map(
    (ind) =>
      `ID: "${ind.id}"
Nombre: "${ind.name}"
Puntuación: ${ind.score}/100
Descripción: "${ind.descripcion_indicador || "Aspecto clave de la habilidad"}"`,
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

// --- Función para generar feedback genérico sin IA ---
function generateGenericFeedback(score: number, skillName: string): string {
  if (score >= 75) {
    return `Excelente desempeño en este aspecto de ${skillName}. Sigue aplicando esta fortaleza.`
  } else if (score >= 40) {
    return `Buen progreso en este componente de ${skillName}. Con práctica constante seguirás mejorando.`
  } else {
    return `Esta es un área de oportunidad en ${skillName}. Enfócate en desarrollar este aspecto.`
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

    // Cargar definiciones usando importación directa
    const definitions = skillDefinitionsData as AllSkillDefinitions
    const skillDefinition = definitions[skillId]
    if (!skillDefinition) {
      return NextResponse.json(
        { error: `Habilidad con ID '${skillId}' no encontrada.`, details: "Verifique el ID de la habilidad." },
        { status: 404 },
      )
    }

    // Validar consistencia de datos
    const consistencyErrors = validateDataConsistency(skillDefinition)
    if (consistencyErrors.length > 0) {
      console.error(`Errores de consistencia en skill_definitions.json para ${skillId}:`, consistencyErrors)
      // Continuar con advertencias pero no fallar completamente
    }

    // Procesar respuestas Likert con mejor manejo de errores
    const likertScores: IndicatorScore[] = []
    const dataInconsistencies: string[] = []
    let likertTotal = 0

    for (const indicator of skillDefinition.likert_indicators) {
      const answer = answers.find((a) => a.questionId === indicator)
      if (answer && typeof answer.value === "number") {
        const score = mapLikertToScore(answer.value)
        const indicadorInfo = skillDefinition.indicadores_info.find((info) => info.id === indicator)

        if (!indicadorInfo) {
          const errorMsg = `Indicador '${indicator}' no tiene información descriptiva en skill_definitions.json`
          console.error(errorMsg)
          dataInconsistencies.push(errorMsg)

          // Usar información genérica en lugar de placeholder
          likertScores.push({
            id: indicator,
            name: "Aspecto de la Habilidad", // Nombre genérico sin ID
            score,
            descripcion_indicador: "Componente importante de esta habilidad",
            feedback_especifico: generateGenericFeedback(score, skillDefinition.name),
          })
        } else {
          likertScores.push({
            id: indicator,
            name: indicadorInfo.nombre,
            score,
            descripcion_indicador: indicadorInfo.descripcion_indicador,
          })
        }

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

    if (!openQuestionIndicadorInfo) {
      console.warn(`Pregunta abierta '${skillDefinition.open_question_id}' no tiene información descriptiva`)
      dataInconsistencies.push(`Pregunta abierta '${skillDefinition.open_question_id}' sin información descriptiva`)
    }

    likertScores.push({
      id: skillDefinition.open_question_id,
      name: openQuestionIndicadorInfo ? openQuestionIndicadorInfo.nombre : "Aplicación Práctica",
      score: openScore,
      descripcion_indicador:
        openQuestionIndicadorInfo?.descripcion_indicador ||
        "Evaluación de tu capacidad para aplicar esta habilidad en una situación práctica concreta.",
    })

    // Generar feedback por lotes solo para indicadores válidos
    const validIndicatorsForAI = likertScores.filter(
      (ind) => ind.name && !ind.name.includes("[NOMBRE PENDIENTE") && !ind.feedback_especifico, // Solo los que no tienen feedback ya asignado
    )

    const batchFeedback = await generateBatchFeedback(validIndicatorsForAI, skillDefinition.name)

    // Aplicar feedback generado o usar fallbacks
    likertScores.forEach((indScore) => {
      if (indScore.feedback_especifico) {
        // Ya tiene feedback (caso de inconsistencia de datos)
        return
      }

      if (batchFeedback[indScore.id]) {
        indScore.feedback_especifico = batchFeedback[indScore.id]
      } else {
        // Fallback genérico
        indScore.feedback_especifico = generateGenericFeedback(indScore.score, skillDefinition.name)
      }
    })

    // Log de advertencias si hay inconsistencias
    if (dataInconsistencies.length > 0) {
      console.warn(`Inconsistencias de datos detectadas para ${skillDefinition.name}:`, dataInconsistencies)
    }

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
