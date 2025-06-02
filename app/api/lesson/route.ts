import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import OpenAI from "openai"

// --- Tipos ---
interface IndicatorScore {
  id: string
  name: string
  score: number
  descripcion_indicador?: string
  feedback_especifico?: string
}

interface UserInfo {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
  learningObjective?: string
}

interface SkillDefinition {
  name: string
  rubrica: Record<string, string>
  likert_indicators: string[]
  indicadores_info: Array<{ id: string; nombre: string; descripcion_indicador?: string }>
  open_question_id: string
  scoring_weights: {
    likert: number
    open: number
  }
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

interface AllSkillDefinitions {
  [key: string]: SkillDefinition
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
  console.warn("OPENAI_API_KEY no está configurada. La API de generación de tips no funcionará correctamente.")
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
    console.error("Error al cargar las definiciones de habilidades para generación de tips:", error)
    throw new Error("No se pudieron cargar las definiciones de habilidades.")
  }
}

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<LessonResponsePayload | ErrorResponse>> {
  console.log("API /api/lesson iniciada para generación de tips personalizados")

  try {
    if (!openai) {
      return NextResponse.json({ error: "OpenAI API no está configurada para generación de tips." }, { status: 500 })
    }

    const { skillId, userInfo, indicatorScores, globalScore, openEndedAnswer } =
      (await request.json()) as LessonRequestPayload

    // Validar datos requeridos
    if (!skillId || !userInfo || !indicatorScores || globalScore === undefined) {
      return NextResponse.json({ error: "Datos requeridos faltantes en la solicitud de tips." }, { status: 400 })
    }

    // Cargar definiciones de habilidades
    const definitions = loadSkillDefinitions()
    const skillDefinition = definitions[skillId]

    if (!skillDefinition) {
      return NextResponse.json(
        { error: `Habilidad con ID '${skillId}' no encontrada para generación de tips.` },
        { status: 404 },
      )
    }

    // Identificar fortalezas y debilidades
    const sortedByScore = [...indicatorScores].sort((a, b) => b.score - a.score)
    const strongest = sortedByScore[0] || { name: "habilidad principal", score: 0 }
    const weakest = sortedByScore[sortedByScore.length - 1] || { name: "área de mejora", score: 0 }

    // Construir el prompt para OpenAI basado en las content_guidelines
    const systemPrompt = `Eres un ${skillDefinition.prompt_tutor_definition.role} especializado en ${skillDefinition.name}.

${skillDefinition.prompt_tutor_definition.expertise}

Tu tono debe ser: ${skillDefinition.prompt_tutor_definition.tone}

Áreas de enfoque principales:
${skillDefinition.prompt_tutor_definition.focus_areas.map((area) => `- ${area}`).join("\n")}

Enfoque de enseñanza: ${skillDefinition.prompt_tutor_definition.teaching_approach}

INSTRUCCIONES CRÍTICAS PARA GENERACIÓN DE TIPS: ${skillDefinition.prompt_tutor_definition.content_guidelines[0]}`

    const userPrompt = `# Contexto del Usuario
- Nombre: ${userInfo.name}
- Rol: ${userInfo.role}
- Experiencia: ${userInfo.experience} años
- Proyecto/Contexto: ${userInfo.projectDescription}
- Obstáculos principales: ${userInfo.obstacles}
${userInfo.learningObjective ? `- Objetivo de aprendizaje específico: ${userInfo.learningObjective}` : ""}

# Resultados de Evaluación en ${skillDefinition.name}
- Puntuación Global: ${globalScore}/100
- Fortaleza Principal: "${strongest.name}" (${strongest.score}/100)
- Área de Oportunidad Principal: "${weakest.name}" (${weakest.score}/100)

# Indicadores Detallados:
${indicatorScores.map((indicator) => `- ${indicator.name}: ${indicator.score}/100`).join("\n")}

${openEndedAnswer ? `# Respuesta a Pregunta Abierta:\n"${openEndedAnswer}"` : ""}

# Tu Tarea:
Genera exactamente 3 tips como un array JSON válido de strings. Cada tip debe ser una frase completa, natural y orientada a la acción. No uses los IDs internos de los indicadores. No incluyas los puntajes numéricos directamente en el texto del tip.

Estructura requerida:
1. **Tip 1 (Fortaleza):** Reconoce la fortaleza principal "${strongest.name}" y explica cómo puede aprovecharla mejor en su contexto como ${userInfo.role}.
2. **Tip 2 (Oportunidad):** Identifica el área de mejora "${weakest.name}" y ofrece una sugerencia específica y accionable, conectándola con sus obstáculos si es relevante.
3. **Tip 3 (Consejo General):** Proporciona un consejo motivador y práctico para seguir desarrollando ${skillDefinition.name} en su contexto profesional.

Responde ÚNICAMENTE con un array JSON válido de 3 strings, sin texto adicional.`

    // Llamada a OpenAI para generación de tips
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("No se recibió respuesta de OpenAI para generación de tips")
    }

    // Parsear la respuesta JSON
    let generatedTips: string[]
    try {
      const parsedResponse = JSON.parse(content)

      // Intentar extraer el array de tips de diferentes estructuras posibles
      if (Array.isArray(parsedResponse)) {
        generatedTips = parsedResponse
      } else if (parsedResponse.tips && Array.isArray(parsedResponse.tips)) {
        generatedTips = parsedResponse.tips
      } else if (parsedResponse.array && Array.isArray(parsedResponse.array)) {
        generatedTips = parsedResponse.array
      } else {
        // Si no encontramos un array, intentar extraer valores del objeto
        const values = Object.values(parsedResponse).filter((value) => typeof value === "string")
        if (values.length >= 3) {
          generatedTips = values.slice(0, 3) as string[]
        } else {
          throw new Error("Estructura de respuesta inesperada de OpenAI para tips")
        }
      }

      // Validar que tenemos exactamente 3 tips
      if (!generatedTips || generatedTips.length !== 3) {
        throw new Error(`Se esperaban 3 tips, pero se recibieron ${generatedTips?.length || 0}`)
      }

      // Validar que todos los tips sean strings no vacíos
      const validTips = generatedTips.filter((tip) => typeof tip === "string" && tip.trim().length > 0)
      if (validTips.length !== 3) {
        throw new Error("Algunos tips generados están vacíos o no son válidos")
      }

      generatedTips = validTips
    } catch (parseError) {
      console.error("Error al parsear la respuesta de OpenAI para tips:", parseError)
      console.error("Contenido recibido:", content)

      // Fallback: generar tips básicos basados en los datos disponibles
      generatedTips = [
        `Fortaleza: Tu ${strongest.name} es destacable, mantén desarrollando esta capacidad en tu rol como ${userInfo.role}.`,
        `Oportunidad: Enfócate en mejorar tu ${weakest.name} para un desarrollo más equilibrado en ${skillDefinition.name}.`,
        `Consejo: Practica regularmente las habilidades de ${skillDefinition.name} en tu contexto de ${userInfo.projectDescription}.`,
      ]
    }

    console.log(`Tips generados exitosamente para la habilidad ${skillDefinition.name}`)
    return NextResponse.json({ tips: generatedTips }, { status: 200 })
  } catch (error) {
    console.error("Error en la generación de tips personalizados:", error)

    // Fallback en caso de error completo
    const fallbackTips = [
      "Fortaleza: Continúa desarrollando tus puntos fuertes identificados en la evaluación.",
      "Oportunidad: Enfócate en las áreas que mostraron mayor potencial de mejora.",
      "Consejo: Practica regularmente y busca oportunidades para aplicar estas habilidades en tu trabajo diario.",
    ]

    return NextResponse.json({ tips: fallbackTips }, { status: 200 })
  }
}
