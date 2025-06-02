import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import OpenAI from "openai"
import { z } from "zod"

// --- Validation Schemas ---
const IndicatorScoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number().min(0).max(100),
  descripcion_indicador: z.string().optional(),
  feedback_especifico: z.string().optional(),
})

const UserInfoSchema = z.object({
  name: z.string().min(1, "Nombre es requerido"),
  role: z.string().min(1, "Rol es requerido"),
  experience: z.string(),
  projectDescription: z.string().min(1, "Descripción del proyecto es requerida"),
  obstacles: z.string().min(1, "Obstáculos son requeridos"),
  learningObjective: z.string().optional(),
})

const LessonRequestSchema = z.object({
  skillId: z.string().min(1, "skillId es requerido"),
  userInfo: UserInfoSchema,
  indicatorScores: z.array(IndicatorScoreSchema).min(1, "Se requieren puntuaciones de indicadores"),
  globalScore: z.number().min(0).max(100),
  openEndedAnswer: z.string().optional(),
})

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

interface LessonResponsePayload {
  tips: string[]
}

interface ErrorResponse {
  error: string
  details?: string
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
      return NextResponse.json(
        {
          error: "OpenAI API no está configurada para generación de tips.",
          details: "Contacte al administrador del sistema.",
        },
        { status: 500 },
      )
    }

    // Validar entrada
    let requestData
    try {
      const rawData = await request.json()
      requestData = LessonRequestSchema.parse(rawData)
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "Datos de entrada inválidos para generación de tips",
            details: validationError.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
          },
          { status: 400 },
        )
      }
      return NextResponse.json(
        { error: "Error al procesar la solicitud de tips", details: "Formato de datos incorrecto" },
        { status: 400 },
      )
    }

    const { skillId, userInfo, indicatorScores, globalScore, openEndedAnswer } = requestData

    // Cargar definiciones de habilidades
    const definitions = loadSkillDefinitions()
    const skillDefinition = definitions[skillId]

    if (!skillDefinition) {
      return NextResponse.json(
        {
          error: `Habilidad con ID '${skillId}' no encontrada para generación de tips.`,
          details: "Verifique el ID de la habilidad.",
        },
        { status: 404 },
      )
    }

    // Identificar fortalezas y debilidades
    const sortedByScore = [...indicatorScores].sort((a, b) => b.score - a.score)
    const strongest = sortedByScore[0] || { name: "habilidad principal", score: 0 }
    const weakest = sortedByScore[sortedByScore.length - 1] || { name: "área de mejora", score: 0 }

    // Construir el prompt para OpenAI con formato JSON estructurado
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
Genera exactamente 3 tips personalizados. Responde con un JSON en este formato exacto:

{
  "tips": [
    "Tip 1 (Fortaleza): [Reconoce '${strongest.name}' y explica cómo aprovecharla mejor como ${userInfo.role}]",
    "Tip 2 (Oportunidad): [Identifica '${weakest.name}' y ofrece sugerencia específica y accionable]", 
    "Tip 3 (Consejo General): [Consejo motivador y práctico para desarrollar ${skillDefinition.name}]"
  ]
}

Cada tip debe ser una frase completa, natural y orientada a la acción. No uses IDs internos ni puntajes numéricos directamente.`

    // Llamada a OpenAI para generación de tips con formato JSON
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

    // Parsear la respuesta JSON estructurada
    let generatedTips: string[]
    try {
      const parsedResponse = JSON.parse(content)

      if (parsedResponse.tips && Array.isArray(parsedResponse.tips)) {
        generatedTips = parsedResponse.tips
      } else {
        throw new Error("Formato de respuesta inesperado: no se encontró array 'tips'")
      }

      // Validar que tenemos exactamente 3 tips
      if (generatedTips.length !== 3) {
        throw new Error(`Se esperaban 3 tips, pero se recibieron ${generatedTips.length}`)
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

    return NextResponse.json(
      {
        tips: fallbackTips,
        error: "Se generaron tips de respaldo debido a un error técnico",
        details: "Los tips personalizados no estuvieron disponibles temporalmente.",
      },
      { status: 200 },
    )
  }
}
