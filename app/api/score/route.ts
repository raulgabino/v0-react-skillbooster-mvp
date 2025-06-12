import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

// --- Tipos (Mantenerlos para la estructura de datos) ---
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

// --- Carga de Definiciones (Sin cambios) ---
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

// --- NUEVA Función de Puntuación Local para Pregunta Abierta ---
function scoreOpenAnswerLocally(answerText: string): number {
  if (!answerText || typeof answerText !== "string" || answerText.trim().length === 0) {
    return 20
  }
  const length = answerText.trim().length
  if (length > 250) return 100
  if (length > 150) return 80
  if (length > 50) return 60
  return 40
}

// --- Handler POST Refactorizado ---
export async function POST(request: Request) {
  console.log(`[API /api/score] Iniciando cálculo de puntuación local.`)
  try {
    const { skillId, answers } = (await request.json()) as ScoreRequestPayload

    const definitions = loadSkillDefinitions()
    // Ajuste para buscar por ID de skill, no por nombre transformado
    const skillDefinition = definitions[skillId]

    if (!skillDefinition) {
      return NextResponse.json({ error: "Habilidad no encontrada." }, { status: 404 })
    }

    // 1. Procesar respuestas Likert
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

    // 2. Procesar respuesta abierta LOCALMENTE
    const openAnswer = answers.find((a) => a.questionId === skillDefinition.open_question_id)
    const openAnswerText = (openAnswer?.value as string) || ""
    const openScore = scoreOpenAnswerLocally(openAnswerText)

    const openQuestionIndicadorInfo = skillDefinition.indicadores_info.find(
      (info) => info.id === skillDefinition.open_question_id,
    )

    // Añadir la puntuación de la pregunta abierta a la lista de indicadores
    indicatorScores.push({
      id: skillDefinition.open_question_id,
      name: openQuestionIndicadorInfo?.nombre || "Aplicación Práctica",
      score: openScore,
      descripcion_indicador:
        openQuestionIndicadorInfo?.descripcion_indicador ||
        "Capacidad para aplicar la habilidad en un escenario práctico.",
    })

    // 3. Calcular puntuación global ponderada
    const globalScore = Math.round(
      likertAverage * skillDefinition.scoring_weights.likert + openScore * skillDefinition.scoring_weights.open,
    )

    console.log(`[API /api/score] Cálculo local completado para ${skillId}. Score global: ${globalScore}`)

    return NextResponse.json({ indicatorScores, globalScore })
  } catch (error) {
    console.error("[API /api/score] Error durante el cálculo local:", error)
    return NextResponse.json({ error: "Error al calcular las puntuaciones." }, { status: 500 })
  }
}
