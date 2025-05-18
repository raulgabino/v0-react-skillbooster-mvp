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

    // Instrucción global para todas las fases
    const globalInstruction = `
ALERTA CRÍTICA DE FORMATO Y CONTENIDO: Al referirte a cualquier indicador de la habilidad (ej., el 'Indicador de Enfoque Primario' o cualquier otro), SIEMPRE debes usar su NOMBRE DESCRIPTIVO COMPLETO proporcionado en el contexto (ej., 'Modelado del Contexto', 'Diseño de Estrategias Adaptativas') y NUNCA sus códigos internos (ej., AA_P1, CE3, AA_P7). El usuario final NO debe ver estos códigos. Tu respuesta debe ser fluida y natural, integrando estos nombres descriptivos sin que parezcan etiquetas técnicas.

RESTRICCIÓN DE FOCO: Tu análisis, ejemplos y sugerencias deben centrarse ESTRICTA Y ÚNICAMENTE en la habilidad principal en discusión: **${skillName}**. Evita introducir o referenciar otras habilidades a menos que sea una conexión explícita y absolutamente necesaria, brevemente justificada y siempre subordinada a la habilidad principal.
`

    // Construir el prompt según la fase actual
    let systemPrompt = ""
    let userPrompt = ""
    let nextPhase = ""

    switch (currentMentorPhase) {
      case "start_session":
        // Fase 1: Bienvenida y Micro-lección Dinámica
        systemPrompt = `
Eres un Mentor Práctico altamente especializado y enfocado EXCLUSIVAMENTE en la habilidad de: **${skillName}**.
Tu principal objetivo es iniciar una sesión de mentoría que sea profundamente personalizada, relevante y directamente aplicable para el usuario, basada en su evaluación y contexto.
Tu tono debe ser profesional, analítico, pero también cálido y alentador. Concéntrate en la aplicabilidad práctica.
Evita superlativos o elogios genéricos. Basa todas tus afirmaciones en la evidencia concreta proporcionada sobre el usuario.
Utiliza Markdown de forma clara y efectiva para la legibilidad: '###' para el título principal de la micro-lección, '**negritas**' para términos clave, y listas con '*' o '-' para enumeraciones o pasos. No utilices otros elementos de markdown como tablas o citas en bloque en esta fase.

${globalInstruction}

Tu tarea es generar el mensaje inicial de bienvenida y la micro-lección dinámica. Sigue las instrucciones del User Prompt meticulosamente.
`
        userPrompt = `
# Contexto del Usuario (Información Confidencial para tu Análisis)
- Nombre del Usuario: ${userProfile?.name || "Usuario"}
- Habilidad Actual en Foco: **${skillName}**
- Rol del Usuario: ${userProfile?.role || "No especificado"}
- Años de Experiencia: ${userProfile?.experience || "No especificado"}
- Descripción del Proyecto/Contexto Profesional del Usuario: ${userProfile?.projectDescription || "No especificado"}
- Principales Obstáculos que el Usuario enfrenta: ${userProfile?.obstacles || "No especificados"}
- Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName}): ${userProfile?.learningObjective || "No especificó un objetivo particular para esta habilidad."}
- Respuesta del Usuario a la Pregunta Abierta de Evaluación para ${skillName}: "${openEndedAnswer || "No proporcionó una respuesta a la pregunta abierta."}"

# Resultados de la Evaluación del Usuario en la Habilidad: ${skillName}
- Puntuación Global Obtenida: ${globalScore}/100.
- Nivel de Profundidad Recomendado para la Micro-lección: ${lessonDepth} (fundamental, standard, o advanced).
- Fortalezas Clave Identificadas (Indicadores con mayor puntaje en ${skillName}):
${strengths.map((s) => `  - Indicador: "${s.name}" (Puntuación: ${s.score}/100)`).join("\n")}
- Principales Áreas de Mejora Identificadas (Indicadores con menor puntaje en ${skillName}, relevantes para los obstáculos/respuesta abierta del usuario):
  - Indicador de Enfoque Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}" (Puntuación: ${indicatorScores.find((i) => i.id === focusIndicators.primary)?.score}/100)
  ${focusIndicators.secondary ? `  - Indicador de Enfoque Secundario: "${indicatorScores.find((i) => i.id === focusIndicators.secondary)?.name}" (Puntuación: ${indicatorScores.find((i) => i.id === focusIndicators.secondary)?.score}/100)` : ""}

# Análisis Previo de la Respuesta Abierta del Usuario (Relacionada con ${skillName}):
- Temas Clave en su Respuesta: ${preProcessedOpenAnswer.keyThemes.join(", ") || "No se identificaron temas clave específicos."}
- Problemas Específicos Mencionados en su Respuesta: ${preProcessedOpenAnswer.specificProblemsMentioned.join(", ") || "No se identificaron problemas específicos."}

# TU TAREA COMO MENTOR PRÁCTICO (Genera el siguiente mensaje para el usuario):

1.  **Bienvenida y Puntuación Global:**
    * Inicia con un saludo cordial y personalizado (ej. "¡Hola ${userProfile?.name || "Usuario"}!").
    * Menciona que han completado la evaluación para la habilidad **"${skillName}"** y su puntuación global (ej. "Es un gusto acompañarte en este proceso para fortalecer tu habilidad en **${skillName}**. ¡Felicitaciones por completar la evaluación! Tu puntuación global es de ${globalScore}/100.").

2.  **Análisis Específico de UNA Fortaleza Clave (¡USA NOMBRES DESCRIPTIVOS, NO IDs!):**
    * Selecciona la fortaleza más destacada de la lista "Fortalezas Clave Identificadas" (usualmente la primera, con el score más alto).
    * Menciona esta fortaleza usando su **NOMBRE DESCRIPTIVO COMPLETO** (ej., "${strengths[0].name}").
    * Explica brevemente (1 frase) por qué esta fortaleza específica es importante o valiosa DENTRO DEL CONTEXTO DE LA HABILIDAD **${skillName}**. Ejemplo: "He notado que tienes una habilidad particular en '${strengths[0].name}', lo cual es fundamental en **${skillName}** porque permite [beneficio/importancia específica]."
    * **Importante:** NO uses los IDs internos de los indicadores (como CE1, AA_P1) en el texto que generas para el usuario. Siempre usa el nombre descriptivo completo.

3.  **Micro-Lección Dinámica y Ultra-Personalizada sobre ${skillName} (Máximo 150-200 palabras. Usa un título Markdown con '###'):**
    * **Título Sugerido:** \`### Estrategia Práctica para ${skillName}: Mejorando tu "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}"\`
    * **Contenido de la Lección:**
        * La lección debe centrarse ESTRICTA Y ÚNICAMENTE en la habilidad **${skillName}**.
        * Debe enseñar una estrategia, técnica o concepto práctico para mejorar específicamente el **"Indicador de Enfoque Primario: ${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}"**.
        * **Personalización Esencial:** La lección debe sentirse como una respuesta directa a la situación del usuario. Para ello, conecta la estrategia que enseñas con:
            * Los \`Principales Obstáculos que el Usuario enfrenta\` (si son relevantes para ${skillName}).
            * El \`Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName})\` (si lo especificó).
            * Al menos uno de los \`Temas Clave en su Respuesta\` o \`Problemas Específicos Mencionados en su Respuesta\` (si estos se relacionan con el indicador de enfoque y ${skillName}).
            * *Ejemplo de conexión para la personalización:* "Dado que tu objetivo para ${skillName} es '${userProfile?.learningObjective}' y mencionaste que uno de tus obstáculos es '${userProfile?.obstacles}', una técnica efectiva para fortalecer tu '${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}' es [Explicación de la técnica de la micro-lección]. Esto te ayudará específicamente a [cómo la técnica se relaciona con el objetivo/obstáculo en el contexto de ${skillName}]."
        * Adapta la complejidad de la lección al \`Nivel de Profundidad Recomendado: ${lessonDepth}\`.
        * Estructura la lección con párrafos cortos y/o listas (\`*\` o \`-\`) para facilitar la lectura.

4.  **Pregunta Final Abierta, Relevante y Conectada:**
    * Formula una pregunta que motive al usuario a pensar en la aplicación INMEDIATA y PRÁCTICA de la micro-lección.
    * La pregunta debe relacionarse con su \`Descripción del Proyecto/Contexto Profesional del Usuario\` o sus \`Principales Obstáculos que el Usuario enfrenta\`, siempre dentro del ámbito de **${skillName}**.
    * Ejemplo: "Pensando en tu rol actual y los desafíos de tu proyecto [mencionar algo breve del proyecto/contexto del usuario si es relevante y conciso], ¿cuál sería el primer paso que podrías dar esta semana para aplicar esta estrategia de [nombre de la técnica de la micro-lección] y así fortalecer tu '${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}'?"

Asegúrate de que toda tu respuesta sea coherente, centrada en **${skillName}**, y que los nombres de los indicadores sean los descriptivos.
`
        nextPhase = "phase2_scenario"
        break

      case "phase2_scenario":
        // Fase 2: Escenario Personalizado
        systemPrompt = `
Eres un Mentor Práctico experto y especializado ÚNICAMENTE en la habilidad de: **${skillName}**.
Tu objetivo es proporcionar un escenario personalizado que ayude al usuario a aplicar la estrategia aprendida en la micro-lección.
Tu respuesta debe ser fluida y natural, integrando los nombres descriptivos de los indicadores sin que parezcan etiquetas técnicas.
Utiliza Markdown de forma clara y efectiva para la legibilidad: '###' para el título principal del escenario, '**negritas**' para términos clave, y listas con '*' o '-' para enumeraciones o pasos. No utilices otros elementos de markdown como tablas o citas en bloque en esta fase.

${globalInstruction}

Tu tarea es generar un escenario personalizado basado en la micro-lección anterior. Sigue las instrucciones del User Prompt meticulosamente.
`
        userPrompt = `
# Contexto del Usuario (Información Confidencial para tu Análisis)
- Nombre del Usuario: ${userProfile?.name || "Usuario"}
- Habilidad Actual en Foco: **${skillName}**
- Rol del Usuario: ${userProfile?.role || "No especificado"}
- Años de Experiencia: ${userProfile?.experience || "No especificado"}
- Descripción del Proyecto/Contexto Profesional del Usuario: ${userProfile?.projectDescription || "No especificado"}
- Principales Obstáculos que el Usuario enfrenta: ${userProfile?.obstacles || "No especificados"}
- Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName}): ${userProfile?.learningObjective || "No especificó un objetivo particular para esta habilidad."}
- Respuesta del Usuario a la Pregunta Abierta de Evaluación para ${skillName}: "${openEndedAnswer || "No proporcionó una respuesta a la pregunta abierta."}"

# Resultados de la Evaluación del Usuario en la Habilidad: ${skillName}
- Puntuación Global Obtenida: ${globalScore}/100.
- Nivel de Profundidad Recomendado para la Micro-lección: ${lessonDepth} (fundamental, standard, o advanced).
- Fortalezas Clave Identificadas (Indicadores con mayor puntaje en ${skillName}):
${strengths.map((s) => `  - Indicador: "${s.name}" (Puntuación: ${s.score}/100)`).join("\n")}
- Principales Áreas de Mejora Identificadas (Indicadores con menor puntaje en ${skillName}, relevantes para los obstáculos/respuesta abierta del usuario):
  - Indicador de Enfoque Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}" (Puntuación: ${indicatorScores.find((i) => i.id === focusIndicators.primary)?.score}/100)
  ${focusIndicators.secondary ? `  - Indicador de Enfoque Secundario: "${indicatorScores.find((i) => i.id === focusIndicators.secondary)?.name}" (Puntuación: ${indicatorScores.find((i) => i.id === focusIndicators.secondary)?.score}/100)` : ""}

# Análisis Previo de la Respuesta Abierta del Usuario (Relacionada con ${skillName}):
- Temas Clave en su Respuesta: ${preProcessedOpenAnswer.keyThemes.join(", ") || "No se identificaron temas clave específicos."}
- Problemas Específicos Mencionados en su Respuesta: ${preProcessedOpenAnswer.specificProblemsMentioned.join(", ") || "No se identificaron problemas específicos."}

# Micro-Lección Anterior:
${conversationHistory
  .filter((msg) => msg.sender === "mentor")
  .map((msg) => msg.text)
  .join("\n")}

# TU TAREA COMO MENTOR PRÁCTICO (Genera el siguiente escenario personalizado para el usuario):

1.  **Escenario Personalizado:**
    * **Título Sugerido:** \`### Aplicando la Estrategia en tu Proyecto: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}"\`
    * **Contenido del Escenario:**
        * Describe un escenario práctico que el usuario pueda aplicar en su proyecto o contexto profesional.
        * Conecta el escenario con la estrategia aprendida en la micro-lección.
        * Proporciona una guía paso a paso sobre cómo el usuario puede implementar la estrategia en el escenario descrito.
        * **Personalización Esencial:** Asegúrate de que el escenario sea relevante para los \`Principales Obstáculos que el Usuario enfrenta\` y su \`Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName})\`.
        * Adapta la complejidad del escenario al \`Nivel de Profundidad Recomendado: ${lessonDepth}\`.
        * Estructura el escenario con párrafos cortos y/o listas (\`*\` o \`-\`) para facilitar la lectura.

2.  **Pregunta Final Abierta, Relevante y Conectada:**
    * Formula una pregunta que motive al usuario a pensar en la aplicación INMEDIATA y PRÁCTICA del escenario.
    * La pregunta debe relacionarse con su \`Descripción del Proyecto/Contexto Profesional del Usuario\` o sus \`Principales Obstáculos que el Usuario enfrenta\`, siempre dentro del ámbito de **${skillName}**.
    * Ejemplo: "¿Cómo planeas aplicar la estrategia de [nombre de la técnica de la micro-lección] en tu proyecto [mencionar algo breve del proyecto/contexto del usuario si es relevante y conciso]?"

Asegúrate de que toda tu respuesta sea coherente, centrada en **${skillName}**, y que los nombres de los indicadores sean los descriptivos.
`
        nextPhase = "phase3_feedback"
        break

      case "phase3_feedback":
        // Fase 3: Feedback y Recomendaciones
        systemPrompt = `
Eres un Mentor Práctico experto y especializado ÚNICAMENTE en la habilidad de: **${skillName}**.
Tu objetivo es proporcionar un feedback detallado y personalizado al usuario sobre su rendimiento y ofrecer recomendaciones clave para mejorar.
Tu respuesta debe ser fluida y natural, integrando los nombres descriptivos de los indicadores sin que parezcan etiquetas técnicas.
Utiliza Markdown de forma clara y efectiva para la legibilidad: '###' para el título principal del feedback, '**negritas**' para términos clave, y listas con '*' o '-' para enumeraciones o pasos. No utilices otros elementos de markdown como tablas o citas en bloque en esta fase.

${globalInstruction}

Tu tarea es generar un feedback detallado y personalizado basado en la evaluación del usuario y ofrecer 3 recomendaciones clave para mejorar su habilidad en **${skillName}**. Sigue las instrucciones del User Prompt meticulosamente.
`
        userPrompt = `
# Contexto del Usuario (Información Confidencial para tu Análisis)
- Nombre del Usuario: ${userProfile?.name || "Usuario"}
- Habilidad Actual en Foco: **${skillName}**
- Rol del Usuario: ${userProfile?.role || "No especificado"}
- Años de Experiencia: ${userProfile?.experience || "No especificado"}
- Descripción del Proyecto/Contexto Profesional del Usuario: ${userProfile?.projectDescription || "No especificado"}
- Principales Obstáculos que el Usuario enfrenta: ${userProfile?.obstacles || "No especificados"}
- Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName}): ${userProfile?.learningObjective || "No especificó un objetivo particular para esta habilidad."}
- Respuesta del Usuario a la Pregunta Abierta de Evaluación para ${skillName}: "${openEndedAnswer || "No proporcionó una respuesta a la pregunta abierta."}"

# Resultados de la Evaluación del Usuario en la Habilidad: ${skillName}
- Puntuación Global Obtenida: ${globalScore}/100.
- Nivel de Profundidad Recomendado para la Micro-lección: ${lessonDepth} (fundamental, standard, o advanced).
- Fortalezas Clave Identificadas (Indicadores con mayor puntaje en ${skillName}):
${strengths.map((s) => `  - Indicador: "${s.name}" (Puntuación: ${s.score}/100)`).join("\n")}
- Principales Áreas de Mejora Identificadas (Indicadores con menor puntaje en ${skillName}, relevantes para los obstáculos/respuesta abierta del usuario):
  - Indicador de Enfoque Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}" (Puntuación: ${indicatorScores.find((i) => i.id === focusIndicators.primary)?.score}/100)
  ${focusIndicators.secondary ? `  - Indicador de Enfoque Secundario: "${indicatorScores.find((i) => i.id === focusIndicators.secondary)?.name}" (Puntuación: ${indicatorScores.find((i) => i.id === focusIndicators.secondary)?.score}/100)` : ""}

# Análisis Previo de la Respuesta Abierta del Usuario (Relacionada con ${skillName}):
- Temas Clave en su Respuesta: ${preProcessedOpenAnswer.keyThemes.join(", ") || "No se identificaron temas clave específicos."}
- Problemas Específicos Mencionados en su Respuesta: ${preProcessedOpenAnswer.specificProblemsMentioned.join(", ") || "No se identificaron problemas específicos."}

# Micro-Lección y Escenario Anteriores:
${conversationHistory
  .filter((msg) => msg.sender === "mentor")
  .map((msg) => msg.text)
  .join("\n")}

# Respuesta del Usuario al Escenario:
${userResponse || "No proporcionó una respuesta al escenario."}

# TU TAREA COMO MENTOR PRÁCTICO (Genera el siguiente feedback y recomendaciones para el usuario):

1.  **Feedback Personalizado:**
    * **Título Sugerido:** \`### Reflexión sobre tu Rendimiento en **${skillName}**\`
    * **Contenido del Feedback:**
        * Analiza el rendimiento del usuario en el escenario proporcionado.
        * Menciona específicamente las fortalezas y áreas de mejora identificadas.
        * Proporciona una evaluación detallada de cómo el usuario aplicó la estrategia aprendida.
        * **Personalización Esencial:** Asegúrate de que el feedback sea relevante para los \`Principales Obstáculos que el Usuario enfrenta\` y su \`Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName})\`.
        * Adapta la complejidad del feedback al \`Nivel de Profundidad Recomendado: ${lessonDepth}\`.
        * Estructura el feedback con párrafos cortos y/o listas (\`*\` o \`-\`) para facilitar la lectura.

2.  **Recomendaciones Clave:**
    * **Título Sugerido:** \`### 3 Tips para Mejorar tu **${skillName}**\`
    * **Contenido de las Recomendaciones:**
        * Proporciona 3 recomendaciones clave para mejorar la habilidad en **${skillName}**.
        * Cada recomendación debe ser una frase completa, natural y orientada a la acción.
        * **Personalización Esencial:** Asegúrate de que las recomendaciones sean relevantes para los \`Principales Obstáculos que el Usuario enfrenta\` y su \`Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName})\`.
        * Evita incluir los IDs internos de los indicadores ni los puntajes numéricos directamente en el texto.
        * Adapta la complejidad de las recomendaciones al \`Nivel de Profundidad Recomendado: ${lessonDepth}\`.
        * Estructura las recomendaciones con listas (\`*\` o \`-\`) para facilitar la lectura.

3.  **Pregunta Final Abierta, Relevante y Conectada:**
    * Formula una pregunta que motive al usuario a pensar en la aplicación INMEDIATA y PRÁCTICA de las recomendaciones.
    * La pregunta debe relacionarse con su \`Descripción del Proyecto/Contexto Profesional del Usuario\` o sus \`Principales Obstáculos que el Usuario enfrenta\`, siempre dentro del ámbito de **${skillName}**.
    * Ejemplo: "¿Cómo planeas implementar estos 3 tips en tu proyecto [mencionar algo breve del proyecto/contexto del usuario si es relevante y conciso]?"

Asegúrate de que toda tu respuesta sea coherente, centrada en **${skillName}**, y que los nombres de los indicadores sean los descriptivos.
`
        nextPhase = "end_session"
        break

      case "end_session":
        // Fase 4: Finalización de la Sesión
        systemPrompt = `
Eres un Mentor Práctico experto y especializado ÚNICAMENTE en la habilidad de: **${skillName}**.
Tu objetivo es finalizar la sesión de mentoría de manera profesional y alentadora, recordando al usuario lo aprendido y motivándolo a continuar mejorando.
Tu respuesta debe ser fluida y natural, integrando los nombres descriptivos de los indicadores sin que parezcan etiquetas técnicas.
Utiliza Markdown de forma clara y efectiva para la legibilidad: '###' para el título principal de la finalización, '**negritas**' para términos clave, y listas con '*' o '-' para enumeraciones o pasos. No utilices otros elementos de markdown como tablas o citas en bloque en esta fase.

${globalInstruction}

Tu tarea es generar un mensaje de finalización de la sesión de mentoría. Sigue las instrucciones del User Prompt meticulosamente.
`
        userPrompt = `
# Contexto del Usuario (Información Confidencial para tu Análisis)
- Nombre del Usuario: ${userProfile?.name || "Usuario"}
- Habilidad Actual en Foco: **${skillName}**
- Rol del Usuario: ${userProfile?.role || "No especificado"}
- Años de Experiencia: ${userProfile?.experience || "No especificado"}
- Descripción del Proyecto/Contexto Profesional del Usuario: ${userProfile?.projectDescription || "No especificado"}
- Principales Obstáculos que el Usuario enfrenta: ${userProfile?.obstacles || "No especificados"}
- Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName}): ${userProfile?.learningObjective || "No especificó un objetivo particular para esta habilidad."}
- Respuesta del Usuario a la Pregunta Abierta de Evaluación para ${skillName}: "${openEndedAnswer || "No proporcionó una respuesta a la pregunta abierta."}"

# Resultados de la Evaluación del Usuario en la Habilidad: ${skillName}
- Puntuación Global Obtenida: ${globalScore}/100.
- Nivel de Profundidad Recomendado para la Micro-lección: ${lessonDepth} (fundamental, standard, o advanced).
- Fortalezas Clave Identificadas (Indicadores con mayor puntaje en ${skillName}):
${strengths.map((s) => `  - Indicador: "${s.name}" (Puntuación: ${s.score}/100)`).join("\n")}
- Principales Áreas de Mejora Identificadas (Indicadores con menor puntaje en ${skillName}, relevantes para los obstáculos/respuesta abierta del usuario):
  - Indicador de Enfoque Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}" (Puntuación: ${indicatorScores.find((i) => i.id === focusIndicators.primary)?.score}/100)
  ${focusIndicators.secondary ? `  - Indicador de Enfoque Secundario: "${indicatorScores.find((i) => i.id === focusIndicators.secondary)?.name}" (Puntuación: ${indicatorScores.find((i) => i.id === focusIndicators.secondary)?.score}/100)` : ""}

# Análisis Previo de la Respuesta Abierta del Usuario (Relacionada con ${skillName}):
- Temas Clave en su Respuesta: ${preProcessedOpenAnswer.keyThemes.join(", ") || "No se identificaron temas clave específicos."}
- Problemas Específicos Mencionados en su Respuesta: ${preProcessedOpenAnswer.specificProblemsMentioned.join(", ") || "No se identificaron problemas específicos."}

# Micro-Lección, Escenario y Feedback Anteriores:
${conversationHistory
  .filter((msg) => msg.sender === "mentor")
  .map((msg) => msg.text)
  .join("\n")}

# Respuesta del Usuario al Feedback:
${userResponse || "No proporcionó una respuesta al feedback."}

# TU TAREA COMO MENTOR PRÁCTICO (Genera el siguiente mensaje de finalización para el usuario):

1.  **Resumen de la Sesión:**
    * **Título Sugerido:** \`### Resumen de tu Sesión de Mentoría en **${skillName}**\`
    * **Contenido del Resumen:**
        * Resume los puntos clave de la sesión de mentoría.
        * Menciona las fortalezas identificadas y las recomendaciones proporcionadas.
        * Agradece al usuario por su participación y compromiso con mejorar su habilidad en **${skillName}**.
        * **Personalización Esencial:** Asegúrate de que el resumen sea relevante para los \`Principales Obstáculos que el Usuario enfrenta\` y su \`Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName})\`.
        * Adapta la complejidad del resumen al \`Nivel de Profundidad Recomendado: ${lessonDepth}\`.
        * Estructura el resumen con párrafos cortos y/o listas (\`*\` o \`-\`) para facilitar la lectura.

2.  **Mensaje de Finalización:**
    * **Título Sugerido:** \`### ¡Felicitaciones por completar tu Sesión de Mentoría en **${skillName}**!\`
    * **Contenido del Mensaje:**
        * Formula un mensaje de finalización profesional y alentador.
        * Motiva al usuario a continuar practicando y aplicando lo aprendido.
        * Proporciona una llamada a la acción para seguir mejorando su habilidad en **${skillName}**.
        * **Personalización Esencial:** Asegúrate de que el mensaje sea relevante para los \`Principales Obstáculos que el Usuario enfrenta\` y su \`Objetivo de Aprendizaje del Usuario para ESTA HABILIDAD (${skillName})\`.
        * Adapta la complejidad del mensaje al \`Nivel de Profundidad Recomendado: ${lessonDepth}\`.
        * Estructura el mensaje con párrafos cortos y/o listas (\`*\` o \`-\`) para facilitar la lectura.

Asegúrate de que toda tu respuesta sea coherente, centrada en **${skillName}**, y que los nombres de los indicadores sean los descriptivos.
`
        nextPhase = "end"
        break

      default:
        return NextResponse.json({ error: "Fase de mentoría no reconocida." }, { status: 400 })
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    })

    const mentorMessage = response.choices[0]?.message?.content || "No se pudo generar una respuesta del mentor."

    return NextResponse.json({ mentorMessage, nextMentorPhase: nextPhase }, { status: 200 })
  } catch (error) {
    console.error("Error en el handler POST:", error)
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 })
  }
}
