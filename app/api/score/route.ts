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

// Tipo actualizado para incluir el feedback opcional
interface IndicatorScore {
  id: string
  name: string
  score: number
  descripcion_indicador?: string
  feedback_especifico?: string // Nuevo campo
}

interface ScoreResponsePayload {
  indicatorScores: IndicatorScore[]
  globalScore: number
}

interface ErrorResponse {
  error: string
}

// --- Configuración de OpenAI ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
  const mapping = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 }
  return mapping[value as keyof typeof mapping] || 0
}

// --- NUEVA Función para obtener PUNTUACIÓN y FEEDBACK de la IA ---
async function getOpenQuestionEvaluationFromAI(
  rubric: string,
  answer: string,
): Promise<{ score: number; feedback: string }> {
  const fallbackResponse = {
    score: 60,
    feedback: "La evaluación automática no pudo completarse. Se asignó una puntuación base.",
  }

  if (!answer || answer.trim().length < 10) {
    return {
      score: 20,
      feedback: "La respuesta fue demasiado breve para una evaluación detallada.",
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY no encontrada. Usando fallback para evaluación.")
    return fallbackResponse
  }

  try {
    const systemPrompt =
      "Eres un evaluador experto y objetivo. Tu única función es analizar una respuesta de un usuario basándote estrictamente en una rúbrica. Debes devolver un objeto JSON con una puntuación numérica y una justificación breve y constructiva. No añadas explicaciones ni texto adicional, solo el objeto JSON."

    const userPrompt = `Por favor, evalúa la siguiente respuesta de un usuario basándote en la rúbrica proporcionada.
    
    RÚBRICA DE EVALUACIÓN:
    ---
    ${rubric}
    ---
    
    RESPUESTA DEL USUARIO:
    ---
    ${answer}
    ---
    
    Basándote únicamente en la rúbrica, devuelve un objeto JSON con dos claves:
    1. "score": un número entero entre 0 y 100.
    2. "feedback_especifico": una cadena de texto de 1-2 frases explicando la razón principal de la puntuación de forma constructiva.
    
    Ejemplo de formato de respuesta: 
    {"score": 75, "feedback_especifico": "Identificaste correctamente los stakeholders clave, pero para una puntuación mayor, sería útil detallar cómo gestionarías sus expectativas de forma proactiva."}`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    })

    const content = response.choices[0].message.content
    if (content) {
      const parsed = JSON.parse(content)
      if (typeof parsed.score === "number" && typeof parsed.feedback_especifico === "string") {
        console.log(`[IA Eval] Score: ${parsed.score}, Feedback: "${parsed.feedback_especifico}"`)
        return { score: parsed.score, feedback: parsed.feedback_especifico }
      }
    }
    return fallbackResponse
  } catch (error) {
    console.error("Error en la llamada a OpenAI para evaluación:", error)
    return fallbackResponse
  }
}

// --- Handler POST (Lógica Híbrida Actualizada) ---
export async function POST(request: Request): Promise<NextResponse<ScoreResponsePayload | ErrorResponse>> {
  try {
    const { skillId, answers } = (await request.json()) as ScoreRequestPayload
    const definitions = loadSkillDefinitions()
    const skillDefinition = definitions[skillId]

    if (!skillDefinition) {
      return NextResponse.json({ error: "Habilidad no encontrada." }, { status: 404 })
    }

    // 1. Calcular puntuaciones Likert localmente
    const indicatorScores: IndicatorScore[] = []
    let likertTotal = 0
    skillDefinition.likert_indicators.forEach((indicatorId) => {
      const answer = answers.find((a) => a.questionId === indicatorId)
      if (answer && typeof answer.value === "number") {
        const score = mapLikertToScore(answer.value)
        const info = skillDefinition.indicadores_info.find((i) => i.id === indicatorId)
        indicatorScores.push({
          id: indicatorId,
          name: info?.nombre || `Indicador ${indicatorId}`,
          score,
          descripcion_indicador: info?.descripcion_indicador,
        })
        likertTotal += score
      }
    })
    const likertAverage = indicatorScores.length > 0 ? likertTotal / indicatorScores.length : 0

    // 2. Evaluar la pregunta abierta con IA para obtener score y feedback
    const openAnswerObj = answers.find((a) => a.questionId === skillDefinition.open_question_id)
    const openAnswerText = (openAnswerObj?.value as string) || ""

    const { score: openScore, feedback: openFeedback } = await getOpenQuestionEvaluationFromAI(
      skillDefinition.prompt_score_rubric_text,
      openAnswerText,
    )

    // Añadir el resultado de la pregunta abierta
    const openQuestionInfo = skillDefinition.indicadores_info.find((i) => i.id === skillDefinition.open_question_id)
    indicatorScores.push({
      id: skillDefinition.open_question_id,
      name: openQuestionInfo?.nombre || "Aplicación Práctica",
      score: openScore,
      descripcion_indicador: openQuestionInfo?.descripcion_indicador,
      feedback_especifico: openFeedback, // <-- Aquí añadimos el feedback
    })

    // 3. Calcular la puntuación global ponderada final
    const globalScore = Math.round(
      likertAverage * skillDefinition.scoring_weights.likert + openScore * skillDefinition.scoring_weights.open,
    )

    return NextResponse.json({ indicatorScores, globalScore })
  } catch (error) {
    console.error("[API /api/score] Error en el endpoint:", error)
    return NextResponse.json({ error: "Error interno al calcular las puntuaciones." }, { status: 500 })
  }
}
