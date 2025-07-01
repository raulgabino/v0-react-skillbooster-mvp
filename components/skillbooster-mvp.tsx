"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import SkillSelectionStep from "./SkillSelectionStep"
import SkillObjectiveStep from "./SkillObjectiveStep"
import ResultsStep from "./results-step"
import MentorSessionInterface, { type MentorSessionData } from "./mentor-session-interface"
import LoadingSpinner from "./ui/LoadingSpinner"
import ReactMarkdown from "react-markdown"

// --- Tipos ---
interface UserInfo {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
  learningObjective?: string
}

interface Question {
  id: string
  axis: string
  type: "likert" | "open"
  indicator: string
  prompt: string
}

interface Skill {
  id: string
  name: string
  questions: Question[]
  indicadoresInfo: Array<{ id: string; nombre: string; descripcion_indicador?: string }>
  openQuestionId: string
}

interface Answer {
  questionId: string
  value: string | number
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
  mentorSessionData?: MentorSessionData
}

interface ConversationMessage {
  sender: "partner" | "user"
  text: string
}

// --- Componente Principal ---
const SkillBoosterMVP: React.FC = () => {
  // Estados principales
  const [currentStep, setCurrentStep] = useState<
    "intro" | "userInfo" | "skillSelection" | "skillObjective" | "assessment" | "results" | "mentorSession" | "summary"
  >("intro")

  // Estados de datos
  const [userInfo, setUserInfo] = useState<UserInfo>({
    name: "",
    role: "",
    experience: "",
    projectDescription: "",
    obstacles: "",
    learningObjective: "",
  })

  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [allSkills, setAllSkills] = useState<Skill[]>([])
  const [currentSkillIndex, setCurrentSkillIndex] = useState(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [results, setResults] = useState<Record<string, SkillResult>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Estados para sesión de mentoría
  const [showMentorSession, setShowMentorSession] = useState(false)
  const [currentMentorSkill, setCurrentMentorSkill] = useState<string | null>(null)

  // Estados para resumen final
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [currentUserInput, setCurrentUserInput] = useState("")
  const [isPartnerLoading, setIsPartnerLoading] = useState(false)

  // Cargar habilidades al montar el componente
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        setError(null)
        console.log("Intentando cargar habilidades desde /api/questions")

        const response = await fetch("/api/questions")

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }

        const skillsData: Skill[] = await response.json()

        if (!skillsData || skillsData.length === 0) {
          throw new Error("No se recibieron datos de habilidades")
        }

        setAllSkills(skillsData)
        console.log(`Habilidades cargadas exitosamente: ${skillsData.length} habilidades`)
      } catch (error) {
        console.error("Error cargando habilidades:", error)
        setError(`Error al cargar las habilidades: ${error instanceof Error ? error.message : "Error desconocido"}`)

        // Fallback: crear habilidades básicas
        const fallbackSkills: Skill[] = [
          {
            id: "liderazgo_equipos",
            name: "Liderazgo de Equipos",
            questions: [
              {
                id: "LE1",
                axis: "Liderazgo de Equipos",
                type: "likert",
                indicator: "LE1",
                prompt:
                  "Al iniciar un nuevo proyecto, dedico tiempo a explicar claramente los objetivos y la importancia del trabajo a realizar.",
              },
              {
                id: "LE2",
                axis: "Liderazgo de Equipos",
                type: "likert",
                indicator: "LE2",
                prompt:
                  "Busco activamente oportunidades para reconocer y destacar las contribuciones de los miembros de mi equipo.",
              },
              {
                id: "LE7_open",
                axis: "Liderazgo de Equipos",
                type: "open",
                indicator: "LE7_open",
                prompt:
                  "Describe cómo abordarías una situación donde un miembro talentoso de tu equipo muestra signos de desmotivación.",
              },
            ],
            indicadoresInfo: [
              { id: "LE1", nombre: "Visión y Alineación", descripcion_indicador: "Comunicación clara de objetivos" },
              { id: "LE2", nombre: "Reconocimiento", descripcion_indicador: "Valoración del trabajo del equipo" },
            ],
            openQuestionId: "LE7_open",
          },
          {
            id: "comunicacion_estrategica",
            name: "Comunicación Estratégica",
            questions: [
              {
                id: "CE1",
                axis: "Comunicación Estratégica",
                type: "likert",
                indicator: "CE1",
                prompt:
                  "Antes de comunicaciones importantes, defino claramente los puntos clave que quiero transmitir.",
              },
              {
                id: "CE2",
                axis: "Comunicación Estratégica",
                type: "likert",
                indicator: "CE2",
                prompt: "Adapto mi lenguaje y estilo de comunicación según mi audiencia.",
              },
              {
                id: "CE7_open",
                axis: "Comunicación Estratégica",
                type: "open",
                indicator: "CE7_open",
                prompt:
                  "Describe cómo presentarías un proyecto importante a un directivo escéptico con poco tiempo disponible.",
              },
            ],
            indicadoresInfo: [
              { id: "CE1", nombre: "Claridad de Mensaje", descripcion_indicador: "Estructuración clara de ideas" },
              { id: "CE2", nombre: "Adaptación", descripcion_indicador: "Ajuste según la audiencia" },
            ],
            openQuestionId: "CE7_open",
          },
          {
            id: "feedback_coaching",
            name: "Feedback Efectivo y Coaching",
            questions: [
              {
                id: "FC1",
                axis: "Feedback Efectivo y Coaching",
                type: "likert",
                indicator: "FC1",
                prompt: "Cuando doy feedback, me enfoco en comportamientos específicos y observables.",
              },
              {
                id: "FC2",
                axis: "Feedback Efectivo y Coaching",
                type: "likert",
                indicator: "FC2",
                prompt: "Proporciono feedback de manera oportuna, cerca del momento en que ocurrió la situación.",
              },
              {
                id: "FC7_open",
                axis: "Feedback Efectivo y Coaching",
                type: "open",
                indicator: "FC7_open",
                prompt:
                  "Describe cómo estructurarías una conversación de feedback con un miembro junior que cometió un error importante.",
              },
            ],
            indicadoresInfo: [
              { id: "FC1", nombre: "Especificidad", descripcion_indicador: "Feedback basado en evidencia" },
              { id: "FC2", nombre: "Oportunidad", descripcion_indicador: "Timing adecuado del feedback" },
            ],
            openQuestionId: "FC7_open",
          },
        ]

        setAllSkills(fallbackSkills)
        console.log("Usando habilidades de fallback")
      }
    }
    fetchSkills()
  }, [])

  // Cargar resultados guardados del localStorage al montar el componente
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedResults = localStorage.getItem("skillBoosterResults")
      if (savedResults) {
        try {
          setResults(JSON.parse(savedResults))
        } catch (error) {
          console.error("Error parsing saved results:", error)
        }
      }
    }
  }, [])

  // Guardar resultados en localStorage cuando cambien
  useEffect(() => {
    if (typeof window !== "undefined" && Object.keys(results).length > 0) {
      localStorage.setItem("skillBoosterResults", JSON.stringify(results))
    }
  }, [results])

  // Funciones de navegación
  const nextStep = () => {
    switch (currentStep) {
      case "intro":
        setCurrentStep("userInfo")
        break
      case "userInfo":
        setCurrentStep("skillSelection")
        break
      case "skillSelection":
        setCurrentStep("skillObjective")
        break
      case "skillObjective":
        setCurrentStep("assessment")
        break
      case "assessment":
        setCurrentStep("results")
        break
      case "results":
        if (currentSkillIndex < selectedSkills.length - 1) {
          setCurrentSkillIndex(currentSkillIndex + 1)
          setCurrentQuestionIndex(0)
          setCurrentStep("skillObjective")
        } else {
          setCurrentStep("summary")
        }
        break
      case "mentorSession":
        setCurrentStep("results")
        setShowMentorSession(false)
        break
      default:
        break
    }
  }

  const prevStep = () => {
    switch (currentStep) {
      case "userInfo":
        setCurrentStep("intro")
        break
      case "skillSelection":
        setCurrentStep("userInfo")
        break
      case "skillObjective":
        if (currentSkillIndex > 0) {
          setCurrentSkillIndex(currentSkillIndex - 1)
          setCurrentStep("results")
        } else {
          setCurrentStep("skillSelection")
        }
        break
      case "assessment":
        setCurrentStep("skillObjective")
        break
      case "results":
        setCurrentStep("assessment")
        break
      case "summary":
        setCurrentStep("results")
        break
      default:
        break
    }
  }

  // Función para manejar respuestas
  const handleAnswer = (questionId: string, value: string | number) => {
    setAnswers((prev) => {
      const existingIndex = prev.findIndex((a) => a.questionId === questionId)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = { questionId, value }
        return updated
      }
      return [...prev, { questionId, value }]
    })
  }

  // Función para enviar evaluación
  const submitAssessment = async () => {
    const currentSkill = allSkills.find((s) => s.id === selectedSkills[currentSkillIndex])
    if (!currentSkill) return

    setIsLoading(true)
    setError(null)

    try {
      const skillAnswers = answers.filter((a) => currentSkill.questions.some((q) => q.id === a.questionId))

      const scoreResponse = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: currentSkill.id,
          answers: skillAnswers,
        }),
      })

      if (!scoreResponse.ok) throw new Error("Error al calcular puntuaciones")
      const scoreData = await scoreResponse.json()

      const openEndedAnswer = skillAnswers.find((a) => a.questionId === currentSkill.openQuestionId)?.value as string

      const lessonResponse = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: currentSkill.id,
          userInfo,
          indicatorScores: scoreData.indicatorScores,
          globalScore: scoreData.globalScore,
          openEndedAnswer,
        }),
      })

      if (!lessonResponse.ok) throw new Error("Error al generar recomendaciones")
      const lessonData = await lessonResponse.json()

      const skillResult: SkillResult = {
        skillId: currentSkill.id,
        skillName: currentSkill.name,
        globalScore: scoreData.globalScore,
        indicatorScores: scoreData.indicatorScores,
        tips: lessonData.tips,
      }

      setResults((prev) => ({
        ...prev,
        [currentSkill.id]: skillResult,
      }))

      nextStep()
    } catch (error) {
      console.error("Error en evaluación:", error)
      setError("Error al procesar la evaluación. Por favor, intenta de nuevo.")
    } finally {
      setIsLoading(false)
    }
  }

  // Función para iniciar sesión de mentoría
  const startMentorSession = (skillId: string) => {
    setCurrentMentorSkill(skillId)
    setShowMentorSession(true)
    setCurrentStep("mentorSession")
  }

  // Función para completar sesión de mentoría
  const completeMentorSession = (sessionData: MentorSessionData) => {
    if (currentMentorSkill && results[currentMentorSkill]) {
      setResults((prev) => ({
        ...prev,
        [currentMentorSkill]: {
          ...prev[currentMentorSkill],
          mentorSessionData: sessionData,
        },
      }))
    }
    setShowMentorSession(false)
    setCurrentMentorSkill(null)
    setCurrentStep("results")
  }

  // Función para inicializar conversación con Partner Digital
  const initializePartnerConversation = async () => {
    if (conversationHistory.length > 0) return

    setIsPartnerLoading(true)
    try {
      const response = await fetch("/api/partner_debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInfo,
          results,
          conversationHistory: [],
        }),
      })

      if (!response.ok) throw new Error("Error al inicializar conversación")
      const data = await response.json()

      setConversationHistory([
        {
          sender: "partner",
          text: data.partnerMessage,
        },
      ])
    } catch (error) {
      console.error("Error inicializando conversación:", error)
      setConversationHistory([
        {
          sender: "partner",
          text: "¡Hola! Soy tu Partner Digital. Lamentablemente hay un problema técnico, pero puedo ayudarte a analizar tus resultados. ¿Qué te gustaría explorar sobre tu evaluación?",
        },
      ])
    } finally {
      setIsPartnerLoading(false)
    }
  }

  // Función para enviar mensaje al Partner Digital
  const sendMessageToPartner = async () => {
    if (!currentUserInput.trim() || isPartnerLoading) return

    const userMessage: ConversationMessage = {
      sender: "user",
      text: currentUserInput.trim(),
    }

    const updatedHistory = [...conversationHistory, userMessage]
    setConversationHistory(updatedHistory)
    setCurrentUserInput("")
    setIsPartnerLoading(true)

    try {
      const response = await fetch("/api/partner_debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInfo,
          results,
          conversationHistory: updatedHistory,
        }),
      })

      if (!response.ok) throw new Error("Error en conversación")
      const data = await response.json()

      setConversationHistory([
        ...updatedHistory,
        {
          sender: "partner",
          text: data.partnerMessage,
        },
      ])
    } catch (error) {
      console.error("Error en conversación:", error)
      setConversationHistory([
        ...updatedHistory,
        {
          sender: "partner",
          text: "Disculpa, hubo un problema técnico. ¿Podrías reformular tu pregunta?",
        },
      ])
    } finally {
      setIsPartnerLoading(false)
    }
  }

  // Función para descargar PDF
  const handleDownloadPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: html2canvas } = await import("html2canvas")

      const pdf = new jsPDF()
      const element = document.getElementById("summary-content")

      if (element) {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
        })
        const imgData = canvas.toDataURL("image/png")
        const imgProps = pdf.getImageProperties(imgData)
        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width

        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight)
        pdf.save(`skillbooster-report-${userInfo.name.replace(/\s+/g, "-")}.pdf`)
      }
    } catch (error) {
      console.error("Error generando PDF:", error)
      alert("Error al generar el PDF. Por favor, intenta de nuevo.")
    }
  }

  // Función para reiniciar la aplicación
  const restartAssessment = () => {
    setCurrentStep("intro")
    setUserInfo({
      name: "",
      role: "",
      experience: "",
      projectDescription: "",
      obstacles: "",
      learningObjective: "",
    })
    setSelectedSkills([])
    setCurrentSkillIndex(0)
    setCurrentQuestionIndex(0)
    setAnswers([])
    setResults({})
    setConversationHistory([])
    setCurrentUserInput("")
    setShowMentorSession(false)
    setCurrentMentorSkill(null)
    setError(null)
  }

  // Función para seleccionar habilidad específica
  const selectSkill = (skillId: string) => {
    const skillIndex = selectedSkills.indexOf(skillId)
    if (skillIndex >= 0) {
      setCurrentSkillIndex(skillIndex)
      setAnswers((prevAnswers) =>
        prevAnswers.filter((a) => !allSkills[currentSkillIndex].questions.some((q) => q.id === a.questionId)),
      )
      setCurrentQuestionIndex(0)
      setCurrentStep("skillObjective")
    }
  }

  // Mostrar error crítico si no se pueden cargar las habilidades
  if (error && allSkills.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-red-600">
          <h2 className="text-2xl font-bold text-red-300 mb-4">Error de Carga</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Recargar Aplicación
          </button>
        </div>
      </div>
    )
  }

  // Renderizado condicional según el paso actual
  const renderCurrentStep = () => {
    switch (currentStep) {
      case "intro":
        return <IntroductionStep nextStep={nextStep} />

      case "userInfo":
        return <UserInfoStep userInfo={userInfo} setUserInfo={setUserInfo} nextStep={nextStep} prevStep={prevStep} />

      case "skillSelection":
        return <SkillSelectionStep setSelectedSkills={setSelectedSkills} onContinue={nextStep} />

      case "skillObjective":
        const currentSkill = allSkills.find((s) => s.id === selectedSkills[currentSkillIndex])
        if (!currentSkill) return <div>Error: Habilidad no encontrada</div>

        return (
          <SkillObjectiveStep
            skillName={currentSkill.name}
            learningObjective={userInfo.learningObjective || ""}
            setLearningObjective={(objective) => setUserInfo((prev) => ({ ...prev, learningObjective: objective }))}
            onSubmitObjective={nextStep}
            indicadoresInfo={currentSkill.indicadoresInfo}
          />
        )

      case "assessment":
        return (
          <>
            <AssessmentStep
              skills={allSkills}
              selectedSkills={selectedSkills}
              currentSkillIndex={currentSkillIndex}
              currentQuestionIndex={currentQuestionIndex}
              setCurrentQuestionIndex={setCurrentQuestionIndex}
              answers={answers}
              handleAnswer={handleAnswer}
              submitAssessment={submitAssessment}
              isLoading={isLoading}
              error={error}
              userInfo={userInfo}
            />
            {isLoading && <LoadingSpinner message="Procesando tu evaluación..." size="lg" overlay={true} />}
          </>
        )

      case "results":
        const currentResult = results[selectedSkills[currentSkillIndex]]
        if (!currentResult) return <div>Cargando resultados...</div>

        const allSkillsWithStatus = selectedSkills.map((skillId) => {
          const skill = allSkills.find((s) => s.id === skillId)
          const result = results[skillId]
          return {
            id: skillId,
            name: skill?.name || skillId,
            globalScore: result?.globalScore,
            status: result ? ("evaluado" as const) : ("no_evaluado" as const),
          }
        })

        return (
          <ResultsStep
            result={currentResult}
            hasMoreSkills={currentSkillIndex < selectedSkills.length - 1}
            onNextSkill={nextStep}
            onStartMentorSession={() => startMentorSession(currentResult.skillId)}
            allSkills={allSkillsWithStatus}
            onSelectSkill={selectSkill}
          />
        )

      case "mentorSession":
        if (!currentMentorSkill || !results[currentMentorSkill]) {
          return <div>Error: No se puede iniciar la sesión de mentoría</div>
        }

        const mentorResult = results[currentMentorSkill]
        const openEndedAnswer = answers.find(
          (a) => a.questionId === allSkills.find((s) => s.id === currentMentorSkill)?.openQuestionId,
        )?.value as string

        return (
          <MentorSessionInterface
            skillId={mentorResult.skillId}
            skillName={mentorResult.skillName}
            globalScore={mentorResult.globalScore}
            indicatorScores={mentorResult.indicatorScores}
            openEndedAnswer={openEndedAnswer}
            userProfile={userInfo}
            onSessionComplete={completeMentorSession}
          />
        )

      case "summary":
        return (
          <SummaryStep
            userInfo={userInfo}
            results={results}
            conversationHistory={conversationHistory}
            currentUserInput={currentUserInput}
            setCurrentUserInput={setCurrentUserInput}
            sendMessage={sendMessageToPartner}
            isLoading={isPartnerLoading}
            initializeConversation={initializePartnerConversation}
            handleDownloadPDF={handleDownloadPDF}
            restartAssessment={restartAssessment}
          />
        )

      default:
        return <div>Paso no reconocido</div>
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">{renderCurrentStep()}</div>
    </div>
  )
}

// --- Componentes de Pasos ---

const IntroductionStep: React.FC<{ nextStep: () => void }> = ({ nextStep }) => {
  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="mb-8 animate-fadeInDown">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
          Skill<span className="text-blue-400">booster</span>X
        </h1>
        <p className="text-xl text-gray-300 mb-2">Evalúa. Mejora. Despega.</p>
        <p className="text-lg text-gray-400">
          Herramienta ágil para líderes y equipos que creen en la sostenibilidad con acción real.
        </p>
      </div>

      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8 mb-8 animate-fadeInUp">
        <h2 className="text-2xl font-semibold text-blue-300 mb-6">¿Qué vas a lograr hoy?</h2>
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Evaluación Personalizada</h3>
            <p className="text-gray-400">Descubre tus fortalezas y áreas de mejora con IA avanzada</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🎯</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Recomendaciones Prácticas</h3>
            <p className="text-gray-400">Recibe tips específicos para tu rol y contexto profesional</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🚀</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Plan de Acción</h3>
            <p className="text-gray-400">Obtén un roadmap claro para tu desarrollo profesional</p>
          </div>
        </div>
      </div>

      <button
        onClick={nextStep}
        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl animate-pulse"
      >
        Comenzar Evaluación
      </button>
    </div>
  )
}

const UserInfoStep: React.FC<{
  userInfo: UserInfo
  setUserInfo: (info: UserInfo) => void
  nextStep: () => void
  prevStep: () => void
}> = ({ userInfo, setUserInfo, nextStep, prevStep }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (userInfo.name && userInfo.role && userInfo.experience) {
      nextStep()
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-3xl font-bold text-center text-white mb-8">Cuéntanos sobre ti</h2>

      <form onSubmit={handleSubmit} className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">Nombre completo *</label>
          <input
            type="text"
            value={userInfo.name}
            onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            placeholder="Tu nombre completo"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">Rol o posición actual *</label>
          <input
            type="text"
            value={userInfo.role}
            onChange={(e) => setUserInfo({ ...userInfo, role: e.target.value })}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            placeholder="Ej: Gerente de Proyecto, Líder de Equipo, etc."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">Años de experiencia *</label>
          <select
            value={userInfo.experience}
            onChange={(e) => setUserInfo({ ...userInfo, experience: e.target.value })}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            required
          >
            <option value="">Selecciona tu experiencia</option>
            <option value="0-2 años">0-2 años</option>
            <option value="3-5 años">3-5 años</option>
            <option value="6-10 años">6-10 años</option>
            <option value="11-15 años">11-15 años</option>
            <option value="Más de 15 años">Más de 15 años</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Describe tu proyecto o contexto profesional actual
          </label>
          <textarea
            value={userInfo.projectDescription}
            onChange={(e) => setUserInfo({ ...userInfo, projectDescription: e.target.value })}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            placeholder="Ej: Lidero un equipo de 8 personas en el desarrollo de una nueva plataforma digital..."
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            ¿Cuáles son tus principales obstáculos o desafíos actuales?
          </label>
          <textarea
            value={userInfo.obstacles}
            onChange={(e) => setUserInfo({ ...userInfo, obstacles: e.target.value })}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            placeholder="Ej: Dificultad para delegar tareas, comunicación con stakeholders, gestión del tiempo..."
            rows={3}
          />
        </div>

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={prevStep}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
          >
            Anterior
          </button>
          <button
            type="submit"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Continuar
          </button>
        </div>
      </form>
    </div>
  )
}

const AssessmentStep: React.FC<{
  skills: Skill[]
  selectedSkills: string[]
  currentSkillIndex: number
  currentQuestionIndex: number
  setCurrentQuestionIndex: (index: number) => void
  answers: Answer[]
  handleAnswer: (questionId: string, value: string | number) => void
  submitAssessment: () => void
  isLoading: boolean
  error: string | null
  userInfo: UserInfo
}> = ({
  skills,
  selectedSkills,
  currentSkillIndex,
  currentQuestionIndex,
  setCurrentQuestionIndex,
  answers,
  handleAnswer,
  submitAssessment,
  isLoading,
  error,
  userInfo,
}) => {
  const currentSkill = skills.find((s) => s.id === selectedSkills[currentSkillIndex])
  if (!currentSkill) return <div>Error: Habilidad no encontrada</div>

  const currentQuestion = currentSkill.questions[currentQuestionIndex]
  if (!currentQuestion) return <div>Error: Pregunta no encontrada</div>

  const currentAnswer = answers.find((a) => a.questionId === currentQuestion.id)
  const progress = ((currentQuestionIndex + 1) / currentSkill.questions.length) * 100

  const nextQuestion = () => {
    if (currentQuestionIndex < currentSkill.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else {
      submitAssessment()
    }
  }

  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    }
  }

  // Procesar placeholders en preguntas abiertas
  let processedPrompt = currentQuestion.prompt
  if (currentQuestion.type === "open" && typeof processedPrompt === "string" && userInfo) {
    processedPrompt = processedPrompt.replace(/\${userInfo\.role}/g, userInfo.role || "tu rol")
    processedPrompt = processedPrompt.replace(
      /\${userInfo\.projectDescription}/g,
      userInfo.projectDescription || "tu proyecto",
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-white mb-4">Evaluación: {currentSkill.name}</h2>
        <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <p className="text-center text-gray-400">
          Pregunta {currentQuestionIndex + 1} de {currentSkill.questions.length}
        </p>
      </div>

      {error && (
        <div className="bg-red-600/20 border border-red-600 rounded-lg p-4 mb-6">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8">
        <h3 className="text-xl font-semibold text-white mb-6">{processedPrompt}</h3>

        {currentQuestion.type === "likert" ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name={currentQuestion.id}
                  value={value}
                  checked={currentAnswer?.value === value}
                  onChange={() => handleAnswer(currentQuestion.id, value)}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                />
                <span className="text-gray-200">
                  {value === 1 && "Nunca o casi nunca"}
                  {value === 2 && "Raramente"}
                  {value === 3 && "A veces"}
                  {value === 4 && "Frecuentemente"}
                  {value === 5 && "Siempre o casi siempre"}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <textarea
            value={(currentAnswer?.value as string) || ""}
            onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            placeholder="Escribe tu respuesta aquí..."
            rows={6}
          />
        )}

        <div className="flex justify-between mt-8">
          <button
            onClick={prevQuestion}
            disabled={currentQuestionIndex === 0}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-md transition-colors"
          >
            Anterior
          </button>
          <button
            onClick={nextQuestion}
            disabled={!currentAnswer || isLoading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-md transition-colors flex items-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Procesando...
              </>
            ) : currentQuestionIndex === currentSkill.questions.length - 1 ? (
              "Finalizar Evaluación"
            ) : (
              "Siguiente"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

const SummaryStep: React.FC<{
  userInfo: UserInfo
  results: Record<string, SkillResult>
  conversationHistory: ConversationMessage[]
  currentUserInput: string
  setCurrentUserInput: (input: string) => void
  sendMessage: () => void
  isLoading: boolean
  initializeConversation: () => void
  handleDownloadPDF: () => void
  restartAssessment: () => void
}> = ({
  userInfo,
  results,
  conversationHistory,
  currentUserInput,
  setCurrentUserInput,
  sendMessage,
  isLoading,
  initializeConversation,
  handleDownloadPDF,
  restartAssessment,
}) => {
  const conversationEndRef = useRef<HTMLDivElement>(null)

  // Inicializar conversación al montar el componente
  useEffect(() => {
    initializeConversation()
  }, [])

  // Scroll automático al final de la conversación
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversationHistory])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-center text-white mb-8">Conversación con tu Partner Digital</h2>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Chat Interface */}
        <div className="lg:col-span-2">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg overflow-hidden shadow-xl border border-gray-700">
            {/* Header del Chat */}
            <div className="bg-gray-700 p-4 border-b border-gray-600">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-semibold">PD</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-blue-300">Partner Digital</h3>
                  <p className="text-sm text-gray-400">Tu Estratega de Talento y Coach Ejecutivo</p>
                </div>
              </div>
            </div>

            {/* Área de Conversación */}
            <div className="h-96 overflow-y-auto p-4 space-y-4 bg-gray-900/30">
              {conversationHistory.length === 0 && !isLoading && (
                <div className="text-center text-gray-400 py-8">
                  <p>Iniciando conversación con tu Partner Digital...</p>
                </div>
              )}

              {conversationHistory.map((message, index) => (
                <div key={index} className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg p-3 ${
                      message.sender === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-100 border border-gray-600"
                    }`}
                  >
                    {message.sender === "partner" ? (
                      <ReactMarkdown
                        className="prose prose-invert prose-sm max-w-none"
                        components={{
                          h3: ({ node, ...props }) => (
                            <h3 className="text-blue-300 font-semibold text-lg mt-2 mb-1" {...props} />
                          ),
                          h4: ({ node, ...props }) => (
                            <h4 className="text-blue-200 font-medium text-base mt-2 mb-1" {...props} />
                          ),
                          p: ({ node, ...props }) => <p className="mb-2" {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                          strong: ({ node, ...props }) => <strong className="font-semibold text-blue-200" {...props} />,
                          em: ({ node, ...props }) => <em className="text-gray-300 italic" {...props} />,
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.text}</p>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 text-gray-100 rounded-lg p-3 border border-gray-600">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-300"></div>
                      <span className="text-sm text-gray-400">Partner Digital está escribiendo...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={conversationEndRef}></div>
            </div>

            {/* Área de Input */}
            <div className="p-4 border-t border-gray-600 bg-gray-800/50">
              <div className="flex space-x-2">
                <textarea
                  value={currentUserInput}
                  onChange={(e) => setCurrentUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe tu mensaje al Partner Digital..."
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400 resize-none"
                  rows={2}
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!currentUserInput.trim() || isLoading}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    !currentUserInput.trim() || isLoading
                      ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isLoading ? "..." : "Enviar"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">Presiona Enter para enviar, Shift+Enter para nueva línea</p>
            </div>
          </div>
        </div>

        {/* Panel de Resumen */}
        <div className="space-y-6">
          <div id="summary-content" className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-blue-300 mb-4">Resumen de Resultados</h3>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-white mb-2">Perfil</h4>
                <p className="text-sm text-gray-300">{userInfo.name}</p>
                <p className="text-sm text-gray-400">{userInfo.role}</p>
                <p className="text-xs text-gray-500">{userInfo.experience}</p>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Habilidades Evaluadas</h4>
                <div className="space-y-2">
                  {Object.values(results).map((result) => (
                    <div key={result.skillId} className="flex justify-between items-center">
                      <span className="text-sm text-gray-300 truncate mr-2">{result.skillName}</span>
                      <span
                        className={`text-sm font-medium px-2 py-1 rounded ${
                          result.globalScore >= 70
                            ? "text-green-300 bg-green-900/30"
                            : result.globalScore >= 40
                              ? "text-yellow-300 bg-yellow-900/30"
                              : "text-red-300 bg-red-900/30"
                        }`}
                      >
                        {result.globalScore}/100
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {Object.values(results).some((r) => r.mentorSessionData) && (
                <div>
                  <h4 className="font-medium text-white mb-2">Sesiones de Mentoría</h4>
                  <div className="space-y-1">
                    {Object.values(results)
                      .filter((r) => r.mentorSessionData)
                      .map((result) => (
                        <div key={result.skillId} className="text-xs text-blue-300">
                          ✓ {result.skillName}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="space-y-3">
            <button
              onClick={handleDownloadPDF}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center justify-center shadow-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Descargar Reporte PDF
            </button>

            <button
              onClick={restartAssessment}
              className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors flex items-center justify-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reiniciar Evaluación
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SkillBoosterMVP
