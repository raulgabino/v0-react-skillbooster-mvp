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

// --- Configuración de OpenAI (con fallback) ---
let openai: OpenAI | null = null

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
} else {
  console.warn("OPENAI_API_KEY no encontrada. Usando fallback para scoring.")
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
  const mapping = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 }
  return mapping[value as keyof typeof mapping] || 0
}

// --- Función para calificar pregunta abierta (con fallback) ---
async function getOpenQuestionScoreFromAI(rubric: string, answer: string): Promise<number> {
  // Si no hay respuesta del usuario, devolver una puntuación baja
  if (!answer || answer.trim().length < 10) {
    return 20
  }

  // Si no hay OpenAI disponible, usar algoritmo de fallback
  if (!openai) {
    console.log("Usando algoritmo de fallback para scoring de pregunta abierta")
    return calculateFallbackScore(answer)
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un evaluador experto. Analiza la respuesta y devuelve un JSON con el score de 0-100.",
        },
        {
          role: "user",
          content: `Evalúa esta respuesta según la rúbrica: "${rubric}"\n\nRespuesta: "${answer}"\n\nDevuelve JSON: {"score": <número 0-100>}`,
        },
      ],
      max_tokens: 100,
      temperature: 0.3,
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content || '{"score": 60}')
    return Math.max(0, Math.min(100, result.score || 60))
  } catch (error) {
    console.error("Error en scoring con OpenAI, usando fallback:", error)
    return calculateFallbackScore(answer)
  }
}

// --- Algoritmo de fallback para scoring ---
function calculateFallbackScore(answer: string): number {
  const length = answer.trim().length
  const words = answer.trim().split(/\s+/).length

  // Criterios básicos de evaluación
  let score = 30 // Base score

  // Longitud de la respuesta
  if (length > 200) score += 20
  else if (length > 100) score += 15
  else if (length > 50) score += 10

  // Número de palabras
  if (words > 50) score += 15
  else if (words > 25) score += 10
  else if (words > 10) score += 5

  // Presencia de palabras clave de calidad
  const qualityKeywords = [
    "estrategia",
    "planificación",
    "equipo",
    "comunicación",
    "objetivo",
    "proceso",
    "análisis",
    "solución",
    "implementar",
    "evaluar",
    "mejorar",
    "desarrollar",
    "gestionar",
    "coordinar",
    "colaborar",
  ]

  const lowerAnswer = answer.toLowerCase()
  const keywordCount = qualityKeywords.filter((keyword) => lowerAnswer.includes(keyword)).length

  score += Math.min(keywordCount * 3, 20)

  // Estructura (presencia de puntos, pasos, etc.)
  if (answer.includes("1.") || answer.includes("•") || answer.includes("-")) {
    score += 10
  }

  return Math.max(20, Math.min(100, score))
}

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<ScoreResponsePayload | ErrorResponse>> {
  try {
    const { skillId, answers } = (await request.json()) as ScoreRequestPayload
    console.log(`[API /api/score] Iniciando cálculo para skillId: ${skillId}`)

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
    console.log(`[API /api/score] Puntuación promedio Likert: ${likertAverage.toFixed(2)}`)

    // 2. Calificar la pregunta abierta
    const openAnswerObj = answers.find((a) => a.questionId === skillDefinition.open_question_id)
    const openAnswerText = (openAnswerObj?.value as string) || ""

    const openScore = await getOpenQuestionScoreFromAI(skillDefinition.prompt_score_rubric_text, openAnswerText)

    // Añadir el resultado de la pregunta abierta
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

    console.log(`[API /api/score] Score global final: ${globalScore}`)

    return NextResponse.json({ indicatorScores, globalScore })
  } catch (error) {
    console.error("[API /api/score] Error durante el cálculo:", error)
    return NextResponse.json({ error: "Error al calcular las puntuaciones." }, { status: 500 })
  }
}
