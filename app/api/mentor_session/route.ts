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

DIRECTRICES IMPORTANTES:
- Tu micro-lección debe ser ultra-personalizada. Conecta directamente los conceptos que enseñes con los obstáculos y el objetivo de aprendizaje (si el usuario lo proveyó para esta habilidad) que se encuentran en el contexto del usuario. También considera los temas clave y problemas específicos mencionados en su respuesta abierta.
- Utiliza Markdown de forma efectiva: usa ### para el título principal de la micro-lección, **negritas** para términos clave, y listas con * o - para enumeraciones.
- La micro-lección no debe exceder las 150-200 palabras.
- Tu tono debe ser profesional pero cercano, motivador y orientado a la acción.
- Si alguna información del perfil del usuario no está disponible, adáptate y enfócate en la información que sí tienes. No inventes información.
- Sé conciso. Evita párrafos demasiado largos. Prioriza la claridad y la accionabilidad.

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
4. Presenta una micro-lección dinámica (máximo 150-200 palabras, estructurada con un título y párrafos cortos o listas) enfocada en mejorar el indicador principal identificado: ${
          indicatorScores.find((i) => i.id === focusIndicators.primary)?.name
        }.
5. La micro-lección debe ser práctica, específica y aplicable inmediatamente a su contexto profesional.
6. Adapta la profundidad de la lección al nivel ${lessonDepth}.
7. Si el usuario ha especificado un objetivo de aprendizaje para esta habilidad, asegúrate de que tu micro-lección y la pregunta final se alineen y contribuyan directamente a ese objetivo.
8. Termina con una pregunta abierta y reflexiva que invite al usuario a pensar cómo podría aplicar INMEDIATAMENTE el concepto clave de la micro-lección en una situación REAL de su proyecto o rol actual. Evita preguntas de sí/no.

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

DIRECTRICES IMPORTANTES:
- El escenario debe ser una oportunidad clara para que el usuario APLIQUE los conceptos de la micro-lección que acabas de dar. Haz referencia implícita o explícita a esos conceptos al pedirle al usuario que resuelva el escenario.
- Utiliza Markdown de forma efectiva: usa ### para el título del escenario, **negritas** para términos clave, y listas con * o - para enumeraciones.
- Mantén un tono de mentor experto: empático, alentador, pero también directo y claro en tus recomendaciones.
- Sé conciso. Evita párrafos demasiado largos. Prioriza la claridad y la accionabilidad.

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
   - Sea creíble, relevante y directamente aplicable al Rol, Descripción del proyecto y Obstáculos del usuario. Evita escenarios genéricos.
   - Desafíe específicamente el área de mejora identificada: ${
     indicatorScores.find((i) => i.id === focusIndicators.primary)?.name
   }
   - Tenga un nivel de complejidad adecuado al nivel ${lessonDepth}
   - Sea concreto y detallado, pero conciso (máximo 120 palabras)
   - Si el usuario ha especificado un objetivo de aprendizaje, intenta incorporarlo en el escenario
   - El escenario debe permitirle practicar activamente lo aprendido en la micro-lección anterior
3. Pide al usuario que explique detalladamente su plan de acción o cómo abordaría este escenario, enfatizando que debe aplicar los principios o técnicas de la micro-lección que discutieron.

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

DIRECTRICES IMPORTANTES:
- Tu feedback debe ser muy específico. Cuando menciones fortalezas o áreas de mejora, cita o parafrasea partes de la respuesta del usuario al escenario para ilustrar tus puntos.
- Utiliza Markdown de forma efectiva: usa ### para títulos de secciones, **negritas** para términos clave, y listas con * o - para enumeraciones.
- Mantén un tono de mentor experto: honesto pero motivador, enfocado en el crecimiento.
- Sé conciso. Evita párrafos demasiado largos. Prioriza la claridad y la accionabilidad.
- DEBES incluir un bloque JSON al final de tu respuesta con el formato exacto especificado en las instrucciones.

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
   - Aspectos positivos: Identifica 1-2 fortalezas en su enfoque, citando ejemplos de su respuesta.
   - Oportunidades de mejora: Sugiere 1-2 aspectos específicos de su respuesta que podrían reforzarse, explicando CÓMO se relacionan con la micro-lección dada y el indicador principal: ${
     indicatorScores.find((i) => i.id === focusIndicators.primary)?.name
   }
   - Consejo práctico: Ofrece una técnica o herramienta específica, y explica brevemente cómo podría implementarla.
2. El feedback debe ser honesto pero motivador, enfocado en el crecimiento
3. Adapta la profundidad de tu feedback al nivel ${lessonDepth}
4. Termina preguntando al usuario qué aprendizaje clave se lleva de este ejercicio y cómo lo aplicaría en su trabajo

Adicionalmente a tu feedback conversacional, DEBES generar una evaluación estructurada de la respuesta del usuario al escenario. Incluye esto AL FINAL de tu respuesta completa, sin ningún texto adicional después, en el siguiente formato JSON exacto:

{
  "exerciseScore": <un número entero entre 0 y 100, sin decimales>,
  "exerciseScoreJustification": "<Un análisis conciso pero detallado (aproximadamente 50-75 palabras, 2-4 frases) explicando el porqué del score. Conecta tu justificación con la aplicación (o falta de ella) de los conceptos de la micro-lección en la respuesta del usuario al escenario. Sé específico, mencionando 1-2 puntos fuertes y 1-2 áreas de mejora de su respuesta al escenario. Este texto se mostrará al usuario como la justificación del puntaje del ejercicio.>"
}

Asegúrate de que exerciseScore sea un NÚMERO y exerciseScoreJustification sea un STRING. El bloque JSON debe ser el último elemento en tu respuesta. No incluyas saltos de línea innecesarios dentro del string de justificación que puedan romper el parseo JSON.

Usa Markdown para estructurar tu respuesta conversacional y hacerla más legible.
`
        nextPhase = "phase4_action_plan"
        break

      case "phase4_action_plan":
        // Fase 4: Plan de Acción
        systemPrompt = `
Eres un mentor experto en ${skillName}. Estás en la cuarta fase de una sesión de mentoría personalizada.
Tu objetivo es ayudar al usuario a desarrollar un plan de acción concreto para mejorar sus habilidades.

DIRECTRICES IMPORTANTES:
- Cada paso del plan debe ser específico, medible, accionable, relevante y con un plazo definido (SMART).
- Utiliza Markdown de forma efectiva: usa ### para el título del plan, **negritas** para términos clave, y listas numeradas para los pasos.
- Mantén un tono de mentor experto: empático, alentador, pero también directo y claro en tus recomendaciones.
- Si alguna información del perfil del usuario no está disponible, adáptate y enfócate en la información que sí tienes. No inventes información.
- Sé conciso. Evita párrafos demasiado largos. Prioriza la claridad y la accionabilidad.

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
   - Ser Específico, Medible (sugiere cómo podría saber que lo logró), Accionable, Relevante (para su contexto y el indicador ${
     indicatorScores.find((i) => i.id === focusIndicators.primary)?.name
   }), y con un Plazo sugerido (ej. 'para la próxima semana', 'dentro de 15 días').
   - Ser realizable en 1-2 semanas
   - Estar adaptado al contexto profesional del usuario y su nivel ${lessonDepth}
   - Si el usuario proveyó un objetivo de aprendizaje para esta habilidad, cada paso debe ser una contribución clara hacia ese objetivo
4. Termina preguntando: "De estos pasos, ¿cuál te parece más prioritario o realizable para comenzar esta misma semana? ¿Qué primer pequeña acción podrías tomar para iniciarlo y qué posible obstáculo anticipas?"

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

DIRECTRICES IMPORTANTES:
- Esta es la fase de cierre, debes proporcionar una síntesis clara y motivadora de toda la sesión.
- Utiliza Markdown de forma efectiva: usa ### para títulos de secciones, **negritas** para términos clave, y listas con * o - para enumeraciones.
- Mantén un tono de mentor experto: inspirador, alentador y orientado al futuro.
- Si alguna información del perfil del usuario no está disponible, adáptate y enfócate en la información que sí tienes. No inventes información.
- Sé conciso. Evita párrafos demasiado largos. Prioriza la claridad y la accionabilidad.
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
2. Ofrece 1-2 consejos muy prácticos y breves para superar el obstáculo específico que mencionó el usuario
3. Sintetiza los principales aprendizajes de toda la sesión (máximo 100 palabras)
4. Proyecta de forma realista y personalizada cómo el desarrollo continuo de esta habilidad (${skillName}) impactará positivamente en:
   - Su desempeño profesional (considerando su Rol)
   - El éxito de su Proyecto
   - Su crecimiento personal
   Sé concreto.
5. Si el usuario especificó un objetivo de aprendizaje para esta habilidad, subraya cómo lo aprendido en esta sesión y las acciones futuras le ayudarán a alcanzarlo
6. Concluye la sesión con un mensaje motivador que refuerce su progreso y lo anime a seguir aprendiendo. Invítalo a pensar en qué otra habilidad podría trabajar o cómo puede seguir profundizando en esta

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
