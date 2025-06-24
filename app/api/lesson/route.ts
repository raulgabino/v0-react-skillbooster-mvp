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

// --- Configuración OpenAI (con fallback) ---
let openai: OpenAI | null = null

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
} else {
  console.warn("OPENAI_API_KEY no encontrada. Usando tips de fallback.")
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

// --- Función para generar tips de fallback ---
function generateFallbackTips(
  skillName: string,
  userInfo: UserInfo,
  indicatorScores: IndicatorScore[],
  globalScore: number,
): string[] {
  // Encontrar fortaleza y debilidad
  const sortedScores = [...indicatorScores].sort((a, b) => b.score - a.score)
  const strength = sortedScores[0]?.name || "tu desempeño general"
  const weakness = sortedScores[sortedScores.length - 1]?.name || "áreas de mejora"

  const tips = [
    `Fortaleza: Tu ${strength.toLowerCase()} es un punto fuerte que puedes aprovechar en tu rol como ${userInfo.role}. Continúa desarrollando esta habilidad y úsala como base para mejorar otras áreas.`,

    `Oportunidad: Enfócate en desarrollar ${weakness.toLowerCase()} para potenciar tu desempeño en ${skillName}. ${userInfo.obstacles ? `Esto te ayudará especialmente con ${userInfo.obstacles.toLowerCase()}.` : "Dedica tiempo específico a practicar esta área."}`,

    `Consejo: Con una puntuación de ${globalScore}/100 en ${skillName}, tienes una base sólida para crecer. ${globalScore >= 70 ? "Mantén tu excelente nivel y busca oportunidades para mentorear a otros." : globalScore >= 50 ? "Enfócate en aplicar consistentemente lo que sabes y busca feedback regular." : "Considera tomar un curso o buscar un mentor para acelerar tu desarrollo."}`,
  ]

  return tips
}

// --- Handler POST ---
export async function POST(request: Request) {
  try {
    const { skillId, userInfo, indicatorScores, globalScore, openEndedAnswer } = await request.json()

    const promptData = loadPromptDefinition(skillId)
    if (!promptData) {
      return NextResponse.json(
        { error: `No se encontró la definición de prompt para la habilidad: ${skillId}` },
        { status: 404 },
      )
    }

    const { name: skillName } = promptData
    console.log(`[API /api/lesson] Generando tips para ${skillName}`)

    // Si no hay OpenAI, usar fallback
    if (!openai) {
      console.log("Usando tips de fallback")
      const fallbackTips = generateFallbackTips(skillName, userInfo, indicatorScores, globalScore)
      return NextResponse.json({ tips: fallbackTips })
    }

    // Intentar usar OpenAI
    try {
      const sortedScores = [...indicatorScores].sort((a, b) => b.score - a.score)
      const strength = sortedScores[0]?.name || "desempeño general"
      const weakness = sortedScores[sortedScores.length - 1]?.name || "áreas de mejora"

      const prompt = `Como experto en ${skillName}, genera 3 tips personalizados para ${userInfo.name} (${userInfo.role}):

Puntuación: ${globalScore}/100
Fortaleza: ${strength}
Área de mejora: ${weakness}
Obstáculos: ${userInfo.obstacles}
Proyecto: ${userInfo.projectDescription}

Devuelve JSON con formato: {"tips": ["tip1", "tip2", "tip3"]}

Los tips deben ser:
1. Específicos para su rol y contexto
2. Accionables y prácticos
3. Motivadores pero realistas`

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.4,
        response_format: { type: "json_object" },
      })

      const result = JSON.parse(response.choices[0].message.content || '{"tips": []}')
      const tips = result.tips || generateFallbackTips(skillName, userInfo, indicatorScores, globalScore)

      console.log(`[API /api/lesson] Tips generados exitosamente para ${skillName}`)
      return NextResponse.json({ tips })
    } catch (aiError) {
      console.error("[API /api/lesson] Error con OpenAI, usando fallback:", aiError)
      const fallbackTips = generateFallbackTips(skillName, userInfo, indicatorScores, globalScore)
      return NextResponse.json({ tips: fallbackTips })
    }
  } catch (error) {
    console.error("[API /api/lesson] Error generando tips:", error)
    const fallbackTips = [
      "Fortaleza: Demuestras un sólido entendimiento en tus áreas más fuertes. ¡Sigue así!",
      "Oportunidad: Identificar áreas de mejora es el primer paso para el crecimiento. Enfócate en la práctica deliberada.",
      "Consejo: La consistencia es clave. Dedica tiempo cada semana para aplicar lo aprendido en tu trabajo diario.",
    ]
    return NextResponse.json({ tips: fallbackTips })
  }
}
