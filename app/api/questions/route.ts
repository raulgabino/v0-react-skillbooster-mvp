import { NextResponse } from "next/server"

// Tipos para la respuesta API estructurada
interface IndicadorInfo {
  id: string
  nombre: string
  descripcion_indicador?: string
}

interface Question {
  id: string
  axis: string
  type: "likert" | "open"
  indicator: string
  prompt: string
}

interface SkillDefinitionFromJSON {
  name: string
  rubrica: Record<string, string>
  likert_indicators: string[]
  indicadores_info: IndicadorInfo[]
  open_question_id: string
  scoring_weights: {
    likert: number
    open: number
  }
  prompt_score_rubric_text: string
  prompt_tutor_definition: any
}

interface Skill {
  id: string
  name: string
  questions: Question[]
  indicadoresInfo: IndicadorInfo[]
  openQuestionId: string
}

// Datos integrados directamente en el código
const INTAKE_FORM_DATA: Question[] = [
  {
    id: "LE1",
    axis: "Liderazgo de Equipos",
    type: "likert",
    indicator: "LE1",
    prompt:
      "Al iniciar un nuevo proyecto, dedico una sesión específica para explicar no solo 'qué' haremos, sino 'por qué' es importante para la organización, y respondo preguntas hasta que todos lo tienen claro.",
  },
  {
    id: "LE2",
    axis: "Liderazgo de Equipos",
    type: "likert",
    indicator: "LE2",
    prompt:
      "Más allá de las evaluaciones formales, busco activamente oportunidades en el día a día para destacar públicamente una contribución específica de un miembro del equipo.",
  },
  {
    id: "LE3",
    axis: "Liderazgo de Equipos",
    type: "likert",
    indicator: "LE3",
    prompt:
      "Cuando delego una tarea importante, mi instinto principal es definir claramente el resultado final y luego dar al miembro del equipo total libertad sobre el 'cómo'.",
  },
  {
    id: "LE4",
    axis: "Liderazgo de Equipos",
    type: "likert",
    indicator: "LE4",
    prompt:
      "Si un miembro del equipo está luchando con una tarea, mi primera reacción es preguntarle qué necesita de mí, en lugar de asumir que sé cuál es el problema.",
  },
  {
    id: "LE5",
    axis: "Liderazgo de Equipos",
    type: "likert",
    indicator: "LE5",
    prompt:
      "Cuando hay conflictos en el equipo, intervengo rápidamente para facilitar una conversación constructiva entre las partes involucradas.",
  },
  {
    id: "LE7_open",
    axis: "Liderazgo de Equipos",
    type: "open",
    indicator: "LE7_open",
    prompt:
      "Considerando tu rol como ${userInfo.role}, imagina que un miembro talentoso de tu equipo muestra signos de desmotivación. Describe, paso a paso, cómo abordarías esta situación.",
  },
  {
    id: "CE1",
    axis: "Comunicación Estratégica",
    type: "likert",
    indicator: "CE1",
    prompt:
      "Antes de una comunicación importante, suelo tomarme un momento para definir los 1-3 puntos clave que la otra persona *debe* recordar.",
  },
  {
    id: "CE2",
    axis: "Comunicación Estratégica",
    type: "likert",
    indicator: "CE2",
    prompt:
      "Cuando explico un tema complejo a alguien de otro departamento, conscientemente evito la jerga técnica de mi área.",
  },
  {
    id: "CE3",
    axis: "Comunicación Estratégica",
    type: "likert",
    indicator: "CE3",
    prompt:
      "En reuniones importantes, suelo comenzar estableciendo claramente el objetivo de la reunión y qué decisiones necesitamos tomar.",
  },
  {
    id: "CE4",
    axis: "Comunicación Estratégica",
    type: "likert",
    indicator: "CE4",
    prompt:
      "Cuando presento información a diferentes audiencias, adapto conscientemente mi estilo y nivel de detalle según quién esté escuchando.",
  },
  {
    id: "CE7_open",
    axis: "Comunicación Estratégica",
    type: "open",
    indicator: "CE7_open",
    prompt:
      "Imagina que debes presentar tu proyecto a un directivo escéptico y con poco tiempo. Describe cómo estructurarías los primeros 2 minutos de tu comunicación.",
  },
  {
    id: "FC1",
    axis: "Feedback Efectivo y Coaching",
    type: "likert",
    indicator: "FC1",
    prompt: "Cuando doy feedback, evito generalidades como 'buen trabajo' y en su lugar doy ejemplos específicos.",
  },
  {
    id: "FC2",
    axis: "Feedback Efectivo y Coaching",
    type: "likert",
    indicator: "FC2",
    prompt:
      "Si observo un comportamiento que necesita ser corregido, prefiero tener una breve conversación privada el mismo día.",
  },
  {
    id: "FC3",
    axis: "Feedback Efectivo y Coaching",
    type: "likert",
    indicator: "FC3",
    prompt:
      "Cuando doy feedback de mejora, siempre incluyo al menos una sugerencia concreta de cómo la persona puede mejorar.",
  },
  {
    id: "FC4",
    axis: "Feedback Efectivo y Coaching",
    type: "likert",
    indicator: "FC4",
    prompt:
      "En conversaciones de desarrollo, hago más preguntas que afirmaciones, para ayudar a la persona a llegar a sus propias conclusiones.",
  },
  {
    id: "FC7_open",
    axis: "Feedback Efectivo y Coaching",
    type: "open",
    indicator: "FC7_open",
    prompt:
      "Un miembro junior de tu equipo ha cometido un error en una tarea importante. Describe cómo estructurarías la conversación de feedback.",
  },
  {
    id: "GC1",
    axis: "Gestión del Cambio",
    type: "likert",
    indicator: "GC1",
    prompt:
      "Cuando anuncio un cambio importante, dedico tiempo específico a explicar las razones detrás de la decisión, no solo qué va a cambiar.",
  },
  {
    id: "GC2",
    axis: "Gestión del Cambio",
    type: "likert",
    indicator: "GC2",
    prompt:
      "Antes de implementar cambios significativos, busco activamente input de las personas que serán más afectadas.",
  },
  {
    id: "GC3",
    axis: "Gestión del Cambio",
    type: "likert",
    indicator: "GC3",
    prompt:
      "Durante procesos de cambio, establezco check-ins regulares para escuchar preocupaciones y ajustar el enfoque si es necesario.",
  },
  {
    id: "GC7_open",
    axis: "Gestión del Cambio",
    type: "open",
    indicator: "GC7_open",
    prompt:
      "Tu organización debe implementar una nueva herramienta que cambiará significativamente cómo trabaja tu equipo. Describe tu estrategia para gestionar esta transición.",
  },
  {
    id: "TD1",
    axis: "Toma de Decisiones",
    type: "likert",
    indicator: "TD1",
    prompt:
      "Antes de tomar decisiones importantes, me aseguro de tener información de al menos 2-3 fuentes diferentes.",
  },
  {
    id: "TD2",
    axis: "Toma de Decisiones",
    type: "likert",
    indicator: "TD2",
    prompt: "Cuando enfrento decisiones complejas, suelo escribir los pros y contras para clarificar mi pensamiento.",
  },
  {
    id: "TD3",
    axis: "Toma de Decisiones",
    type: "likert",
    indicator: "TD3",
    prompt:
      "En situaciones de incertidumbre, prefiero tomar una decisión imperfecta rápidamente que esperar demasiado por información perfecta.",
  },
  {
    id: "TD7_open",
    axis: "Toma de Decisiones",
    type: "open",
    indicator: "TD7_open",
    prompt:
      "Describe una situación reciente donde tuviste que tomar una decisión difícil con información limitada. ¿Cómo abordaste el proceso?",
  },
]

const SKILL_DEFINITIONS_DATA: Record<string, SkillDefinitionFromJSON> = {
  liderazgo_equipos: {
    name: "Liderazgo de Equipos",
    rubrica: {
      LE1: "Visión y Alineación de Objetivos",
      LE2: "Motivación y Reconocimiento",
      LE3: "Delegación Efectiva",
      LE4: "Apoyo y Desarrollo",
      LE5: "Resolución de Conflictos",
    },
    likert_indicators: ["LE1", "LE2", "LE3", "LE4", "LE5"],
    indicadores_info: [
      {
        id: "LE1",
        nombre: "Visión y Alineación de Objetivos",
        descripcion_indicador:
          "Habilidad para comunicar una visión clara y asegurar que cada miembro del equipo comprenda cómo su trabajo contribuye a los objetivos más amplios.",
      },
      {
        id: "LE2",
        nombre: "Motivación y Reconocimiento",
        descripcion_indicador:
          "Capacidad para inspirar y motivar al equipo, reconociendo tanto el esfuerzo como los logros individuales y colectivos.",
      },
      {
        id: "LE3",
        nombre: "Delegación Efectiva",
        descripcion_indicador:
          "Habilidad para asignar tareas y responsabilidades de manera adecuada, confiando en el equipo y fomentando su autonomía.",
      },
      {
        id: "LE4",
        nombre: "Apoyo y Desarrollo",
        descripcion_indicador:
          "Capacidad para identificar las necesidades de desarrollo del equipo y proporcionar el apoyo necesario para su crecimiento.",
      },
      {
        id: "LE5",
        nombre: "Resolución de Conflictos",
        descripcion_indicador:
          "Habilidad para identificar, abordar y resolver conflictos de manera constructiva, manteniendo un ambiente de trabajo positivo.",
      },
    ],
    open_question_id: "LE7_open",
    scoring_weights: { likert: 0.6, open: 0.4 },
    prompt_score_rubric_text:
      "Evalúa la respuesta sobre liderazgo de equipos considerando empatía, estructura, soluciones y seguimiento.",
    prompt_tutor_definition: {},
  },
  comunicacion_estrategica: {
    name: "Comunicación Estratégica",
    rubrica: {
      CE1: "Claridad de Ideas Centrales",
      CE2: "Adaptación al Interlocutor",
      CE3: "Estructura y Organización",
      CE4: "Flexibilidad Comunicativa",
    },
    likert_indicators: ["CE1", "CE2", "CE3", "CE4"],
    indicadores_info: [
      {
        id: "CE1",
        nombre: "Claridad de Ideas Centrales",
        descripcion_indicador:
          "Capacidad para estructurar y transmitir el mensaje principal de forma simple y memorable.",
      },
      {
        id: "CE2",
        nombre: "Adaptación al Interlocutor",
        descripcion_indicador:
          "Habilidad para ajustar el lenguaje, tono y contenido según las necesidades y perfil de la audiencia.",
      },
      {
        id: "CE3",
        nombre: "Estructura y Organización",
        descripcion_indicador:
          "Capacidad para organizar la información de manera lógica y establecer objetivos claros en las comunicaciones.",
      },
      {
        id: "CE4",
        nombre: "Flexibilidad Comunicativa",
        descripcion_indicador:
          "Habilidad para adaptar el estilo y nivel de detalle según diferentes contextos y audiencias.",
      },
    ],
    open_question_id: "CE7_open",
    scoring_weights: { likert: 0.6, open: 0.4 },
    prompt_score_rubric_text:
      "Evalúa la respuesta sobre comunicación estratégica considerando claridad, adaptación, valor y persuasión.",
    prompt_tutor_definition: {},
  },
  feedback_coaching: {
    name: "Feedback Efectivo y Coaching",
    rubrica: {
      FC1: "Especificidad y Basado en Evidencia",
      FC2: "Oportuno y Relevante",
      FC3: "Orientado a Soluciones",
      FC4: "Enfoque de Coaching",
    },
    likert_indicators: ["FC1", "FC2", "FC3", "FC4"],
    indicadores_info: [
      {
        id: "FC1",
        nombre: "Especificidad y Basado en Evidencia",
        descripcion_indicador:
          "El feedback se centra en comportamientos o resultados observables y concretos, no en rasgos de personalidad.",
      },
      {
        id: "FC2",
        nombre: "Oportuno y Relevante",
        descripcion_indicador:
          "La retroalimentación se entrega en un momento cercano al evento, cuando todavía es relevante y puede generar un impacto.",
      },
      {
        id: "FC3",
        nombre: "Orientado a Soluciones",
        descripcion_indicador:
          "El feedback incluye sugerencias constructivas y actionables para la mejora, no solo identificación de problemas.",
      },
      {
        id: "FC4",
        nombre: "Enfoque de Coaching",
        descripcion_indicador:
          "Utiliza preguntas poderosas para guiar a la persona hacia sus propias conclusiones y soluciones.",
      },
    ],
    open_question_id: "FC7_open",
    scoring_weights: { likert: 0.6, open: 0.4 },
    prompt_score_rubric_text:
      "Evalúa la respuesta sobre feedback y coaching considerando seguridad psicológica, comportamiento, preguntas de coaching y balance.",
    prompt_tutor_definition: {},
  },
  gestion_cambio: {
    name: "Gestión del Cambio",
    rubrica: {
      GC1: "Comunicación del Cambio",
      GC2: "Participación e Involucramiento",
      GC3: "Seguimiento y Adaptación",
    },
    likert_indicators: ["GC1", "GC2", "GC3"],
    indicadores_info: [
      {
        id: "GC1",
        nombre: "Comunicación del Cambio",
        descripcion_indicador:
          "Capacidad para explicar claramente las razones, beneficios y impacto de los cambios organizacionales.",
      },
      {
        id: "GC2",
        nombre: "Participación e Involucramiento",
        descripcion_indicador:
          "Habilidad para involucrar a los stakeholders en el proceso de cambio, buscando su input y considerando sus perspectivas.",
      },
      {
        id: "GC3",
        nombre: "Seguimiento y Adaptación",
        descripcion_indicador:
          "Capacidad para monitorear el progreso del cambio y hacer ajustes necesarios basados en feedback y resultados.",
      },
    ],
    open_question_id: "GC7_open",
    scoring_weights: { likert: 0.6, open: 0.4 },
    prompt_score_rubric_text:
      "Evalúa la respuesta sobre gestión del cambio considerando planificación, comunicación, resistencia y seguimiento.",
    prompt_tutor_definition: {},
  },
  toma_decisiones: {
    name: "Toma de Decisiones",
    rubrica: {
      TD1: "Recopilación de Información",
      TD2: "Análisis Estructurado",
      TD3: "Decisión Oportuna",
    },
    likert_indicators: ["TD1", "TD2", "TD3"],
    indicadores_info: [
      {
        id: "TD1",
        nombre: "Recopilación de Información",
        descripcion_indicador:
          "Capacidad para buscar y obtener información relevante de múltiples fuentes antes de tomar decisiones importantes.",
      },
      {
        id: "TD2",
        nombre: "Análisis Estructurado",
        descripcion_indicador:
          "Habilidad para analizar sistemáticamente las opciones, considerando pros, contras y posibles consecuencias.",
      },
      {
        id: "TD3",
        nombre: "Decisión Oportuna",
        descripcion_indicador:
          "Capacidad para tomar decisiones en el momento adecuado, balanceando la necesidad de información con la urgencia de actuar.",
      },
    ],
    open_question_id: "TD7_open",
    scoring_weights: { likert: 0.6, open: 0.4 },
    prompt_score_rubric_text:
      "Evalúa la respuesta sobre toma de decisiones considerando proceso, criterios, stakeholders y aprendizaje.",
    prompt_tutor_definition: {},
  },
}

export async function GET(request: Request) {
  try {
    console.log("[API /api/questions] Iniciando procesamiento de datos de habilidades")

    // Procesar y combinar los datos directamente
    const combinedSkillsData: Skill[] = []

    for (const skillDefKey in SKILL_DEFINITIONS_DATA) {
      const definition = SKILL_DEFINITIONS_DATA[skillDefKey]
      const skillQuestions = INTAKE_FORM_DATA.filter((q) => q.axis === definition.name)

      if (skillQuestions.length > 0) {
        combinedSkillsData.push({
          id: skillDefKey,
          name: definition.name,
          questions: skillQuestions,
          indicadoresInfo: definition.indicadores_info,
          openQuestionId: definition.open_question_id,
        })
      }
    }

    console.log(`[API /api/questions] Procesadas ${combinedSkillsData.length} habilidades exitosamente`)

    // Devolver los datos combinados como respuesta
    return NextResponse.json(combinedSkillsData)
  } catch (error) {
    console.error("[API /api/questions] Error crítico:", error)

    // Respuesta de emergencia con datos mínimos
    const emergencyResponse: Skill[] = [
      {
        id: "liderazgo_equipos",
        name: "Liderazgo de Equipos",
        questions: [
          {
            id: "LE1",
            axis: "Liderazgo de Equipos",
            type: "likert",
            indicator: "LE1",
            prompt: "Comunico claramente la visión y objetivos del proyecto a mi equipo.",
          },
          {
            id: "LE7_open",
            axis: "Liderazgo de Equipos",
            type: "open",
            indicator: "LE7_open",
            prompt: "Describe cómo motivarías a un miembro desmotivado de tu equipo.",
          },
        ],
        indicadoresInfo: [
          { id: "LE1", nombre: "Visión y Comunicación", descripcion_indicador: "Comunicación efectiva de objetivos" },
        ],
        openQuestionId: "LE7_open",
      },
    ]

    return NextResponse.json(emergencyResponse)
  }
}
