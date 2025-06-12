import { NextResponse } from "next/server"
import OpenAI from "openai"
import fs from "fs"
import path from "path"

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

    // Construcción del Prompt
    const systemPrompt = `Eres un ${promptDef.role}. Tu especialidad es ${promptDef.expertise}. Tu tono es ${promptDef.tone}. Te enfocas en: ${promptDef.focus_areas.join(", ")}. Tu enfoque de enseñanza es: ${promptDef.teaching_approach}. Debes generar una respuesta JSON que contenga un array de 3 strings en la clave "tips".`

    const highestScoreIndicator = [...indicatorScores].sort((a, b) => b.score - a.score)[0]
    const lowestScoreIndicator = [...indicatorScores].sort((a, b) => a.score - b.score)[0]

    let guidelines = promptDef.content_guidelines.join(" ")
    guidelines = replacePlaceholders(
      guidelines,
      skillName,
      userInfo,
      highestScoreIndicator.name,
      lowestScoreIndicator.name,
    )

    const userPrompt = `Basado en el siguiente contexto de un usuario y usando las directrices proporcionadas, genera 3 tips personalizados.
    Contexto del Usuario:
    - Nombre: ${userInfo.name}
    - Rol: ${userInfo.role}
    - Puntuación Global en ${skillName}: ${globalScore}/100
    - Puntuaciones por Indicador: ${indicatorScores.map((i) => `${i.name}: ${i.score}/100`).join(", ")}
    - Obstáculos Mencionados: ${userInfo.obstacles}
    ${openEndedAnswer ? `- Respuesta a pregunta abierta: "${openEndedAnswer}"` : ""}

    Directrices para generar los tips: "${guidelines}"
    
    Genera únicamente un objeto JSON con la clave "tips", que contenga un array de 3 strings. No incluyas texto adicional fuera del JSON.`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    })

    const content = response.choices[0].message.content
    const parsedContent = JSON.parse(content || "{}")

    if (!parsedContent.tips || !Array.isArray(parsedContent.tips) || parsedContent.tips.length !== 3) {
      throw new Error("La respuesta de la IA no contiene los 3 tips esperados.")
    }

    console.log(`[API /api/lesson] Tips generados exitosamente para ${skillName}.`)
    return NextResponse.json({ tips: parsedContent.tips })
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
