import { NextResponse } from "next/server"
import OpenAI from "openai"
import fs from "fs"
import path from "path"
import { PromptOptimizer } from "@/lib/prompt-optimizer"

// --- Tipos ---
interface UserInfo {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
}

interface IndicatorScore {
  id: string
  name: string
  score: number
}

interface PromptDefinition {
  role: string
  expertise: string
  tone: string
  focus_areas: string[]
  teaching_approach: string
  content_guidelines: string[]
}

interface SkillDefinition {
  name: string
  prompt_tutor_definition: PromptDefinition
}

// --- Carga de Definiciones ---
function loadPromptDefinition(skillId: string): { name: string; definition: PromptDefinition } | null {
  try {
    const filePath = path.join(process.cwd(), "data", "skill_definitions.json")
    const fileContent = fs.readFileSync(filePath, "utf8")
    const allDefinitions = JSON.parse(fileContent)
    const skillDefinition = allDefinitions[skillId] as SkillDefinition | undefined

    if (skillDefinition && skillDefinition.prompt_tutor_definition) {
      return {
        name: skillDefinition.name,
        definition: skillDefinition.prompt_tutor_definition,
      }
    }
    return null
  } catch (error) {
    console.error("Error al cargar la definición del prompt:", error)
    return null
  }
}

// --- Configuración OpenAI ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// --- Función para reemplazar placeholders ---
function replacePlaceholders(
  text: string,
  skillName: string,
  userInfo: UserInfo,
  highestIndicatorName: string,
  lowestIndicatorName: string,
): string {
  return text
    .replace(/\$\{skillName\}/g, skillName)
    .replace(/\$\{userInfo\.role\}/g, userInfo.role)
    .replace(/\$\{userInfo\.projectDescription\}/g, userInfo.projectDescription)
    .replace(/\$\{userInfo\.obstacles\}/g, userInfo.obstacles)
    .replace(/\[Nombre Descriptivo del Indicador de Fortaleza\]/g, highestIndicatorName)
    .replace(/\[Nombre Descriptivo del Indicador de Oportunidad\]/g, lowestIndicatorName)
    .replace(/\[mencionar brevemente un obstáculo relevante del usuario si aplica\]/g, userInfo.obstacles)
}

// --- Handler POST Refactorizado ---
export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("La clave de API de OpenAI no está configurada.")
    }

    const { skillId, userInfo, indicatorScores, globalScore, openEndedAnswer } = await request.json()

    const promptData = loadPromptDefinition(skillId)
    if (!promptData) {
      return NextResponse.json(
        { error: `No se encontró la definición de prompt para la habilidad: ${skillId}` },
        { status: 404 },
      )
    }

    const { name: skillName, definition: promptDef } = promptData
    console.log(`[API /api/lesson] Iniciando generación de tips para ${skillName}`)

    // Extract user context for optimization
    const userContext = {
      role: userInfo.role,
      experience: userInfo.experience,
      obstacles: userInfo.obstacles?.split(",") || [],
      projectDescription: userInfo.projectDescription,
    }

    const assessmentResult = {
      score: globalScore,
      strength: indicatorScores.reduce((max, curr) => (curr.score > max.score ? curr : max)).name,
      weakness: indicatorScores.reduce((min, curr) => (curr.score < min.score ? curr : min)).name,
      reasoning: `Assessment completed for ${skillId}`,
    }

    try {
      const optimizedPrompt = PromptOptimizer.createTipsPrompt(skillId, assessmentResult, userContext)

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: optimizedPrompt.prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.4,
        response_format: { type: "json_object" },
      })

      const tips = PromptOptimizer.parseTipsResponse(response.choices[0].message.content || "{}")

      console.log(`[API /api/lesson] Optimized tips generated for ${skillName}`)
      return NextResponse.json({ tips })
    } catch (error) {
      console.error("[API /api/lesson] Error with optimized tips generation:", error)
      // Fallback to original tips if optimization fails
      const fallbackTips = [
        "Fortaleza: Demuestras un sólido entendimiento en tus áreas más fuertes. ¡Sigue así!",
        "Oportunidad: Identificar áreas de mejora es el primer paso para el crecimiento. Enfócate en la práctica deliberada.",
        "Consejo: La consistencia es clave. Dedica tiempo cada semana para aplicar lo aprendido en tu trabajo diario.",
      ]
      return NextResponse.json({ tips: fallbackTips })
    }
  } catch (error) {
    console.error("[API /api/lesson] Error generando tips:", error)
    // Fallback en caso de error de la IA
    const fallbackTips = [
      "Fortaleza: Demuestras un sólido entendimiento en tus áreas más fuertes. ¡Sigue así!",
      "Oportunidad: Identificar áreas de mejora es el primer paso para el crecimiento. Enfócate en la práctica deliberada.",
      "Consejo: La consistencia es clave. Dedica tiempo cada semana para aplicar lo aprendido en tu trabajo diario.",
    ]
    return NextResponse.json({ tips: fallbackTips })
  }
}
