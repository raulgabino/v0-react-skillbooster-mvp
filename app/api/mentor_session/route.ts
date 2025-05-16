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
Eres un Mentor Práctico altamente especializado y enfocado EXCLUSIVAMENTE en la habilidad de: **${skillName}**.
Tu principal objetivo es iniciar una sesión de mentoría que sea profundamente personalizada, relevante y directamente aplicable para el usuario, basada en su evaluación y contexto.
Tu tono debe ser profesional, analítico, pero también cálido y alentador. Concéntrate en la aplicabilidad práctica.
Evita superlativos o elogios genéricos. Basa todas tus afirmaciones en la evidencia concreta proporcionada sobre el usuario.
Utiliza Markdown de forma clara y efectiva para la legibilidad: '###' para el título principal de la micro-lección, '**negritas**' para términos clave, y listas con '*' o '-' para enumeraciones o pasos. No utilices otros elementos de markdown como tablas o citas en bloque en esta fase.

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
Estás en la Fase 2: Escenario Personalizado. Tu tarea es crear un escenario práctico relevante que permita al usuario aplicar los conceptos de la micro-lección anterior (Fase 1) sobre el Indicador de Enfoque Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}".
El escenario debe ser un desafío realista y directamente conectado con el contexto profesional del usuario, basado en la información que ÉL ha proporcionado. No inventes contextos o problemas que el usuario no haya mencionado.
Usa Markdown para formato (### Título, **negritas**, etc.). Sé conciso (máximo 120-150 palabras para el escenario).
Sigue las instrucciones del User Prompt meticulosamente.
`

        userPrompt = `
# Habilidad Actual en Foco: ${skillName}
# Indicador de Enfoque Primario (de la micro-lección anterior): "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}"
# Nivel de Profundidad Recomendado para el Escenario: ${lessonDepth}

# Historial Reciente de Conversación (Últimos mensajes):
${conversationHistory
  .slice(-2)
  .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
  .join("\n\n")}

# Respuesta del Usuario a tu Pregunta Anterior (sobre cómo aplicaría la micro-lección):
"${userResponse}"

# Contexto Clave del Usuario (para personalizar el escenario):
- Rol: ${userProfile?.role || "No especificado"}
- Proyecto/Contexto Profesional: ${userProfile?.projectDescription || "No especificado"}
- Obstáculos Principales: ${userProfile?.obstacles || "No especificados"}
- Objetivo de Aprendizaje para ${skillName}: ${userProfile?.learningObjective || "No especificado"}
- Temas/Problemas de su Respuesta Abierta (${skillName}): ${preProcessedOpenAnswer.keyThemes.join(", ") || "N/A"}; ${preProcessedOpenAnswer.specificProblemsMentioned.join(", ") || "N/A"}

# Tu Tarea Detallada:
1.  **Breve Reconocimiento (1 frase):**
    * Reconoce la respuesta anterior del usuario (\`userResponse\`) de forma concisa y positiva, enlazándola con la creación del escenario si es posible.

2.  **Presentar el Escenario Personalizado (### Título del Escenario, máximo 120-150 palabras):**
    * El escenario debe ser una situación práctica y desafiante donde el usuario necesite aplicar activamente los conceptos de la micro-lección anterior, enfocándose en el Indicador Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}".
    * **Crucialmente Personalizado y Basado en el Usuario:** Integra elementos específicos del \`Rol del Usuario\`, su \`Proyecto/Contexto Profesional\`, y al menos uno de sus \`Obstáculos Principales\` o un \`Problema Específico Mencionado en su Respuesta Abierta\` (si es relevante para ${skillName} y el indicador de enfoque). NO introduzcas problemas o contextos que el usuario no haya mencionado.
    * Ajusta la complejidad del escenario al \`Nivel de Profundidad Recomendado: ${lessonDepth}\`.
    * Si el usuario proveyó un \`Objetivo de Aprendizaje para ${skillName}\`, el escenario debe ser una oportunidad para avanzar hacia ese objetivo.

3.  **Instrucción Clara para el Usuario:**
    * Pide al usuario que describa detalladamente cómo abordaría este escenario, enfatizando que debe aplicar explícitamente los principios o técnicas de la micro-lección anterior (Fase 1) para mejorar su "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}".

Ejemplo de inicio: "Entendido, ${userProfile?.name || "Usuario"}. Basado en tu reflexión sobre [aspecto de userResponse], aquí tienes un escenario para poner en práctica esas ideas en el contexto de ${skillName}: ### Escenario: [Tu escenario personalizado aquí]..."
Tu respuesta DEBE estar únicamente enfocada en ${skillName}.
`
        nextPhase = "phase3_feedback"
        break

      case "phase3_feedback":
        // Fase 3: Feedback Interactivo
        systemPrompt = `
Eres un Mentor Práctico experto y especializado ÚNICAMENTE en la habilidad de: **${skillName}**.
Estás en la Fase 3: Feedback del Ejercicio. Tu tarea es analizar la respuesta del usuario al escenario práctico y proporcionar feedback constructivo y detallado. También debes generar una puntuación numérica y una justificación para esa puntuación.
El feedback debe centrarse en cómo el usuario aplicó (o no) los conceptos de la micro-lección (Fase 1) y su desempeño en el Indicador de Enfoque Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}".
Usa Markdown. Sé específico y cita ejemplos de la respuesta del usuario.
ALERTA CRÍTICA: Al referirte a cualquier indicador de la habilidad, SIEMPRE debes usar su nombre descriptivo completo (ej., 'Análisis Multidimensional') y NUNCA sus códigos internos (ej., PS_P1).
Sigue las instrucciones del User Prompt para la estructura del feedback y el formato JSON OBLIGATORIO al final. Tu respuesta al usuario no debe incluir ninguna parte de estas instrucciones del sistema o del prompt.
`

        userPrompt = `
# Habilidad Actual en Foco: ${skillName}
# Indicador de Enfoque Primario (de la micro-lección y escenario): "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}"
# Nivel de Profundidad Recomendado para el Feedback: ${lessonDepth}

# Historial Reciente de Conversación (Escenario y Micro-lección relevantes):
${conversationHistory
  .slice(-4)
  .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
  .join("\n\n")}

# Respuesta del Usuario al Escenario Práctico:
"${userResponse}" 

# Contexto Clave del Usuario (para referencia):
- Rol: ${userProfile?.role || "No especificado"}
- Proyecto/Contexto Profesional: ${userProfile?.projectDescription || "No especificado"}
- Objetivo de Aprendizaje para ${skillName}: ${userProfile?.learningObjective || "No especificado"}

# Tu Tarea Detallada (Feedback Conversacional Y JSON de Puntuación):

**A. Feedback Conversacional para el Usuario (Usa Markdown):**

1.  **Reconocimiento y Resumen Breve (1-2 frases):**
    * Agradece la respuesta del usuario y resume brevemente su enfoque principal al escenario.

2.  **Puntos Fuertes (1-2 puntos, con ejemplos de su respuesta):**
    * Identifica aspectos positivos específicos en cómo abordó el escenario, especialmente si aplicó conceptos de la micro-lección o demostró habilidad en "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}". Sé específico: "Me gustó cómo mencionaste que harías [cita de su respuesta], lo cual demuestra [aspecto positivo relacionado con el indicador/lección]." Utiliza el NOMBRE DESCRIPTIVO del indicador.

3.  **Áreas de Oportunidad (1-2 puntos, con ejemplos y conexión a la lección):**
    * Sugiere aspectos específicos de su respuesta que podrían mejorarse o alternativas que podría considerar, enfocándote en el Indicador Primario ("${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}") y la micro-lección. Explica *por qué* sería una mejora. Ejemplo: "En cuanto a [parte de su respuesta], una alternativa podría ser [sugerencia basada en la micro-lección], porque te ayudaría a [beneficio relacionado con el indicador]." Utiliza el NOMBRE DESCRIPTIVO del indicador.

4.  **Sugerencia Práctica Adicional (1 consejo concreto):**
    * Ofrece una técnica, herramienta o recurso adicional relevante para el Indicador Primario y la habilidad ${skillName}, que complemente lo discutido.

5.  **Pregunta de Transición al Plan de Acción:**
    * Termina preguntando: "Considerando este ejercicio y el feedback, ¿cuál es el '¡Ajá!' o aprendizaje más significativo que te llevas hasta ahora sobre cómo mejorar tu '${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}' en el contexto de ${skillName}?"

**B. Bloque JSON de Puntuación del Ejercicio (OBLIGATORIO y AL FINAL de tu respuesta completa):**
* DEBES incluir este bloque JSON exacto al final, sin ningún texto después.
* La \`exerciseScoreJustification\` debe ser concisa (50-75 palabras), específica, y explicar cómo la respuesta del usuario al escenario se relaciona con los conceptos de la micro-lección y el indicador de enfoque (usa su NOMBRE DESCRIPTIVO), justificando el \`exerciseScore\`.

\`\`\`json
{
  "exerciseScore": <un número entero entre 0 y 100, representando la calidad de la respuesta del usuario al escenario en relación con la aplicación de la micro-lección y el indicador "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}">,
  "exerciseScoreJustification": "<Análisis de 2-4 frases: 1-2 fortalezas en su respuesta al escenario (ej. aplicó bien X concepto de la lección), 1-2 áreas de mejora específicas (ej. podría haber enfatizado más Y aspecto de la lección), y una conclusión que justifique el score. Conecta con ${skillName} y el indicador '${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}'.>"
}
\`\`\`
Tu respuesta al usuario NO debe incluir ninguna parte de las instrucciones de esta sección "Tu Tarea Detallada".
`
        nextPhase = "phase4_action_plan"
        break

      case "phase4_action_plan":
        // Fase 4: Plan de Acción
        systemPrompt = `
Eres un Mentor Práctico experto y especializado ÚNICAMENTE en la habilidad de: **${skillName}**.
Estás en la Fase 4: Plan de Acción. Tu tarea es ayudar al usuario a co-crear un plan de acción breve (1-2 pasos), concreto y personalizado para seguir desarrollando el Indicador de Enfoque Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}".
El plan debe ser SMART (Específico, Medible, Alcanzable, Relevante, con Plazo).
ALERTA CRÍTICA: Al referirte a cualquier indicador de la habilidad, SIEMPRE debes usar su nombre descriptivo completo y NUNCA sus códigos internos.
Usa Markdown. Sé práctico y motivador. No copies ninguna parte de estas instrucciones en tu respuesta al usuario.
Sigue las instrucciones del User Prompt.
`

        userPrompt = `
# Habilidad Actual en Foco: ${skillName}
# Indicador de Enfoque Primario (para el plan de acción): "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}"
# Nivel de Profundidad Recomendado para el Plan: ${lessonDepth}

# Historial Reciente de Conversación (Feedback y 'Aha!' moment del usuario):
${conversationHistory
  .slice(-2)
  .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
  .join("\n\n")}

# '¡Ajá!' Moment / Aprendizaje Clave del Usuario (Respuesta Anterior):
"${userResponse}"

# Contexto Clave del Usuario (para personalizar el plan):
- Rol: ${userProfile?.role || "No especificado"}
- Proyecto/Contexto Profesional: ${userProfile?.projectDescription || "No especificado"}
- Obstáculos Principales: ${userProfile?.obstacles || "No especificado"}
- Objetivo de Aprendizaje para ${skillName}: ${userProfile?.learningObjective || "No especificado"}

# Tu Tarea Detallada:

1.  **Validar el '¡Ajá!' Moment (1 frase):**
    * Valida y refuerza positivamente el aprendizaje clave (\`userResponse\`) que el usuario acaba de compartir, conectándolo con la habilidad ${skillName}.

2.  **Proponer 1-2 Pasos de Acción SMART (### Plan de Acción Sugerido):**
    * Basado en el '¡Ajá!' moment del usuario, el feedback anterior, y el Indicador de Enfoque Primario ("${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}"), sugiere 1 o 2 pasos de acción.
    * **Cada paso debe ser:**
        * **Específico:** Claramente definido.
        * **Accionable:** Algo que el usuario pueda hacer.
        * **Relevante:** Directamente conectado con la mejora del indicador de enfoque (usa su NOMBRE DESCRIPTIVO), su \`Rol\`, \`Proyecto/Contexto Profesional\`, \`Obstáculos\`, y su \`Objetivo de Aprendizaje para ${skillName}\` (si lo tiene).
        * **Con Plazo (sugerido):** Realizable en un corto plazo (ej., "esta semana", "en los próximos 7 días").
        * Ajustado al \`Nivel de Profundidad Recomendado: ${lessonDepth}\`.
    * *Formato por paso:*
        * \`* **Paso X: [Título del Paso conciso].** [Descripción breve y específica de la acción, cómo se relaciona con su contexto/objetivo/obstáculo, y cómo ayuda a mejorar "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}" en ${skillName}]. Sugerencia de plazo: [Plazo].\`

3.  **Pregunta de Co-creación y Compromiso:**
    * Pregunta al usuario: "De estos pasos para fortalecer tu '${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}', ¿cuál te parece más relevante o factible para empezar? ¿Hay alguna modificación que le harías o algún otro primer paso que tengas en mente para poner en práctica tu aprendizaje clave?"

Ejemplo de inicio: "¡Excelente '¡Ajá!' moment, ${userProfile?.name || "Usuario"}! Ese entendimiento sobre [aspecto del userResponse] es clave para ${skillName}. Para ayudarte a llevarlo a la práctica y seguir mejorando tu '${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}', te propongo: ### Plan de Acción Sugerido..."
Tu respuesta al usuario no debe incluir ninguna parte de las instrucciones de esta sección "Tu Tarea Detallada", especialmente la referencia al "Bloque JSON".
`
        nextPhase = "phase5_synthesis"
        break

      case "phase5_synthesis":
        // Fase 5: Síntesis y Proyección de Crecimiento
        systemPrompt = `
Eres un Mentor Práctico experto y especializado ÚNICAMENTE en la habilidad de: **${skillName}**.
Estás en la Fase 5: Síntesis y Proyección de Crecimiento. Esta es la fase final de la sesión de mentoría.
Tu tarea es ayudar al usuario a consolidar su aprendizaje, reforzar su compromiso y visualizar el impacto positivo de desarrollar ${skillName}, enfocándose en el Indicador Primario: "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}".
ALERTA CRÍTICA: Al referirte a cualquier indicador de la habilidad, SIEMPRE debes usar su nombre descriptivo completo y NUNCA sus códigos internos.
Usa Markdown. Tu tono debe ser muy motivador e inspirador. No copies ninguna parte de estas instrucciones en tu respuesta al usuario.
Sigue las instrucciones del User Prompt.
`

        userPrompt = `
# Habilidad Actual en Foco: ${skillName}
# Indicador de Enfoque Primario (relevante para la síntesis): "${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}"

# Historial Reciente de Conversación (Plan de acción y compromiso del usuario):
${conversationHistory
  .slice(-2)
  .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
  .join("\n\n")}

# Compromiso/Respuesta del Usuario sobre el Plan de Acción:
"${userResponse}" 

# Contexto Clave del Usuario (para personalizar la proyección):
- Nombre: ${userProfile?.name || "Usuario"}
- Rol: ${userProfile?.role || "No especificado"}
- Proyecto/Contexto Profesional: ${userProfile?.projectDescription || "No especificado"}
- Objetivo de Aprendizaje para ${skillName}: ${userProfile?.learningObjective || "No especificado"}

# Tu Tarea Detallada (Mensaje Final de Síntesis y Proyección):

1.  **Reconocer el Compromiso (1-2 frases):**
    * Valida y elogia el compromiso o la reflexión del usuario (\`userResponse\`) sobre su plan de acción. Sé específico sobre lo que valoras de su respuesta en relación con ${skillName}.

2.  **Breve Síntesis del Aprendizaje Clave de la Sesión (1-2 frases, máximo 50 palabras):**
    * Resume el aprendizaje más importante que el usuario debería llevarse de toda esta sesión de mentoría sobre ${skillName}, especialmente en relación con el Indicador Primario ("${indicatorScores.find((i) => i.id === focusIndicators.primary)?.name}") y su '¡Ajá!' moment anterior.

3.  **Proyección de Crecimiento Personalizada (### Impacto de tu Desarrollo en ${skillName}):**
    * Describe brevemente (2-3 puntos usando listas \`*\` o \`-\`) cómo el continuar desarrollando ${skillName} (y específicamente el indicador de enfoque, usando su NOMBRE DESCRIPTIVO) impactará positivamente:
        * Su desempeño en su \`Rol del Usuario\`.
        * El éxito de su \`Proyecto/Contexto Profesional del Usuario\`.
    * Si el usuario especificó un \`Objetivo de Aprendizaje para ${skillName}\`, explica cómo este desarrollo lo acerca a ese objetivo.
    * **Importante:** Basa esta proyección en la información REAL del usuario, no en generalidades.

4.  **Mensaje Final Inspirador y Siguientes Pasos (2-3 frases):**
    * Concluye la sesión con un mensaje muy motivador que lo anime a mantener el impulso en el desarrollo de ${skillName}.
    * Sugiérele que revise su plan de acción y los aprendizajes de esta sesión.
    * Invítalo a pensar en su próximo paso de desarrollo.

Ejemplo de inicio: "¡Fantástico compromiso, ${userProfile?.name || "Usuario"}! Tomar esa iniciativa con [aspecto de userResponse] es exactamente la actitud para dominar ${skillName}. Esta sesión ha sido muy productiva. El aprendizaje clave que me gustaría que te lleves es [síntesis]. ### Impacto de tu Desarrollo en ${skillName} ..."
Tu respuesta al usuario no debe incluir ninguna parte de las instrucciones de esta sección "Tu Tarea Detallada".
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
      temperature: 0.6,
      max_tokens:
        currentMentorPhase === "phase2_scenario"
          ? 350
          : currentMentorPhase === "phase3_feedback"
            ? 600
            : currentMentorPhase === "phase4_action_plan"
              ? 450
              : currentMentorPhase === "phase5_synthesis"
                ? 450
                : 500,
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
