import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import OpenAI from "openai"

// --- Tipos ---
interface UserInfo {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
}

interface TutorPromptDefinition {
  role: string
  expertise: string
  tone: string
  focus_areas: string[]
  teaching_approach: string
  content_guidelines?: string[]
}

interface IndicadorInfo {
  id: string
  nombre: string
}

interface SkillDefinition {
  name: string
  rubrica: Record<string, string>
  indicadores_info: IndicadorInfo[]
  prompt_tutor_definition: TutorPromptDefinition
}

interface AllSkillDefinitions {
  [key: string]: SkillDefinition
}

interface IndicatorScore {
  id: string
  name: string
  score: number
}

interface LessonRequestPayload {
  skillId: string
  userInfo: UserInfo
  indicatorScores: IndicatorScore[]
  globalScore: number
  openEndedAnswer?: string
}

interface LessonResponsePayload {
  tips: string[]
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
  console.warn("OPENAI_API_KEY no está configurada. La API de lecciones no funcionará correctamente.")
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

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<LessonResponsePayload | ErrorResponse>> {
  try {
    if (!openai) {
      return NextResponse.json({ error: "OpenAI API no está configurada." }, { status: 500 })
    }

    const { skillId, userInfo, indicatorScores, globalScore, openEndedAnswer } =
      (await request.json()) as LessonRequestPayload

    // Cargar definiciones de habilidades
    const definitions = loadSkillDefinitions()
    const skillKey = Object.keys(definitions).find(
      (key) => definitions[key].name.toLowerCase().replace(/\s+/g, "_") === skillId,
    )

    if (!skillKey) {
      return NextResponse.json({ error: "Habilidad no encontrada." }, { status: 404 })
    }

    const skillDefinition = definitions[skillKey]

    // Identificar áreas de mejora (indicadores con puntuaciones más bajas)
    const sortedScores = [...indicatorScores].sort((a, b) => a.score - b.score)
    const lowScoreIndicators = sortedScores.slice(0, 3).map((score) => {
      return {
        key: score.id,
        name: score.name,
        score: score.score,
      }
    })

    // Identificar fortalezas (indicadores con puntuaciones más altas)
    const highScoreIndicators = [...indicatorScores]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((score) => {
        return {
          key: score.id,
          name: score.name,
          score: score.score,
        }
      })

    // Construir prompt para el tutor
    const tutorDef = skillDefinition.prompt_tutor_definition
    const contentGuidelines = tutorDef.content_guidelines || []

    const promptContent = `
# Contexto del Usuario
- Nombre: ${userInfo.name}
- Rol: ${userInfo.role}
- Experiencia: ${userInfo.experience || "No especificada"}
- Descripción del proyecto: ${userInfo.projectDescription}
- Obstáculos: ${userInfo.obstacles}
${openEndedAnswer ? `- Respuesta a pregunta abierta: "${openEndedAnswer}"` : ""}

# Evaluación de ${skillDefinition.name}
- Puntuación global: ${globalScore}/100

# Fortalezas identificadas (puntuaciones más altas):
${highScoreIndicators.map((ind) => `- ${ind.name} (${ind.score}/100)`).join("\n")}

# Áreas de mejora identificadas (puntuaciones más bajas):
${lowScoreIndicators.map((ind) => `- ${ind.name} (${ind.score}/100)`).join("\n")}

# Todos los indicadores evaluados:
${indicatorScores.map((ind) => `- ${ind.name}: ${ind.score}/100`).join("\n")}

# Tu tarea
Actúa como un ${tutorDef.role} con la siguiente expertise: "${tutorDef.expertise}"

${contentGuidelines.join("\n")}

Usa un tono ${tutorDef.tone}
Enfócate en: ${tutorDef.focus_areas.join(", ")}
Enfoque de enseñanza: ${tutorDef.teaching_approach}

Responde en formato JSON con la siguiente estructura exacta:
{
  "tips": ["Tip 1 (Fortaleza)", "Tip 2 (Oportunidad)", "Tip 3 (Consejo)"]
}
`

    // Llamar a OpenAI para generar tips
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un tutor experto que genera recomendaciones personalizadas en formato JSON.",
        },
        {
          role: "user",
          content: promptContent,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    })

    const responseContent = response.choices[0]?.message?.content || ""

    try {
      const parsedResponse = JSON.parse(responseContent) as LessonResponsePayload
      return NextResponse.json(parsedResponse)
    } catch (parseError) {
      console.error("Error al parsear la respuesta JSON de OpenAI:", parseError)
      return NextResponse.json({ error: "Error al generar tips." }, { status: 500 })
    }
  } catch (error) {
    console.error("Error al generar tips:", error)
    return NextResponse.json({ error: "Error al generar tips." }, { status: 500 })
  }
}
