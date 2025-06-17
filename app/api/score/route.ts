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

// --- Mapeo Likert (Sin cambios) ---
function mapLikertToScore(value: number): number {
  const mapping = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 }
  return mapping[value as keyof typeof mapping] || 0
}

// --- NUEVA Función para calificar la pregunta abierta con IA ---
async function getOpenQuestionScoreFromAI(rubric: string, answer: string): Promise<number> {
  // Si no hay respuesta del usuario, devolver una puntuación baja.
  if (!answer || answer.trim().length < 10) {
    return 20
  }

  // Si la API key no está disponible, usar un fallback local.
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY no encontrada. Usando fallback para score de pregunta abierta.")
    return 60 // Un score neutral de fallback
  }

  try {
    const systemPrompt =
      "Eres un evaluador experto y objetivo. Tu única función es analizar una respuesta de un usuario basándote estrictamente en una rúbrica y devolver una puntuación numérica en formato JSON. No debes añadir explicaciones ni texto adicional, solo el objeto JSON."

    const userPrompt = `Por favor, evalúa la siguiente respuesta de un usuario basándote en la rúbrica proporcionada.
    
    RÚBRICA DE EVALUACIÓN:
    ---
    ${rubric}
    ---
    
    RESPUESTA DEL USUARIO:
    ---
    ${answer}
    ---
    
    Basándote únicamente en la rúbrica, devuelve un objeto JSON con una única clave "score", que contenga un número entero entre 0 y 100. Ejemplo: {"score": 85}`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Baja temperatura para una evaluación más consistente.
    })

    const content = response.choices[0].message.content
    if (content) {
      const parsed = JSON.parse(content)
      if (typeof parsed.score === "number" && parsed.score >= 0 && parsed.score <= 100) {
        console.log(`[IA Score] Puntuación de la IA para pregunta abierta: ${parsed.score}`)
        return parsed.score
      }
    }
    // Si el formato es incorrecto, devolver una puntuación de fallback.
    return 65
  } catch (error) {
    console.error("Error en la llamada a OpenAI para calificar pregunta abierta:", error)
    return 60 // Fallback en caso de error de la API.
  }
}

// --- Handler POST Refactorizado (Lógica Híbrida) ---
export async function POST(request: Request): Promise<NextResponse<ScoreResponsePayload | ErrorResponse>> {
  try {
    const { skillId, answers } = (await request.json()) as ScoreRequestPayload
    console.log(`[API /api/score] Iniciando cálculo HÍBRIDO para skillId: ${skillId}`)

    const definitions = loadSkillDefinitions()
    const skillDefinition = definitions[skillId]

    if (!skillDefinition) {
      return NextResponse.json({ error: "Habilidad no encontrada." }, { status: 404 })
    }

    // 1. Calcular puntuaciones Likert localmente
    const indicatorScores: IndicatorScore[] = []
    let likertTotal = 0
    for (const indicatorId of skillDefinition.likert_indicators) {
      const answer = answers.find((a) => a.questionId === indicatorId)
      if (answer && typeof answer.value === "number") {
        const score = mapLikertToScore(answer.value)
        const indicadorInfo = skillDefinition.indicadores_info.find((info) => info.id === indicatorId)
        indicatorScores.push({
          id: indicatorId,
          name: indicadorInfo?.nombre || `Indicador ${indicatorId}`,
          score: score,
          descripcion_indicador: indicadorInfo?.descripcion_indicador,
        })
        likertTotal += score
      }
    }
    const likertAverage = indicatorScores.length > 0 ? likertTotal / indicatorScores.length : 0
    console.log(`[API /api/score] Puntuación promedio Likert (local): ${likertAverage.toFixed(2)}`)

    // 2. Calificar la pregunta abierta usando IA y la rúbrica
    const openAnswerObj = answers.find((a) => a.questionId === skillDefinition.open_question_id)
    const openAnswerText = (openAnswerObj?.value as string) || ""

    const openScore = await getOpenQuestionScoreFromAI(skillDefinition.prompt_score_rubric_text, openAnswerText)

    // Añadir el resultado de la pregunta abierta a la lista de puntuaciones
    const openQuestionIndicadorInfo = skillDefinition.indicadores_info.find(
      (info) => info.id === skillDefinition.open_question_id,
    )
    indicatorScores.push({
      id: skillDefinition.open_question_id,
      name: openQuestionIndicadorInfo?.nombre || "Aplicación Práctica",
      score: openScore,
      descripcion_indicador:
        openQuestionIndicadorInfo?.descripcion_indicador ||
        "Capacidad para aplicar la habilidad en un escenario práctico.",
    })

    // 3. Calcular la puntuación global ponderada final
    const globalScore = Math.round(
      likertAverage * skillDefinition.scoring_weights.likert + openScore * skillDefinition.scoring_weights.open,
    )

    console.log(`[API /api/score] Cálculo HÍBRIDO completado. Score global final: ${globalScore}`)

    return NextResponse.json({ indicatorScores, globalScore })
  } catch (error) {
    console.error("[API /api/score] Error durante el cálculo híbrido:", error)
    return NextResponse.json({ error: "Error al calcular las puntuaciones." }, { status: 500 })
  }
}
