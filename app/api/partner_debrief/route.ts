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
  descripcion_indicador?: string
  feedback_especifico?: string
}

interface SkillResult {
  skillId: string
  skillName: string
  globalScore: number
  indicatorScores: IndicatorScore[]
  tips: string[]
  mentorSessionData?: any
}

interface ConversationMessage {
  sender: "partner" | "user"
  text: string
}

interface PartnerDebriefRequestPayload {
  userInfo: UserInfo
  results: Record<string, SkillResult>
  conversationHistory: ConversationMessage[]
}

interface PartnerDebriefResponsePayload {
  partnerMessage: string
}

interface ErrorResponse {
  error: string
}

// --- Configuración OpenAI ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// --- Handler POST ---
export async function POST(request: Request): Promise<NextResponse<PartnerDebriefResponsePayload | ErrorResponse>> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API no está configurada." }, { status: 500 })
    }

    const { userInfo, results, conversationHistory } = (await request.json()) as PartnerDebriefRequestPayload

    console.log(`[API /api/partner_debrief] Iniciando síntesis estratégica para ${userInfo.name}`)

    // Construir el system prompt
    const systemPrompt = `
Eres un Estratega de Talento y Coach Ejecutivo altamente experimentado, especializado en el desarrollo integral de líderes y profesionales. Tu nombre es "Partner Digital" y actúas como un consejero estratégico de confianza.

Tu personalidad es:
- Perspicaz: Identificas patrones y conexiones que otros no ven
- Alentador: Mantienes un tono positivo y motivador
- Estratégico: Te enfocas en el crecimiento a futuro y el impacto a largo plazo
- Holístico: Consideras todas las habilidades en conjunto, no de forma aislada
- Práctico: Ofreces recomendaciones concretas y accionables

Tu expertise incluye:
- Análisis integral de competencias profesionales
- Identificación de sinergias entre diferentes habilidades
- Diseño de planes de desarrollo personalizados
- Coaching ejecutivo y mentoría estratégica
- Comprensión profunda de dinámicas organizacionales

Tu enfoque es siempre:
1. Ver el panorama completo del perfil profesional
2. Identificar cómo las fortalezas pueden potenciar las áreas de mejora
3. Proporcionar perspectivas que el usuario no había considerado
4. Ofrecer recomendaciones estratégicas de alto impacto
5. Fomentar la reflexión y el autodescubrimiento

Utiliza Markdown de forma efectiva para estructurar tus respuestas: '###' para títulos principales, '**negritas**' para conceptos clave, y listas con '*' para enumeraciones.
`

    // Preparar el resumen de resultados para el user prompt
    const resultsArray = Object.values(results)
    const skillsSummary = resultsArray
      .map((result) => {
        const highestIndicator = [...result.indicatorScores].sort((a, b) => b.score - a.score)[0]
        const lowestIndicator = [...result.indicatorScores].sort((a, b) => a.score - b.score)[0]

        return `
**${result.skillName}** (Puntuación Global: ${result.globalScore}/100)
- Fortaleza Principal: ${highestIndicator.name} (${highestIndicator.score}/100)
- Área de Oportunidad: ${lowestIndicator.name} (${lowestIndicator.score}/100)
- Indicadores Detallados: ${result.indicatorScores.map((ind) => `${ind.name}: ${ind.score}/100`).join(", ")}
${result.mentorSessionData?.exerciseScore ? `- Desempeño en Ejercicio Práctico: ${result.mentorSessionData.exerciseScore}/100` : ""}
`
      })
      .join("\n")

    // Construir el user prompt según si es una conversación nueva o continuación
    let userPrompt = ""

    if (conversationHistory.length === 0) {
      // Conversación nueva - Análisis inicial completo
      userPrompt = `
# PERFIL DEL USUARIO
- **Nombre:** ${userInfo.name}
- **Rol Actual:** ${userInfo.role}
- **Años de Experiencia:** ${userInfo.experience}
- **Contexto Profesional:** ${userInfo.projectDescription}
- **Principales Obstáculos:** ${userInfo.obstacles}
${userInfo.learningObjective ? `- **Objetivo de Aprendizaje:** ${userInfo.learningObjective}` : ""}

# RESULTADOS COMPLETOS DE LA EVALUACIÓN
${skillsSummary}

# INSTRUCCIONES PARA EL ANÁLISIS INICIAL

Como Partner Digital, tu tarea es proporcionar una síntesis estratégica y holística de los resultados de ${userInfo.name}. Sigue esta estructura:

1. **Saludo Personalizado:** Saluda a ${userInfo.name} por su nombre y reconoce su rol como ${userInfo.role}.

2. **Análisis Integral:** Analiza los resultados de TODAS las habilidades evaluadas en conjunto. No te enfoques en habilidades individuales, sino en el perfil completo.

3. **Identificación de Sinergias y Patrones:** Identifica al menos 2-3 conexiones estratégicas entre las diferentes habilidades. Por ejemplo:
   - Cómo una fortaleza en una habilidad puede ser una palanca para mejorar otra
   - Patrones consistentes que se repiten across múltiples habilidades
   - Oportunidades de desarrollo que, al ser abordadas, tendrían un impacto multiplicador

4. **Recomendaciones Estratégicas:** Ofrece 1-2 recomendaciones de alto nivel para el próximo mes, que:
   - Aprovechen sus fortalezas existentes
   - Aborden sus principales obstáculos (${userInfo.obstacles})
   - Sean específicas para su contexto como ${userInfo.role}
   - Tengan potencial de impacto significativo

5. **Pregunta de Apertura:** Termina con una pregunta abierta y reflexiva que invite a ${userInfo.name} a profundizar en algún aspecto específico de su desarrollo o situación profesional.

**Importante:** Tu análisis debe ser perspicaz, ir más allá de lo obvio, y ofrecer insights que ${userInfo.name} probablemente no había considerado antes.
`
    } else {
      // Conversación en curso - Continuar el diálogo
      const conversationContext = conversationHistory
        .map((msg) => `${msg.sender === "partner" ? "Partner Digital" : userInfo.name}: ${msg.text}`)
        .join("\n\n")

      userPrompt = `
# CONTEXTO DE LA CONVERSACIÓN ACTUAL

## Perfil del Usuario
- **Nombre:** ${userInfo.name}
- **Rol:** ${userInfo.role}
- **Contexto:** ${userInfo.projectDescription}
- **Obstáculos:** ${userInfo.obstacles}

## Resultados de Evaluación (Referencia)
${skillsSummary}

## Historial de la Conversación
${conversationContext}

# INSTRUCCIONES

Continúa la conversación de manera útil y estratégica como Partner Digital. Mantén el tono perspicaz, alentador y enfocado en el crecimiento. Utiliza el contexto de la conversación previa y los resultados de la evaluación para proporcionar insights valiosos y recomendaciones prácticas.

Responde de manera natural y conversacional, manteniendo tu rol como estratega de talento y coach ejecutivo.
`
    }

    // Llamar a la API de OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7, // Un poco más de creatividad para el análisis estratégico
    })

    const partnerMessage =
      response.choices[0]?.message?.content || "No se pudo generar una respuesta del Partner Digital."

    console.log(`[API /api/partner_debrief] Síntesis estratégica completada para ${userInfo.name}`)

    return NextResponse.json({ partnerMessage }, { status: 200 })
  } catch (error) {
    console.error("[API /api/partner_debrief] Error generando síntesis estratégica:", error)
    return NextResponse.json(
      { error: "Error interno del servidor al generar la síntesis estratégica." },
      { status: 500 },
    )
  }
}
