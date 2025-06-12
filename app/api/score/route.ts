import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

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

// --- Cálculo Local de Pregunta Abierta ---
function calculateOpenQuestionScore(answer: string): number {
  const length = answer.trim().length

  if (length >= 300) return 90
  if (length >= 200) return 80
  if (length >= 150) return 70
  if (length >= 100) return 60
  if (length >= 50) return 50
  if (length >= 20) return 40
  return 30
}

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<ScoreResponsePayload | ErrorResponse>> {
  try {
    const { skillId, answers } = (await request.json()) as ScoreRequestPayload
    console.log(`[API /api/score] Iniciando cálculo de puntuaciones para skillId: ${skillId}`)

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

        if (!indicadorInfo) {
          console.error(
            `Error: No se encontró indicadorInfo para el ID: ${indicator} en la habilidad: ${skillDefinition.name}. Verifique la consistencia de datos en skill_definitions.json.`,
          )
        }

        // Usar nombre descriptivo o un fallback claro (no el ID crudo)
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

    // Procesar respuesta abierta con cálculo local
    const openAnswer = answers.find((a) => a.questionId === skillDefinition.open_question_id)
    let openScore = 0

    if (openAnswer && typeof openAnswer.value === "string" && openAnswer.value.trim()) {
      openScore = calculateOpenQuestionScore(openAnswer.value)
      console.log(`[API /api/score] Puntuación de pregunta abierta calculada localmente: ${openScore}`)
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
      console.warn(
        `ADVERTENCIA: No se encontró información descriptiva para la pregunta abierta ${skillDefinition.open_question_id} en la habilidad ${skillDefinition.name}. Verifique la consistencia de datos en skill_definitions.json.`,
      )
    }

    likertScores.push({
      id: skillDefinition.open_question_id,
      name: openQuestionIndicadorInfo ? openQuestionIndicadorInfo.nombre : "Aplicación Práctica",
      score: openScore,
      descripcion_indicador:
        openQuestionIndicadorInfo?.descripcion_indicador ||
        "Evaluación de tu capacidad para aplicar esta habilidad en una situación práctica concreta.",
    })

    console.log(`[API /api/score] Cálculo de puntuaciones completado. Puntuación global: ${globalScore}`)

    return NextResponse.json({ indicatorScores: likertScores, globalScore }, { status: 200 })
  } catch (error) {
    console.error("Error al calcular la puntuación:", error)
    return NextResponse.json({ error: "Error al calcular la puntuación." }, { status: 500 })
  }
}
