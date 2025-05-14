import { NextResponse } from "next/server"
import OpenAI from "openai"

// --- Tipos ---
interface UserInfo {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
  learningObjective?: string
}

interface IndicatorScore {
  id: string
  name: string
  score: number
}

interface ConversationMessage {
  sender: "mentor" | "user"
  text: string
}

interface MentorSessionRequestPayload {
  skillId: string
  skillName: string
  globalScore: number
  indicatorScores: IndicatorScore[]
  openEndedAnswer?: string
  userProfile?: UserInfo
  conversationHistory: ConversationMessage[]
  userResponse?: string
  currentMentorPhase: string
}

interface MentorSessionResponsePayload {
  mentorMessage: string
  nextMentorPhase: string
  exerciseScore?: number
  exerciseScoreJustification?: string
}

interface ErrorResponse {
  error: string
}

interface PreProcessedOpenAnswer {
  keyThemes: string[]
  specificProblemsMentioned: string[]
}

// --- Configuración OpenAI ---
const openaiApiKey = process.env.OPENAI_API_KEY
let openai: OpenAI | null = null

if (openaiApiKey) {
  openai = new OpenAI({
    apiKey: openaiApiKey,
  })
} else {
  console.warn("OPENAI_API_KEY no está configurada. La API de mentoría no funcionará correctamente.")
}

// --- Helper para extraer JSON de la respuesta ---
function extractJsonFromText(text: string): { json: any; cleanText: string } | null {
  try {
    // Intentar diferentes patrones para encontrar JSON
    // 1. Buscar un objeto JSON completo
    const jsonRegex = /\{[\s\S]*\}/
    const jsonMatch = text.match(jsonRegex)

    if (!jsonMatch) return null

    // Intentar parsear el JSON encontrado
    try {
      const jsonString = jsonMatch[0]
      const json = JSON.parse(jsonString)

      // Verificar que el JSON tiene los campos esperados
      if (json && (json.exerciseScore !== undefined || json.exerciseScoreJustification !== undefined)) {
        // Eliminar el JSON del texto original
        const cleanText = text.replace(jsonString, "").trim()
        return { json, cleanText }
      }
    } catch (parseError) {
      console.log("Error al parsear JSON, intentando con regex más específico:", parseError)
    }

    // 2. Intentar con un regex más específico para nuestro formato
    const specificRegex = /\{\s*"exerciseScore"\s*:\s*(\d+)\s*,\s*"exerciseScoreJustification"\s*:\s*"([^"]*)"\s*\}/
    const specificMatch = text.match(specificRegex)

    if (specificMatch) {
      const score = Number.parseInt(specificMatch[1], 10)
      const justification = specificMatch[2]

      const json = {
        exerciseScore: score,
        exerciseScoreJustification: justification,
      }

      // Eliminar el JSON del texto original
      const cleanText = text.replace(specificMatch[0], "").trim()
      return { json, cleanText }
    }

    // 3. Último recurso: buscar valores numéricos y texto que parezcan ser score y justificación
    const scoreRegex = /(\d{1,3})\/100/
    const scoreMatch = text.match(scoreRegex)

    if (scoreMatch) {
      const score = Number.parseInt(scoreMatch[1], 10)
      // Extraer algunas frases después del score como justificación
      const parts = text.split(scoreMatch[0])
      let justification = ""

      if (parts.length > 1) {
        // Tomar hasta 200 caracteres después del score como justificación
        justification = parts[1].trim().substring(0, 200)
      }

      const json = {
        exerciseScore: score,
        exerciseScoreJustification: justification || "Evaluación basada en la respuesta al escenario.",
      }

      return { json, cleanText: text }
    }

    return null
  } catch (error) {
    console.error("Error al extraer JSON del texto:", error)
    return null
  }
}

// --- Función para pre-procesar la respuesta abierta ---
async function preProcessOpenAnswer(openEndedAnswer: string): Promise<PreProcessedOpenAnswer> {
  if (!openai || !openEndedAnswer) {
    return {
      keyThemes: [],
      specificProblemsMentioned: [],
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un asistente analítico que extrae información estructurada de textos.",
        },
        {
          role: "user",
          content: `Analiza la siguiente respuesta de un usuario a una pregunta abierta de evaluación de habilidades: "${openEndedAnswer}".
          
          Extrae y resume en formato JSON los siguientes puntos (si no se detectan elementos claros para una categoría, devuelve un array vacío para ella):
          {
            "keyThemes": ["<Identifica y lista hasta 3 temas clave o conceptos principales mencionados>"],
            "specificProblemsMentioned": ["<Identifica y lista hasta 2 problemas o desafíos específicos que el usuario haya descrito explícita o implícitamente>"]
          }`,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    })

    const content = response.choices[0]?.message?.content
    if (content) {
      try {
        return JSON.parse(content) as PreProcessedOpenAnswer
      } catch (parseError) {
        console.error("Error al parsear la respuesta JSON del pre-procesamiento:", parseError)
      }
    }
  } catch (error) {
    console.error("Error al pre-procesar la respuesta abierta:", error)
  }

  // Valor por defecto en caso de error
  return {
    keyThemes: [],
    specificProblemsMentioned: [],
  }
}

// --- Función para determinar la profundidad de la lección ---
function determineLessonDepth(globalScore: number): string {
  if (globalScore < 40) return "fundamental"
  if (globalScore < 70) return "standard"
  return "advanced"
}

// --- Función para determinar los indicadores de enfoque ---
function determineFocusIndicators(
  indicatorScores: IndicatorScore[],
  userObstacles: string,
  preProcessedOpenAnswer: PreProcessedOpenAnswer,
): { primary: string; secondary?: string } {
  // Ordenar indicadores por puntuación (de menor a mayor)
  const sortedIndicators = [...indicatorScores].sort((a, b) => a.score - b.score)

  // Tomar los dos indicadores con puntuación más baja
  const lowestIndicators = sortedIndicators.slice(0, 2)

  // Función para calcular la relevancia de un indicador basado en los obstáculos y problemas mencionados
  const calculateRelevance = (indicator: IndicatorScore): number => {
    let relevance = 0

    // Verificar si el nombre del indicador aparece en los obstáculos
    if (userObstacles && userObstacles.toLowerCase().includes(indicator.name.toLowerCase())) {
      relevance += 2
    }

    // Verificar si el nombre del indicador aparece en los problemas mencionados
    for (const problem of preProcessedOpenAnswer.specificProblemsMentioned) {
      if (problem.toLowerCase().includes(indicator.name.toLowerCase())) {
        relevance += 1
      }
    }

    return relevance
  }

  // Calcular relevancia para los indicadores más bajos
  const relevanceScores = lowestIndicators.map((indicator) => ({
    indicator,
    relevance: calculateRelevance(indicator),
  }))

  // Ordenar por relevancia (de mayor a menor)
  relevanceScores.sort((a, b) => b.relevance - a.relevance)

  // Devolver el indicador primario y secundario
  return {
    primary: relevanceScores[0].indicator.id,
    secondary: relevanceScores.length > 1 ? relevanceScores[1].indicator.id : undefined,
  }
}

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<MentorSessionResponsePayload | ErrorResponse>> {
  try {
    if (!openai) {
      return NextResponse.json({ error: "OpenAI API no está configurada." }, { status: 500 })
    }

    const {
      skillId,
      skillName,
      globalScore,
      indicatorScores,
      openEndedAnswer,
      userProfile,
      conversationHistory,
      userResponse,
      currentMentorPhase,
    } = (await request.json()) as MentorSessionRequestPayload

    // Pre-procesar la respuesta abierta si existe
    let preProcessedOpenAnswer: PreProcessedOpenAnswer = {
      keyThemes: [],
      specificProblemsMentioned: [],
    }

    if (openEndedAnswer) {
      preProcessedOpenAnswer = await preProcessOpenAnswer(openEndedAnswer)
    }

    // Determinar la profundidad de la lección basada en el puntaje global
    const lessonDepth = determineLessonDepth(globalScore)

    // Determinar los indicadores de enfoque
    const focusIndicators = determineFocusIndicators(
      indicatorScores,
      userProfile?.obstacles || "",
      preProcessedOpenAnswer,
    )

    // Identificar fortalezas y áreas de mejora
    const sortedByScore = [...indicatorScores].sort((a, b) => b.score - a.score)
    const strengths = sortedByScore.slice(0, 2)
    const weaknesses = sortedByScore.slice(-2).reverse()

    // Construir el prompt según la fase actual
    let systemPrompt = ""
    let userPrompt = ""
    let nextPhase = ""

    switch (currentMentorPhase) {
      case "start_session":
        // Fase 1: Bienvenida y Micro-lección Dinámica
        systemPrompt = `
Eres un mentor experto en ${skillName}. Tu objetivo es proporcionar una experiencia de aprendizaje personalizada y práctica.
En esta primera fase, debes dar la bienvenida al usuario y ofrecer una micro-lección dinámica basada en su evaluación.
Tu tono debe ser profesional pero cercano, motivador y orientado a la acción.
Puedes usar Markdown para formatear tu respuesta, como **negrita**, *cursiva*, listas con * o -, y ### para títulos.

La profundidad de la lección debe ser: ${lessonDepth} (fundamental = conceptos básicos, standard = aplicación práctica, advanced = estrategias avanzadas).
Debes enfocarte principalmente en el indicador: ${focusIndicators.primary} y secundariamente en: ${
          focusIndicators.secondary || "reforzar conceptos generales"
        }.
`
        userPrompt = `
# Contexto del Usuario
${
  userProfile
    ? `
- Nombre: ${userProfile.name}
- Rol: ${userProfile.role}
- Experiencia: ${userProfile.experience || "No especificada"}
- Descripción del proyecto: ${userProfile.projectDescription}
- Obstáculos: ${userProfile.obstacles}
${userProfile.learningObjective ? `- Objetivo de aprendizaje: ${userProfile.learningObjective}` : ""}
`
    : "- Información no disponible"
}
${openEndedAnswer ? `- Respuesta a pregunta abierta: "${openEndedAnswer}"` : ""}

# Temas clave identificados en la respuesta abierta
${preProcessedOpenAnswer.keyThemes.map((theme) => `- ${theme}`).join("\n") || "- No se identificaron temas específicos"}

# Problemas específicos mencionados
${
  preProcessedOpenAnswer.specificProblemsMentioned.map((problem) => `- ${problem}`).join("\n") ||
  "- No se identificaron problemas específicos"
}

# Evaluación de ${skillName}
- Puntuación global: ${globalScore}/100
- Nivel de profundidad recomendado: ${lessonDepth}

# Fortalezas identificadas:
${strengths.map((s) => `- ${s.name}: ${s.score}/100`).join("\n")}

# Áreas de mejora identificadas:
${weaknesses.map((w) => `- ${w.name}: ${w.score}/100`).join("\n")}

# Tu tarea:
1. Da una breve bienvenida personalizada al usuario, mencionando su nombre si está disponible.
2. Felicítalo por completar la evaluación y menciona su puntuación global.
3. Destaca brevemente una fortaleza clave que has identificado.
4. Presenta una micro-lección dinámica (máximo 150 palabras) enfocada en mejorar el indicador principal identificado: ${
          indicatorScores.find((i) => i.id === focusIndicators.primary)?.name
        }.
5. La micro-lección debe ser práctica, específica y aplicable inmediatamente a su contexto profesional.
6. Adapta la profundidad de la lección al nivel ${lessonDepth}.
7. Si el usuario ha especificado un objetivo de aprendizaje, asegúrate de relacionar tu micro-lección con ese objetivo.
8. Termina con una pregunta abierta que invite a la reflexión sobre cómo aplicaría lo aprendido en su situación actual.

Responde de manera conversacional, como si estuvieras hablando directamente con el usuario.
Usa Markdown para estructurar tu respuesta y hacerla más legible.
`
        nextPhase = "phase2_scenario"
        break

      case "phase2_scenario":
        // Fase 2: Escenario Personalizado
        systemPrompt = `
Eres un mentor experto en ${skillName}. Estás en la segunda fase de una sesión de mentoría personalizada.
Tu objetivo es presentar un escenario práctico personalizado que desafíe al usuario a aplicar sus conocimientos.
Puedes usar Markdown para formatear tu respuesta, como **negrita**, *cursiva*, listas con * o -, y ### para títulos.

La profundidad del escenario debe ser: ${lessonDepth} (fundamental = situación básica, standard = situación con complejidad moderada, advanced = situación compleja con múltiples variables).
Debes enfocarte principalmente en el indicador: ${focusIndicators.primary}.
`
        userPrompt = `
# Historial de conversación:
${conversationHistory.map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`).join("\n\n")}

# Respuesta del usuario a tu pregunta anterior:
"${userResponse}"

# Contexto del Usuario
${
  userProfile
    ? `
- Rol: ${userProfile.role}
- Descripción del proyecto: ${userProfile.projectDescription}
- Obstáculos: ${userProfile.obstacles}
${userProfile.learningObjective ? `- Objetivo de aprendizaje: ${userProfile.learningObjective}` : ""}
`
    : "- Información no disponible"
}

# Temas clave identificados en la respuesta abierta
${preProcessedOpenAnswer.keyThemes.map((theme) => `- ${theme}`).join("\n") || "- No se identificaron temas específicos"}

# Tu tarea:
1. Reconoce brevemente la respuesta del usuario, destacando un punto valioso de su reflexión.
2. Presenta un escenario práctico personalizado (situación hipotética) relacionado con ${skillName} que:
   - Sea relevante para el contexto profesional del usuario (su rol y proyecto)
   - Desafíe específicamente el área de mejora identificada: ${
     indicatorScores.find((i) => i.id === focusIndicators.primary)?.name
   }
   - Tenga un nivel de complejidad adecuado al nivel ${lessonDepth}
   - Sea concreto y detallado, pero conciso (máximo 120 palabras)
   - Si el usuario ha especificado un objetivo de aprendizaje, intenta incorporarlo en el escenario
3. Pide al usuario que explique cómo abordaría este escenario, aplicando lo aprendido en la micro-lección.

El escenario debe ser realista, desafiante pero abordable, y directamente relacionado con las habilidades que el usuario necesita desarrollar.
Usa Markdown para estructurar tu respuesta y hacerla más legible.
`
        nextPhase = "phase3_feedback"
        break

      case "phase3_feedback":
        // Fase 3: Feedback Interactivo
        systemPrompt = `
Eres un mentor experto en ${skillName}. Estás en la tercera fase de una sesión de mentoría personalizada.
Tu objetivo es proporcionar feedback constructivo sobre la respuesta del usuario al escenario planteado.
Puedes usar Markdown para formatear tu respuesta, como **negrita**, *cursiva*, listas con * o -, y ### para títulos.

La profundidad del feedback debe ser: ${lessonDepth} (fundamental = conceptos básicos, standard = análisis detallado, advanced = análisis profundo con matices).
Debes enfocarte principalmente en el indicador: ${focusIndicators.primary}.
`
        userPrompt = `
# Historial de conversación:
${conversationHistory
  .slice(-4)
  .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
  .join("\n\n")}

# Respuesta del usuario al escenario:
"${userResponse}"

# Contexto del Usuario
${
  userProfile
    ? `
- Rol: ${userProfile.role}
- Descripción del proyecto: ${userProfile.projectDescription}
${userProfile.learningObjective ? `- Objetivo de aprendizaje: ${userProfile.learningObjective}` : ""}
`
    : "- Información no disponible"
}

# Tu tarea:
1. Proporciona feedback constructivo sobre la respuesta del usuario, siguiendo este formato:
   - Aspectos positivos: Identifica 2 fortalezas en su enfoque (sé específico)
   - Oportunidades de mejora: Sugiere 1-2 aspectos que podrían reforzarse, especialmente relacionados con ${
     indicatorScores.find((i) => i.id === focusIndicators.primary)?.name
   }
   - Consejo práctico: Ofrece una técnica o herramienta específica que podría ayudarle a mejorar
2. El feedback debe ser honesto pero motivador, enfocado en el crecimiento
3. Adapta la profundidad de tu feedback al nivel ${lessonDepth}
4. Termina preguntando al usuario qué aprendizaje clave se lleva de este ejercicio y cómo lo aplicaría en su trabajo

Adicionalmente a tu feedback conversacional, debes generar una evaluación estructurada de la respuesta del usuario al escenario. Incluye esto AL FINAL de tu respuesta, claramente separado, en el siguiente formato JSON (esto será procesado por el sistema, no mostrado directamente al usuario en este formato crudo, sino que el sistema lo usará para mostrarlo después de tu mensaje de feedback):

{
  "exerciseScore": <un número entre 0 y 100 representando la calidad de la respuesta del usuario al escenario, donde 0 es muy deficiente y 100 es excelente>,
  "exerciseScoreJustification": "<un análisis detallado (2-4 frases) explicando el porqué del score, destacando puntos fuertes y áreas de mejora específicas en la respuesta del usuario al escenario. Sé constructivo y específico.>"
}

Asegúrate de que tu mensaje de feedback conversacional preceda a este bloque JSON. El bloque JSON debe ser el último elemento en tu respuesta.
Usa Markdown para estructurar tu respuesta conversacional y hacerla más legible.
`
        nextPhase = "phase4_action_plan"
        break

      case "phase4_action_plan":
        // Fase 4: Plan de Acción
        systemPrompt = `
Eres un mentor experto en ${skillName}. Estás en la cuarta fase de una sesión de mentoría personalizada.
Tu objetivo es ayudar al usuario a desarrollar un plan de acción concreto para mejorar sus habilidades.
Puedes usar Markdown para formatear tu respuesta, como **negrita**, *cursiva*, listas con * o -, y ### para títulos.

La profundidad del plan de acción debe ser: ${lessonDepth} (fundamental = pasos básicos, standard = pasos con cierta complejidad, advanced = pasos estratégicos avanzados).
Debes enfocarte principalmente en el indicador: ${focusIndicators.primary}.
`
        userPrompt = `
# Historial de conversación:
${conversationHistory
  .slice(-4)
  .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
  .join("\n\n")}

# Respuesta del usuario sobre su aprendizaje:
"${userResponse}"

# Contexto del Usuario
${
  userProfile
    ? `
- Rol: ${userProfile.role}
- Descripción del proyecto: ${userProfile.projectDescription}
- Obstáculos: ${userProfile.obstacles}
${userProfile.learningObjective ? `- Objetivo de aprendizaje: ${userProfile.learningObjective}` : ""}
`
    : "- Información no disponible"
}

# Tu tarea:
1. Reconoce el aprendizaje identificado por el usuario
2. Presenta un plan de acción estructurado con 3 pasos concretos para mejorar en ${skillName}, específicamente en el área de ${
          indicatorScores.find((i) => i.id === focusIndicators.primary)?.name
        }
3. Cada paso debe:
   - Ser específico y accionable
   - Incluir un objetivo claro
   - Ser realizable en 1-2 semanas
   - Estar adaptado al contexto profesional del usuario y su nivel ${lessonDepth}
   - Si el usuario ha especificado un objetivo de aprendizaje, asegúrate de que los pasos contribuyan a ese objetivo
4. Termina preguntando al usuario: "¿Cuál de estos pasos te comprometes a implementar esta semana y qué posible obstáculo podrías enfrentar?"

El plan debe ser práctico, realista y directamente aplicable a la situación del usuario.
Usa Markdown para estructurar tu respuesta y hacerla más legible.
`
        nextPhase = "phase5_synthesis"
        break

      case "phase5_synthesis":
        // Fase 5: Síntesis y Proyección de Crecimiento
        systemPrompt = `
Eres un mentor experto en ${skillName}. Estás en la fase final de una sesión de mentoría personalizada.
Tu objetivo es ayudar al usuario a sintetizar lo aprendido y proyectar su crecimiento futuro.
Puedes usar Markdown para formatear tu respuesta, como **negrita**, *cursiva*, listas con * o -, y ### para títulos.
`
        userPrompt = `
# Historial de conversación:
${conversationHistory
  .slice(-6)
  .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
  .join("\n\n")}

# Compromiso del usuario:
"${userResponse}"

# Contexto del Usuario
${
  userProfile
    ? `
- Rol: ${userProfile.role}
- Descripción del proyecto: ${userProfile.projectDescription}
${userProfile.learningObjective ? `- Objetivo de aprendizaje: ${userProfile.learningObjective}` : ""}
`
    : "- Información no disponible"
}

# Tu tarea:
1. Reconoce y refuerza positivamente el compromiso del usuario
2. Ofrece 1-2 consejos prácticos para superar el obstáculo que mencionó
3. Sintetiza los principales aprendizajes de toda la sesión (máximo 100 palabras)
4. Proyecta cómo el desarrollo de esta habilidad impactará positivamente en:
   - Su desempeño profesional
   - El éxito de su proyecto
   - Su crecimiento personal
5. Si el usuario especificó un objetivo de aprendizaje, menciona cómo lo que ha aprendido contribuirá a alcanzarlo
6. Concluye la sesión con un mensaje motivador y una invitación a reflexionar sobre su próximo objetivo de desarrollo

Esta síntesis debe servir como cierre inspirador de la sesión y como puente hacia el desarrollo continuo.
Usa Markdown para estructurar tu respuesta y hacerla más legible.
`
        nextPhase = "session_completed"
        break

      case "session_completed":
        // Sesión completada
        return NextResponse.json({
          mentorMessage: "La sesión de mentoría ha sido completada. ¡Gracias por participar!",
          nextMentorPhase: "session_completed",
        })

      default:
        return NextResponse.json({ error: "Fase de mentoría no reconocida." }, { status: 400 })
    }

    // Llamar a OpenAI para generar la respuesta del mentor
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 800,
    })

    let mentorMessage = response.choices[0]?.message?.content || "Lo siento, no pude generar una respuesta."
    let exerciseScore: number | undefined = undefined
    let exerciseScoreJustification: string | undefined = undefined

    // Si estamos en la fase 3, extraer el JSON con el score del ejercicio
    if (currentMentorPhase === "phase3_feedback") {
      const extractedData = extractJsonFromText(mentorMessage)
      if (extractedData) {
        const { json, cleanText } = extractedData
        mentorMessage = cleanText

        if (json.exerciseScore !== undefined && json.exerciseScoreJustification) {
          exerciseScore = json.exerciseScore
          exerciseScoreJustification = json.exerciseScoreJustification
        }
      }
    }

    return NextResponse.json({
      mentorMessage,
      nextMentorPhase: nextPhase,
      exerciseScore,
      exerciseScoreJustification,
    })
  } catch (error) {
    console.error("Error en la sesión de mentoría:", error)
    return NextResponse.json({ error: "Error en la sesión de mentoría." }, { status: 500 })
  }
}
