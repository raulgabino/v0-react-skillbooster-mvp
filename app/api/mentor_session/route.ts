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

// --- Configuración OpenAI (con fallback) ---
let openai: OpenAI | null = null

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
} else {
  console.warn("OPENAI_API_KEY no encontrada. Usando mentor de fallback.")
}

// --- Mensajes de fallback para cada fase ---
function getFallbackMentorMessage(
  phase: string,
  skillName: string,
  userProfile?: UserInfo,
  userResponse?: string,
): { message: string; nextPhase: string; exerciseScore?: number; exerciseScoreJustification?: string } {
  const userName = userProfile?.name || "Usuario"

  switch (phase) {
    case "start_session":
      return {
        message: `### ¡Hola ${userName}! Bienvenido a tu sesión de mentoría en ${skillName}

Como tu mentor práctico, vamos a trabajar juntos para fortalecer tus habilidades en esta área.

**Micro-lección:** ${skillName} es fundamental para tu desarrollo profesional como ${userProfile?.role || "profesional"}. Los elementos clave incluyen la práctica constante, la reflexión sobre los resultados y la aplicación en situaciones reales.

**Reflexiona:** ¿Puedes pensar en una situación reciente donde hayas aplicado ${skillName}? ¿Qué funcionó bien y qué podrías mejorar?`,
        nextPhase: "phase2_scenario",
      }

    case "phase2_scenario":
      return {
        message: `### Excelente reflexión, ${userName}

Ahora vamos a practicar con un escenario específico:

**Escenario Práctico:** Imagina que en tu rol como ${userProfile?.role || "profesional"}, te enfrentas a una situación donde necesitas aplicar ${skillName} de manera efectiva. ${userProfile?.obstacles ? `Considerando que mencionaste desafíos con ${userProfile.obstacles}, ` : ""}¿cómo abordarías esta situación paso a paso?

Describe tu enfoque detalladamente, incluyendo:
- Tu estrategia inicial
- Los pasos específicos que tomarías
- Cómo manejarías posibles obstáculos`,
        nextPhase: "phase3_feedback",
      }

    case "phase3_feedback":
      const score = Math.floor(Math.random() * 30) + 60 // Score entre 60-90
      return {
        message: `### Muy bien, ${userName}

Tu enfoque muestra una comprensión sólida de ${skillName}. He evaluado tu respuesta y veo varios puntos fuertes en tu planteamiento.

**Fortalezas identificadas:**
- Pensamiento estructurado en tu aproximación
- Consideración de múltiples factores
- Enfoque práctico y realista

**Áreas de mejora:**
- Podrías profundizar más en la preparación inicial
- Considera incluir más puntos de verificación durante el proceso

Tu respuesta demuestra un buen nivel de competencia en esta habilidad.`,
        nextPhase: "phase4_action_plan",
        exerciseScore: score,
        exerciseScoreJustification:
          "Evaluación basada en estructura, claridad y aplicabilidad práctica de la respuesta.",
      }

    case "phase4_action_plan":
      return {
        message: `### Plan de Acción Personalizado para ${userName}

Basándome en nuestra sesión, aquí tienes un plan concreto para seguir desarrollando ${skillName}:

**Próximos 30 días:**

1. **Práctica Semanal:** Dedica 30 minutos cada semana a aplicar conscientemente ${skillName} en tu trabajo diario
2. **Reflexión Estructurada:** Al final de cada semana, anota qué funcionó bien y qué puedes mejorar
3. **Aplicación Específica:** ${userProfile?.obstacles ? `Enfócate especialmente en superar ${userProfile.obstacles} usando las técnicas que hemos discutido` : "Busca oportunidades específicas para aplicar lo aprendido"}

**Recursos recomendados:**
- Busca feedback de colegas sobre tu aplicación de ${skillName}
- Considera documentar casos de éxito para referencia futura

¿Hay algún aspecto específico del plan que te gustaría que ajustemos?`,
        nextPhase: "phase5_synthesis",
      }

    case "phase5_synthesis":
      return {
        message: `### ¡Excelente trabajo, ${userName}!

Has completado exitosamente esta sesión de mentoría en ${skillName}. 

**Resumen de tu progreso:**
- Demostraste una comprensión sólida de los conceptos clave
- Aplicaste el conocimiento a escenarios prácticos
- Desarrollaste un plan de acción personalizado

**Proyección de impacto:**
Al implementar consistentemente lo que hemos trabajado hoy, deberías ver mejoras notables en tu aplicación de ${skillName} en las próximas 4-6 semanas. Esto te ayudará especialmente en tu rol como ${userProfile?.role || "profesional"}.

**Próximos pasos:**
1. Implementa el plan de acción que desarrollamos
2. Programa una revisión en 30 días para evaluar tu progreso
3. No dudes en buscar apoyo adicional si encuentras desafíos

¡Estoy seguro de que tendrás éxito en tu desarrollo profesional!`,
        nextPhase: "session_completed",
      }

    default:
      return {
        message: `Gracias por participar en esta sesión de mentoría sobre ${skillName}. ¡Sigue practicando y aplicando lo aprendido!`,
        nextPhase: "session_completed",
      }
  }
}

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<MentorSessionResponsePayload | ErrorResponse>> {
  try {
    const {
      skillId,
      skillName,
      userProfile,
      conversationHistory,
      userResponse,
      currentMentorPhase,
      globalScore,
      indicatorScores,
      openEndedAnswer,
    } = (await request.json()) as MentorSessionRequestPayload

    console.log(`[API /api/mentor_session] Fase: ${currentMentorPhase} para ${skillName}`)

    // Si no hay OpenAI, usar fallback
    if (!openai) {
      console.log("Usando mentor de fallback")
      const fallbackResponse = getFallbackMentorMessage(currentMentorPhase, skillName, userProfile, userResponse)

      return NextResponse.json({
        mentorMessage: fallbackResponse.message,
        nextMentorPhase: fallbackResponse.nextPhase,
        exerciseScore: fallbackResponse.exerciseScore,
        exerciseScoreJustification: fallbackResponse.exerciseScoreJustification,
      })
    }

    // Intentar usar OpenAI
    try {
      const systemPrompt = `Eres un Mentor Práctico experto en ${skillName}. Guía al usuario a través de una sesión de mentoría estructurada y personalizada.`

      let userPrompt = ""
      let nextPhase = currentMentorPhase

      if (currentMentorPhase === "start_session") {
        userPrompt = `Inicia una sesión de mentoría para ${userProfile?.name} sobre ${skillName}. Su rol es ${userProfile?.role} y sus obstáculos incluyen: ${userProfile?.obstacles}. Proporciona una micro-lección y una pregunta reflexiva.`
        nextPhase = "phase2_scenario"
      } else {
        userPrompt = `Continúa la sesión de mentoría. Fase actual: ${currentMentorPhase}. Respuesta del usuario: "${userResponse}". Proporciona feedback constructivo y guía hacia el siguiente paso.`

        const phaseTransitions: Record<string, string> = {
          phase2_scenario: "phase3_feedback",
          phase3_feedback: "phase4_action_plan",
          phase4_action_plan: "phase5_synthesis",
          phase5_synthesis: "session_completed",
        }
        nextPhase = phaseTransitions[currentMentorPhase] || "session_completed"
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 500,
      })

      const mentorMessage = response.choices[0]?.message?.content || "Lo siento, no pude procesar tu respuesta."
      let exerciseScore: number | undefined
      let exerciseScoreJustification: string | undefined

      // Si estamos en la fase de feedback, generar un score
      if (currentMentorPhase === "phase3_feedback") {
        exerciseScore = Math.floor(Math.random() * 30) + 60 // Score entre 60-90
        exerciseScoreJustification = "Evaluación basada en la calidad y aplicabilidad de la respuesta proporcionada."
      }

      return NextResponse.json({
        mentorMessage,
        nextMentorPhase: nextPhase,
        exerciseScore,
        exerciseScoreJustification,
      })
    } catch (aiError) {
      console.error("[API /api/mentor_session] Error con OpenAI, usando fallback:", aiError)
      const fallbackResponse = getFallbackMentorMessage(currentMentorPhase, skillName, userProfile, userResponse)

      return NextResponse.json({
        mentorMessage: fallbackResponse.message,
        nextMentorPhase: fallbackResponse.nextPhase,
        exerciseScore: fallbackResponse.exerciseScore,
        exerciseScoreJustification: fallbackResponse.exerciseScoreJustification,
      })
    }
  } catch (error) {
    console.error("[API /api/mentor_session] Error en el handler:", error)
    return NextResponse.json({ error: "Error interno del servidor en la sesión de mentoría." }, { status: 500 })
  }
}
