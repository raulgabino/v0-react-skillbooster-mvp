import { NextResponse } from "next/server"
import OpenAI from "openai"
import { Error } from "typescript"

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

    // 1. Buscar un objeto JSON completo con el formato esperado
    const jsonRegex = /\{\s*"exerciseScore"\s*:\s*(\d+)\s*,\s*"exerciseScoreJustification"\s*:\s*"([^"]*)"\s*\}/
    const jsonMatch = text.match(jsonRegex)

    if (jsonMatch) {
      const score = Number.parseInt(jsonMatch[1], 10)
      const justification = jsonMatch[2]

      const json = {
        exerciseScore: score,
        exerciseScoreJustification: justification,
      }

      // Eliminar el JSON del texto original
      const cleanText = text.replace(jsonMatch[0], "").trim()
      return { json, cleanText }
    }

    // 2. Buscar un objeto JSON genérico
    const genericJsonRegex = /\{[\s\S]*\}/
    const genericJsonMatch = text.match(genericJsonRegex)

    if (genericJsonMatch) {
      try {
        const jsonString = genericJsonMatch[0]
        const parsedJson = JSON.parse(jsonString)

        // Verificar que el JSON tiene los campos esperados
        if (parsedJson && typeof parsedJson.exerciseScore !== "undefined" && parsedJson.exerciseScoreJustification) {
          // Asegurarse de que exerciseScore sea un número
          const json = {
            exerciseScore: Number(parsedJson.exerciseScore),
            exerciseScoreJustification: String(parsedJson.exerciseScoreJustification),
          }

          // Eliminar el JSON del texto original
          const cleanText = text.replace(jsonString, "").trim()
          return { json, cleanText }
        }
      } catch (parseError) {
        console.log("Error al parsear JSON genérico:", parseError)
      }
    }

    // 3. Último recurso: buscar valores numéricos y texto que parezcan ser score y justificación
    const scoreRegex = /(\d{1,3})\/100/
    const scoreMatch = text.match(scoreRegex)

    if (scoreMatch) {
      const score = Number.parseInt(scoreMatch[1], 10)

      // Buscar texto que parezca una justificación después del score
      let justification = ""
      const parts = text.split(scoreMatch[0])

      if (parts.length > 1) {
        // Extraer hasta 200 caracteres después del score como justificación
        const afterScoreText = parts[1].trim()
        const sentenceEndRegex = /[.!?]\s+/g
        const sentences = afterScoreText.split(sentenceEndRegex)

        // Tomar hasta 3 oraciones como justificación
        justification = sentences.slice(0, 3).join(". ").trim()
        if (justification.length > 200) {
          justification = justification.substring(0, 200) + "..."
        }
      }

      if (!justification) {
        justification = "Evaluación basada en la respuesta al escenario."
      }

      const json = {
        exerciseScore: score,
        exerciseScoreJustification: justification,
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
          content:
            "Eres un asistente analítico especializado en extraer información estructurada de textos. Tu tarea es identificar temas clave y problemas específicos mencionados en una respuesta abierta, y devolverlos en un formato JSON válido y consistente.",
        },
        {
          role: "user",
          content: `Analiza la siguiente respuesta de un usuario a una pregunta abierta de evaluación de habilidades: "${openEndedAnswer}".
          
          Extrae y resume en formato JSON los siguientes puntos:
          {
            "keyThemes": ["<Identifica y lista hasta 3 temas clave o conceptos principales mencionados>"],
            "specificProblemsMentioned": ["<Identifica y lista hasta 2 problemas o desafíos específicos que el usuario haya descrito explícita o implícitamente>"]
          }
          
          IMPORTANTE: 
          1. Si no detectas elementos claros para una categoría, devuelve un array vacío [] para esa categoría, NUNCA null o undefined.
          2. Asegúrate de que el formato JSON sea válido y pueda ser parseado correctamente.
          3. Sé conciso pero preciso en tus descripciones.`,
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
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API no está configurada." }, { status: 500 })
    }

    const {
      skillId,
      skillName,
      userProfile,
      conversationHistory,
      userResponse,
      currentMentorPhase,
      // Se añade el resto de la información para tenerla disponible
      globalScore,
      indicatorScores,
      openEndedAnswer,
    } = (await request.json()) as MentorSessionRequestPayload

    console.log(`[API /api/mentor_session] Fase actual: ${currentMentorPhase} para habilidad: ${skillName}`)

    // --- NUEVO: System Prompt Mejorado con Análisis de Intención ---
    const systemPrompt = `
Eres un Mentor Práctico y Coach Ejecutivo, experto en la habilidad de **${skillName}**. Tu principal directiva es guiar al usuario a través de un proceso de aprendizaje adaptativo.

**TU PROCESO DE PENSAMIENTO SIEMPRE DEBE SER:**
1.  **ANALIZAR LA ÚLTIMA RESPUESTA DEL USUARIO:** Antes de hacer cualquier otra cosa, determina la intención del usuario. ¿Está aplicando el concepto (intención 'aplicar'), o está pidiendo una clarificación, expresando confusión o dando una respuesta irrelevante (intención 'clarificar')?
2.  **ACTUAR SEGÚN LA INTENCIÓN:**
    * **Si la intención es 'clarificar'**: Tu ÚNICA tarea es ayudar al usuario a superar su confusión. Para ello, elige **una** de las siguientes técnicas pedagógicas:
    1.  **Explica con una Analogía:** Compara el concepto con una situación simple y cotidiana (ej., "Piensa en [el concepto] como si fueras un chef...").
    2.  **Da un Ejemplo Concreto y Genérico:** Ilustra la idea con un mini-caso práctico (ej., "Por ejemplo, si tu análisis muestra que un software ahorra tiempo, la aplicación práctica es mostrarle al cliente un escenario real...").
    3.  **Descompón la Idea:** Divide el concepto en 2-3 partes más simples y explícalas una por una.
    Después de tu explicación (que debe ser breve), **reformula tu pregunta anterior** para darle al usuario otra oportunidad de responder. NO AVANCES a la siguiente fase del guion.
    * Si la intención es 'aplicar', procede con el siguiente paso lógico de la sesión de mentoría (ej. pasar de la micro-lección al escenario práctico).

**REGLAS CRÍTICAS:**
* **Claridad ante todo:** Prioriza siempre que el usuario entienda los conceptos.
* **No avanzar con dudas:** Nunca introduzcas un nuevo concepto o fase si el usuario ha mostrado confusión en el paso anterior.
* **Nombres Descriptivos:** Al referirte a indicadores o conceptos de la habilidad, USA SIEMPRE sus nombres descriptivos completos (ej. "Gestión de Stakeholders") y NUNCA códigos internos (ej. GP5).
* **Foco en la Habilidad:** Tu contenido debe centrarse estricta y únicamente en **${skillName}**.
* **Formato:** Usa Markdown simple ('###' para títulos, '**' para negritas, '*' para listas) para máxima legibilidad.
`

    const fullContext = `
# CONTEXTO GLOBAL DE LA SESIÓN
- **Habilidad en Foco:** ${skillName}
- **Usuario:** ${userProfile?.name || "Usuario"} (${userProfile?.role || "Profesional"})
- **Objetivos y Obstáculos del Usuario:** ${userProfile?.obstacles || "No especificados"}
- **Resultados de Evaluación:** Puntuación global ${globalScore}/100. Indicadores clave: ${indicatorScores.map((i) => `${i.name} (${i.score})`).join(", ")}.
- **Historial de Conversación:**
${conversationHistory.map((msg) => `${msg.sender === "user" ? userProfile?.name : "Mentor"}: ${msg.text}`).join("\n")}
`

    let userPromptForAI = ""
    let nextPhase = currentMentorPhase // Por defecto, la fase no cambia

    if (currentMentorPhase === "start_session") {
      // La primera llamada no tiene respuesta de usuario, genera la bienvenida.
      userPromptForAI = `
${fullContext}
**TAREA:** Inicia la sesión. Presenta una micro-lección personalizada sobre el área de mejora más relevante para el usuario en "${skillName}", conectándola con sus obstáculos. Finaliza con una pregunta abierta que le invite a reflexionar sobre cómo aplicaría este primer concepto.
`
      nextPhase = "phase2_scenario"
    } else {
      // A partir de la segunda llamada, se analiza la respuesta del usuario.
      userPromptForAI = `
${fullContext}
**TAREA:**
1.  **Analiza la última respuesta de ${userProfile?.name}:** "${userResponse}"
2.  **Determina la intención:** ¿Es 'aplicar' o 'clarificar'?
3.  **Actúa según la intención:**
    * **Si es 'clarificar':** Explica el concepto que no entendió y repite tu pregunta anterior. NO avances de fase.
    * **Si es 'aplicar' y la fase actual es 'phase2_scenario':** Reconoce su respuesta y presenta el escenario práctico.
    * **Si es 'aplicar' y la fase actual es 'phase3_feedback':** Reconoce su solución al escenario, dale feedback constructivo y evalúa su respuesta con un JSON al final: {"exerciseScore": <0-100>, "exerciseScoreJustification": "<breve justificación>"}.
    * **Si es 'aplicar' y la fase actual es 'phase4_action_plan':** Basado en todo lo anterior, presenta un plan de acción concreto con 2-3 pasos.
    * **Si es 'aplicar' y la fase actual es 'phase5_synthesis':** Felicítalo y haz una síntesis final de la sesión, proyectando el impacto de la mejora.
`

      // Lógica de transición de fase SÓLO si la intención es 'aplicar'
      const phaseTransitions: Record<string, string> = {
        phase2_scenario: "phase3_feedback",
        phase3_feedback: "phase4_action_plan",
        phase4_action_plan: "phase5_synthesis",
        phase5_synthesis: "session_completed",
      }
      // Asumimos que la IA determinará la intención. Si avanza, actualizamos la fase.
      // Una IA más avanzada podría devolver la intención explícitamente.
      // Por ahora, si la respuesta no parece una simple clarificación, avanzamos.
      // El prompt le indica que no avance, así que confiamos en que su respuesta no introducirá la siguiente fase.
      // Por lo tanto, el `nextPhase` calculado es una presunción optimista que funciona para el "happy path".

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPromptForAI },
        ],
        temperature: 0.5,
      })

      let mentorMessage =
        response.choices[0]?.message?.content ||
        "Lo siento, no pude procesar tu respuesta. ¿Podrías intentarlo de nuevo?"
      let exerciseScore: number | undefined
      let exerciseScoreJustification: string | undefined

      // Lógica para extraer el score si estamos en la fase de feedback
      if (currentMentorPhase === "phase3_feedback") {
        // Implementación simple para buscar un JSON en la respuesta.
        try {
          const jsonMatch = mentorMessage.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            if (parsed.exerciseScore !== undefined) {
              exerciseScore = Number(parsed.exerciseScore)
              exerciseScoreJustification = parsed.exerciseScoreJustification
              // Limpiar el mensaje para no mostrar el JSON al usuario
              mentorMessage = mentorMessage.replace(jsonMatch[0], "").trim()
            }
          }
        } catch (e) {
          console.error("No se pudo parsear el JSON de la puntuación del ejercicio.", e)
        }
      }

      // Si después del análisis, la IA decide NO avanzar, debemos sobreescribir nextPhase.
      // Esta es una simplificación. Una implementación avanzada haría que la IA devuelva un objeto
      // con `intention: 'clarify'` y basaríamos la lógica en eso.
      // Por ahora, si la IA explica algo y repite una pregunta, no debería avanzar.
      // El prompt le indica que no avance, así que confiamos en que su respuesta no introducirá la siguiente fase.
      // Por lo tanto, el `nextPhase` calculado es una presunción optimista que funciona para el "happy path".

      return NextResponse.json(
        {
          mentorMessage,
          nextMentorPhase: nextPhase, // La IA es instruida para no avanzar si clarifica.
          exerciseScore,
          exerciseScoreJustification,
        },
        { status: 200 },
      )
    }
  } catch (error) {
    console.error("[API /api/mentor_session] Error en el handler:", error)
    const errorMessage = error instanceof Error ? error.message : "Error desconocido"
    return NextResponse.json({ error: `Error interno del servidor: ${errorMessage}` }, { status: 500 })
  }
}
