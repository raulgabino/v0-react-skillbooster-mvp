import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import OpenAI from "openai"

// --- Tipos ---
interface IndicadorInfo {
  id: string
  nombre: string
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

        likertScores.push({
          id: indicator,
          name: indicatorName,
          score,
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
    })

    return NextResponse.json({
      indicatorScores: likertScores,
      globalScore,
    })
  } catch (error) {
    console.error("Error al calcular la puntuación:", error)
    return NextResponse.json({ error: "Error al calcular la puntuación." }, { status: 500 })
  }
}
