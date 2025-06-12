import { NextResponse } from "next/server"
import OpenAI from "openai"
import fs from "fs"
import path from "path"

// Definir tipos de datos basados en el uso en skillbooster-mvp.tsx
interface LessonRequestPayload {
  skillId: string
  userInfo: {
    name: string
    role: string
    experience: string
    projectDescription: string
    obstacles: string
  }
  indicatorScores: Array<{
    id: string
    name: string
    score: number
    descripcion_indicador?: string
    feedback_especifico?: string
  }>
  globalScore: number
  openEndedAnswer?: string
}

interface LessonResponsePayload {
  tips: string[]
}

interface SkillDefinition {
  name: string
  rubrica: Record<string, string>
  likert_indicators: string[]
  indicadores_info: Array<{
    id: string
    nombre: string
    descripcion_indicador?: string
  }>
  open_question_id: string
  scoring_weights: { likert: number; open: number }
  prompt_score_rubric_text: string
  prompt_tutor_definition: {
    role: string
    expertise: string
    tone: string
    focus_areas: string[]
    teaching_approach: string
    content_guidelines: string[]
  }
}

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Función para cargar definiciones de habilidades
function loadSkillDefinitions(): Record<string, SkillDefinition> {
  try {
    const filePath = path.join(process.cwd(), "data", "skill_definitions.json")
    const fileContent = fs.readFileSync(filePath, "utf8")
    return JSON.parse(fileContent)
  } catch (error) {
    console.error("Error loading skill definitions:", error)
    throw new Error("Failed to load skill definitions")
  }
}

// Función para reemplazar variables dinámicamente en las directrices
function replacePlaceholders(text: string, skillName: string, userInfo: LessonRequestPayload["userInfo"]): string {
  return text
    .replace(/\$\{skillName\}/g, skillName)
    .replace(/\$\{userInfo\.role\}/g, userInfo.role)
    .replace(/\$\{userInfo\.projectDescription\}/g, userInfo.projectDescription)
}

export async function POST(request: Request) {
  try {
    // Verificar que OpenAI esté configurado
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY no está configurada")
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
    }

    // Extraer datos del cuerpo de la solicitud
    const payload: LessonRequestPayload = await request.json()
    const { skillId, userInfo, indicatorScores, globalScore, openEndedAnswer } = payload

    console.log("Processing lesson request for skill:", skillId)

    // Cargar definiciones de habilidades
    const skillDefinitions = loadSkillDefinitions()
    const skillDefinition = skillDefinitions[skillId]

    if (!skillDefinition) {
      console.error(`Skill definition not found for skillId: ${skillId}`)
      return NextResponse.json({ error: `Skill definition not found for ${skillId}` }, { status: 404 })
    }

    const skillName = skillDefinition.name
    const tutorDefinition = skillDefinition.prompt_tutor_definition

    // Encontrar el indicador con mayor y menor puntuación
    const sortedIndicators = [...indicatorScores].sort((a, b) => b.score - a.score)
    const highestScoreIndicator = sortedIndicators[0]
    const lowestScoreIndicator = sortedIndicators[sortedIndicators.length - 1]

    // Construir el system prompt
    const systemPrompt = `Eres un ${tutorDefinition.role}. ${tutorDefinition.expertise}

Tu tono debe ser: ${tutorDefinition.tone}

Áreas de enfoque:
${tutorDefinition.focus_areas.map((area) => `- ${area}`).join("\n")}

Enfoque de enseñanza: ${tutorDefinition.teaching_approach}`

    // Construir el user prompt con información contextual
    const contentGuidelines = tutorDefinition.content_guidelines[0] || ""
    const processedGuidelines = replacePlaceholders(contentGuidelines, skillName, userInfo)

    const userPrompt = `Información del usuario:
- Nombre: ${userInfo.name}
- Rol: ${userInfo.role}
- Experiencia: ${userInfo.experience} años
- Proyecto actual: ${userInfo.projectDescription}
- Obstáculos principales: ${userInfo.obstacles}

Resultados de la evaluación de ${skillName}:
- Puntuación global: ${globalScore}/100

Puntuaciones por indicador:
${indicatorScores.map((indicator) => `- ${indicator.name}: ${indicator.score}/100`).join("\n")}

Indicador con mayor puntuación (fortaleza): ${highestScoreIndicator.name} (${highestScoreIndicator.score}/100)
Indicador con menor puntuación (oportunidad): ${lowestScoreIndicator.name} (${lowestScoreIndicator.score}/100)

${openEndedAnswer ? `Respuesta a pregunta abierta: ${openEndedAnswer}` : ""}

Instrucciones específicas:
${processedGuidelines}

Por favor, responde ÚNICAMENTE con un objeto JSON válido que contenga exactamente 3 tips en el siguiente formato:
{
  "tips": [
    "Tip 1 sobre la fortaleza principal...",
    "Tip 2 sobre la oportunidad de mejora...",
    "Tip 3 con consejo general..."
  ]
}`

    console.log("Calling OpenAI API...")

    // Llamar a la API de OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1000,
    })

    // Procesar la respuesta
    const responseContent = completion.choices[0]?.message?.content

    if (!responseContent) {
      throw new Error("No response content from OpenAI")
    }

    console.log("OpenAI response received")

    // Parsear la respuesta JSON
    const parsedResponse = JSON.parse(responseContent)

    if (!parsedResponse.tips || !Array.isArray(parsedResponse.tips) || parsedResponse.tips.length !== 3) {
      throw new Error("Invalid response format from OpenAI")
    }

    // Enviar respuesta al frontend
    const response: LessonResponsePayload = {
      tips: parsedResponse.tips,
    }

    console.log("Lesson tips generated successfully")
    return NextResponse.json(response)
  } catch (error: any) {
    console.error("Error in lesson API:", error)

    // Mecanismo de fallback: generar tips genéricos
    const fallbackTips = [
      "Fortaleza: Has demostrado un buen nivel general en esta habilidad. Continúa aplicando lo que ya sabes en situaciones reales para consolidar tu experiencia.",
      "Oportunidad: Identifica las áreas específicas donde puedes mejorar y dedica tiempo regular a practicar esas competencias particulares.",
      "Consejo: Busca oportunidades para aplicar esta habilidad en tu trabajo diario y solicita feedback de colegas o supervisores para acelerar tu desarrollo.",
    ]

    console.log("Using fallback tips due to error")

    return NextResponse.json({ tips: fallbackTips })
  }
}
