"use client"

import type React from "react"

import { useReducer, useEffect } from "react"
import dynamic from "next/dynamic"
import MentorSessionInterface, { type MentorSessionData } from "./mentor-session-interface"
import { useToast } from "@/hooks/use-toast"

// Importación dinámica de jsPDF y html2canvas para evitar problemas de SSR
const jsPDF = dynamic(() => import("jspdf"), { ssr: false })
const html2canvas = dynamic(() => import("html2canvas"), { ssr: false })

// Componentes para cada etapa
import LandingStep from "./LandingStep"
import UserInfoStep from "./UserInfoStep"
import SkillSelectionStep from "./SkillSelectionStep"
import SkillObjectiveStep from "./SkillObjectiveStep"
import AssessmentStep from "./AssessmentStep"
import ResultsStepComponent from "./ResultsStep"
import SummaryStep from "./SummaryStep"

// Tipos
type UserInfo = {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
}

type Skill = {
  id: string
  name: string
  questions: Question[]
  indicadoresInfo: Array<{ id: string; nombre: string; descripcion_indicador?: string }>
  openQuestionId: string
}

type Question = {
  id: string
  axis: string
  type: "likert" | "open"
  indicator: string
  prompt: string
}

type Answer = {
  questionId: string
  value: string | number
}

type IndicatorScore = {
  id: string
  name: string
  score: number
  descripcion_indicador?: string
  feedback_especifico?: string
}

type SkillResult = {
  skillId: string
  skillName: string
  globalScore: number
  indicatorScores: IndicatorScore[]
  tips: string[]
  mentorSessionData?: MentorSessionData
}

// Estado de la aplicación
interface AppState {
  currentStep: number
  userInfo: UserInfo
  acceptedTerms: boolean
  skills: Skill[]
  selectedSkills: string[]
  currentSkillIndex: number
  currentQuestionIndex: number
  answers: Record<string, Answer[]>
  currentAnswer: string | number
  results: Record<string, SkillResult>
  loading: boolean
  pdfGenerating: boolean
  showMentorSession: boolean
  currentSkillLearningObjective: string
  skillObjectiveSubmitted: boolean
}

// Acciones del reducer
type AppAction =
  | { type: "SET_CURRENT_STEP"; payload: number }
  | { type: "SET_USER_INFO"; payload: UserInfo }
  | { type: "SET_ACCEPTED_TERMS"; payload: boolean }
  | { type: "SET_SKILLS"; payload: Skill[] }
  | { type: "SET_SELECTED_SKILLS"; payload: string[] }
  | { type: "SET_CURRENT_SKILL_INDEX"; payload: number }
  | { type: "SET_CURRENT_QUESTION_INDEX"; payload: number }
  | { type: "SET_ANSWERS"; payload: Record<string, Answer[]> }
  | { type: "ADD_ANSWER"; payload: { skillId: string; answer: Answer } }
  | { type: "SET_CURRENT_ANSWER"; payload: string | number }
  | { type: "SET_RESULTS"; payload: Record<string, SkillResult> }
  | { type: "ADD_RESULT"; payload: { skillId: string; result: SkillResult } }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_PDF_GENERATING"; payload: boolean }
  | { type: "SET_SHOW_MENTOR_SESSION"; payload: boolean }
  | { type: "SET_CURRENT_SKILL_LEARNING_OBJECTIVE"; payload: string }
  | { type: "SET_SKILL_OBJECTIVE_SUBMITTED"; payload: boolean }
  | { type: "RESET_STATE" }
  | { type: "NEXT_SKILL" }
  | { type: "NEXT_QUESTION" }

// Estado inicial
const initialState: AppState = {
  currentStep: 0,
  userInfo: {
    name: "",
    role: "",
    experience: "",
    projectDescription: "",
    obstacles: "",
  },
  acceptedTerms: false,
  skills: [],
  selectedSkills: [],
  currentSkillIndex: 0,
  currentQuestionIndex: 0,
  answers: {},
  currentAnswer: "",
  results: {},
  loading: false,
  pdfGenerating: false,
  showMentorSession: false,
  currentSkillLearningObjective: "",
  skillObjectiveSubmitted: false,
}

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_CURRENT_STEP":
      return { ...state, currentStep: action.payload }

    case "SET_USER_INFO":
      return { ...state, userInfo: action.payload }

    case "SET_ACCEPTED_TERMS":
      return { ...state, acceptedTerms: action.payload }

    case "SET_SKILLS":
      return { ...state, skills: action.payload }

    case "SET_SELECTED_SKILLS":
      return { ...state, selectedSkills: action.payload }

    case "SET_CURRENT_SKILL_INDEX":
      return { ...state, currentSkillIndex: action.payload }

    case "SET_CURRENT_QUESTION_INDEX":
      return { ...state, currentQuestionIndex: action.payload }

    case "SET_ANSWERS":
      return { ...state, answers: action.payload }

    case "ADD_ANSWER":
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.payload.skillId]: [...(state.answers[action.payload.skillId] || []), action.payload.answer],
        },
      }

    case "SET_CURRENT_ANSWER":
      return { ...state, currentAnswer: action.payload }

    case "SET_RESULTS":
      return { ...state, results: action.payload }

    case "ADD_RESULT":
      return {
        ...state,
        results: {
          ...state.results,
          [action.payload.skillId]: action.payload.result,
        },
      }

    case "SET_LOADING":
      return { ...state, loading: action.payload }

    case "SET_PDF_GENERATING":
      return { ...state, pdfGenerating: action.payload }

    case "SET_SHOW_MENTOR_SESSION":
      return { ...state, showMentorSession: action.payload }

    case "SET_CURRENT_SKILL_LEARNING_OBJECTIVE":
      return { ...state, currentSkillLearningObjective: action.payload }

    case "SET_SKILL_OBJECTIVE_SUBMITTED":
      return { ...state, skillObjectiveSubmitted: action.payload }

    case "RESET_STATE":
      return {
        ...initialState,
        skills: state.skills, // Mantener las habilidades cargadas
      }

    case "NEXT_SKILL":
      return {
        ...state,
        currentSkillIndex: state.currentSkillIndex + 1,
        currentQuestionIndex: 0,
        currentSkillLearningObjective: "",
        skillObjectiveSubmitted: false,
        currentStep: 3,
        showMentorSession: false,
      }

    case "NEXT_QUESTION":
      return {
        ...state,
        currentQuestionIndex: state.currentQuestionIndex + 1,
        currentAnswer: "",
      }

    default:
      return state
  }
}

// Componente principal
export default function SkillboosterMVP() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const { toast } = useToast()

  // Función para mostrar notificaciones de error mejoradas
  const showErrorToast = (title: string, description: string, variant: "destructive" | "warning" = "destructive") => {
    toast({
      title,
      description,
      variant,
    })
  }

  const showSuccessToast = (title: string, description: string) => {
    toast({
      title,
      description,
      variant: "success",
    })
  }

  // Función para renderizar el indicador de progreso general
  const renderOverallProgress = (): string => {
    const totalSelectedSkills = state.selectedSkills.length

    switch (state.currentStep) {
      case 0:
        return ""
      case 1:
        return "Paso 1 de 4: Perfil de Usuario"
      case 2:
        return "Paso 2 de 4: Selección de Habilidades"
      case 3:
        if (totalSelectedSkills > 0) {
          const currentSkill = state.skills.find((s) => s.id === state.selectedSkills[state.currentSkillIndex])
          const skillName = currentSkill?.name || "Habilidad"

          if (!state.skillObjectiveSubmitted) {
            return `Paso 3 de 4: Definiendo Objetivo - ${skillName} (${state.currentSkillIndex + 1}/${totalSelectedSkills})`
          } else {
            return `Paso 3 de 4: Evaluación - ${skillName} (${state.currentSkillIndex + 1}/${totalSelectedSkills}) - Pregunta ${state.currentQuestionIndex + 1}/${state.skills.find((s) => s.id === state.selectedSkills[state.currentSkillIndex])?.questions.length || 0}`
          }
        }
        return "Paso 3 de 4: Evaluación de Habilidad"
      case 4:
        if (totalSelectedSkills > 0) {
          const currentSkill = state.skills.find((s) => s.id === state.selectedSkills[state.currentSkillIndex])
          const skillName = currentSkill?.name || "Habilidad"

          if (state.showMentorSession) {
            return `Paso 3 de 4: Sesión de Mentoría - ${skillName} (${state.currentSkillIndex + 1}/${totalSelectedSkills})`
          } else {
            return `Paso 3 de 4: Resultados - ${skillName} (${state.currentSkillIndex + 1}/${totalSelectedSkills})`
          }
        }
        return "Paso 3 de 4: Resultados"
      case 5:
        return "Paso 4 de 4: Resumen Final"
      default:
        return ""
    }
  }

  // Cargar datos de preguntas con mejor manejo de errores
  useEffect(() => {
    const loadSkillsData = async () => {
      try {
        const response = await fetch("/api/questions")

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Error de API al cargar habilidades: ${response.status} ${response.statusText}`, errorText)
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }

        const skillsData: Skill[] = await response.json()
        dispatch({ type: "SET_SKILLS", payload: skillsData })
        showSuccessToast("Datos cargados", "Las habilidades se han cargado correctamente")
      } catch (error) {
        console.error("Error al cargar las habilidades:", error)
        showErrorToast(
          "Error al cargar datos",
          "No se pudieron cargar las habilidades. Por favor, recarga la página o contacta al soporte técnico.",
        )
        dispatch({ type: "SET_SKILLS", payload: [] })
      }
    }

    loadSkillsData()
  }, [])

  // Manejadores de eventos
  const handleStartAssessment = () => {
    dispatch({ type: "SET_CURRENT_STEP", payload: 1 })
  }

  const handleUserInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (state.userInfo.name && state.userInfo.role && state.userInfo.projectDescription && state.userInfo.obstacles) {
      dispatch({ type: "SET_CURRENT_STEP", payload: 2 })
      showSuccessToast("Perfil completado", "Tu información ha sido guardada correctamente")
    } else {
      showErrorToast("Información incompleta", "Por favor, completa todos los campos requeridos")
    }
  }

  const handleSkillSelection = () => {
    if (state.selectedSkills.length > 0) {
      dispatch({ type: "SET_CURRENT_SKILL_INDEX", payload: 0 })
      dispatch({ type: "SET_CURRENT_QUESTION_INDEX", payload: 0 })
      dispatch({ type: "SET_CURRENT_SKILL_LEARNING_OBJECTIVE", payload: "" })
      dispatch({ type: "SET_SKILL_OBJECTIVE_SUBMITTED", payload: false })

      const initialAnswers: Record<string, Answer[]> = {}
      state.selectedSkills.forEach((skillId) => {
        initialAnswers[skillId] = []
      })
      dispatch({ type: "SET_ANSWERS", payload: initialAnswers })
      dispatch({ type: "SET_CURRENT_STEP", payload: 3 })

      showSuccessToast(
        "Habilidades seleccionadas",
        `Comenzarás la evaluación de ${state.selectedSkills.length} habilidad${state.selectedSkills.length > 1 ? "es" : ""}`,
      )
    } else {
      showErrorToast("Selección requerida", "Debes seleccionar al menos una habilidad para continuar")
    }
  }

  const handleSubmitSkillObjective = () => {
    dispatch({ type: "SET_SKILL_OBJECTIVE_SUBMITTED", payload: true })
    showSuccessToast("Objetivo definido", "Ahora comenzaremos con las preguntas de evaluación")
  }

  const handleAnswerQuestion = async () => {
    const currentSkillId = state.selectedSkills[state.currentSkillIndex]
    const currentSkill = state.skills.find((s) => s.id === currentSkillId)

    if (!currentSkill) {
      showErrorToast("Error del sistema", "No se pudo encontrar la habilidad actual")
      return
    }

    const currentQuestion = currentSkill.questions[state.currentQuestionIndex]

    // Guardamos la respuesta actual
    dispatch({
      type: "ADD_ANSWER",
      payload: {
        skillId: currentSkillId,
        answer: {
          questionId: currentQuestion.id,
          value: state.currentAnswer,
        },
      },
    })

    dispatch({ type: "SET_CURRENT_ANSWER", payload: "" })

    // Verificamos si hay más preguntas para esta habilidad
    if (state.currentQuestionIndex < currentSkill.questions.length - 1) {
      dispatch({ type: "NEXT_QUESTION" })
    } else {
      // Última pregunta - Llamamos a las APIs para obtener puntuación y tips
      dispatch({ type: "SET_LOADING", payload: true })

      try {
        // Obtener las respuestas actualizadas
        const updatedAnswers = {
          ...state.answers,
          [currentSkillId]: [
            ...(state.answers[currentSkillId] || []),
            {
              questionId: currentQuestion.id,
              value: state.currentAnswer,
            },
          ],
        }

        // Encontrar la respuesta a la pregunta abierta
        const openEndedAnswer = updatedAnswers[currentSkillId].find(
          (answer) => currentSkill.questions.find((q) => q.id === answer.questionId)?.type === "open",
        )?.value as string | undefined

        // 1. Llamada a la API de puntuación
        const scoreResponse = await fetch("/api/score", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            skillId: currentSkillId,
            answers: updatedAnswers[currentSkillId],
          }),
        })

        if (!scoreResponse.ok) {
          const errorData = await scoreResponse.json().catch(() => ({}))
          throw new Error(
            errorData.details || errorData.error || `Error ${scoreResponse.status}: ${scoreResponse.statusText}`,
          )
        }

        const scoreData = await scoreResponse.json()
        console.log("Respuesta de API score:", scoreData)

        const indicatorScores = scoreData.indicatorScores || []
        const globalScore = scoreData.globalScore || 0

        if (!indicatorScores.length) {
          throw new Error("No se recibieron datos de evaluación válidos")
        }

        // 2. Llamada a la API de lecciones para generar tips personalizados
        const lessonResponse = await fetch("/api/lesson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            skillId: currentSkillId,
            userInfo: {
              ...state.userInfo,
              learningObjective: state.currentSkillLearningObjective,
            },
            indicatorScores,
            globalScore,
            openEndedAnswer,
          }),
        })

        let tips: string[]
        if (lessonResponse.ok) {
          const lessonData = await lessonResponse.json()
          tips = lessonData.tips || []
          if (lessonData.error) {
            showErrorToast(
              "Consejos limitados",
              "Se generaron consejos básicos debido a un problema técnico temporal",
              "warning",
            )
          }
        } else {
          console.warn("Error al obtener tips personalizados, usando tips por defecto")
          showErrorToast(
            "Consejos no disponibles",
            "No se pudieron generar consejos personalizados. Se mostrarán consejos generales.",
            "warning",
          )

          const sortedIndicators = [...indicatorScores].sort((a, b) => b.score - a.score)
          const strongest = sortedIndicators[0] || { name: "habilidad principal", score: 0 }
          const weakest = sortedIndicators[sortedIndicators.length - 1] || { name: "área de mejora", score: 0 }

          tips = [
            `Fortaleza: Tu ${strongest.name} es destacable, mantén desarrollando esta capacidad.`,
            `Oportunidad: Enfócate en mejorar tu ${weakest.name} para un desarrollo más equilibrado.`,
            `Consejo: Practica regularmente las habilidades de ${currentSkill.name} en tu contexto de ${state.userInfo?.role || "trabajo"}.`,
          ]
        }

        // 3. Construimos el resultado completo
        const result: SkillResult = {
          skillId: currentSkillId,
          skillName: currentSkill.name,
          globalScore,
          indicatorScores,
          tips,
        }

        // 4. Actualizamos el estado
        dispatch({ type: "ADD_RESULT", payload: { skillId: currentSkillId, result } })

        // 5. Pasamos a la pantalla de resultados
        dispatch({ type: "SET_CURRENT_STEP", payload: 4 })
        dispatch({ type: "SET_SHOW_MENTOR_SESSION", payload: false })
        showSuccessToast("Evaluación completada", `Tu puntuación global es ${globalScore}/100`)
      } catch (error: any) {
        console.error("Error DETALLADO al procesar la evaluación:", error)

        showErrorToast(
          "Error en la evaluación",
          error.message || "Ocurrió un problema al procesar tu evaluación. Se mostrarán resultados aproximados.",
        )

        // Fallback mejorado
        const currentSkillId = state.selectedSkills[state.currentSkillIndex]
        const currentSkill = state.skills.find((s) => s.id === currentSkillId)

        if (!currentSkill) {
          console.error("No se pudo encontrar currentSkill en el bloque catch")
          return
        }

        const updatedAnswers = {
          ...state.answers,
          [currentSkillId]: [
            ...(state.answers[currentSkillId] || []),
            {
              questionId: currentQuestion.id,
              value: state.currentAnswer,
            },
          ],
        }

        const fallbackResult: SkillResult = {
          skillId: currentSkillId,
          skillName: currentSkill.name,
          globalScore: 75,
          indicatorScores: updatedAnswers[currentSkillId].map((answer) => {
            const question = currentSkill.questions.find((q) => q.id === answer.questionId)
            const indicadorInfo = currentSkill.indicadoresInfo.find((info) => info.id === answer.questionId)

            return {
              id: answer.questionId,
              name:
                indicadorInfo?.nombre || question?.prompt?.substring(0, 30) + "..." || `Indicador ${answer.questionId}`,
              score: typeof answer.value === "number" ? answer.value * 20 : 60,
              descripcion_indicador: indicadorInfo?.descripcion_indicador,
              feedback_especifico: "Evaluación aproximada debido a un problema técnico temporal.",
            }
          }),
          tips: [
            "Fortaleza: Tienes buena capacidad de análisis general.",
            "Oportunidad: Podrías mejorar en la identificación de patrones específicos.",
            "Consejo: Practica regularmente con ejercicios de análisis de datos reales.",
          ],
        }

        dispatch({ type: "ADD_RESULT", payload: { skillId: currentSkillId, result: fallbackResult } })
        dispatch({ type: "SET_CURRENT_STEP", payload: 4 })
        dispatch({ type: "SET_SHOW_MENTOR_SESSION", payload: false })
      } finally {
        dispatch({ type: "SET_LOADING", payload: false })
      }
    }
  }

  const handleNextSkill = () => {
    if (state.currentSkillIndex < state.selectedSkills.length - 1) {
      dispatch({ type: "NEXT_SKILL" })
    } else {
      dispatch({ type: "SET_CURRENT_STEP", payload: 5 })
      showSuccessToast("¡Evaluación completa!", "Has completado todas las habilidades seleccionadas")
    }
  }

  const handleRestart = () => {
    dispatch({ type: "RESET_STATE" })
    showSuccessToast("Reinicio completo", "Puedes comenzar una nueva evaluación")
  }

  const handleStartMentorSession = () => {
    dispatch({ type: "SET_SHOW_MENTOR_SESSION", payload: true })
    showSuccessToast("Sesión iniciada", "Comenzando tu sesión personalizada con el mentor")
  }

  const handleMentorSessionComplete = (sessionData: MentorSessionData) => {
    const currentSkillId = state.selectedSkills[state.currentSkillIndex]
    const currentResult = state.results[currentSkillId]

    if (currentResult) {
      const updatedResult = {
        ...currentResult,
        mentorSessionData: sessionData,
      }
      dispatch({ type: "ADD_RESULT", payload: { skillId: currentSkillId, result: updatedResult } })
    }

    showSuccessToast("Sesión completada", "Tu sesión de mentoría ha sido guardada exitosamente")
    handleNextSkill()
  }

  const handleDownloadPDF = async () => {
    const summaryElement = document.getElementById("summary-content-to-pdf")
    if (!summaryElement) {
      showErrorToast("Error de descarga", "No se pudo encontrar el contenido para generar el PDF")
      return
    }

    dispatch({ type: "SET_PDF_GENERATING", payload: true })
    try {
      const jsPDFModule = await import("jspdf")
      const html2canvasModule = await import("html2canvas")

      const JsPDF = jsPDFModule.default
      const html2canvas = html2canvasModule.default

      const canvas = await html2canvas(summaryElement, {
        scale: 2,
        useCORS: true,
        logging: false,
      })

      const imgData = canvas.toDataURL("image/png")
      const pdf = new JsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight)
      const imgX = (pdfWidth - imgWidth * ratio) / 2
      const imgY = 10

      pdf.addImage(imgData, "PNG", imgX, imgY, imgWidth * ratio, imgHeight * ratio)
      pdf.save("reporte-skillboosterx.pdf")
      showSuccessToast("PDF generado", "Tu reporte ha sido descargado exitosamente")
    } catch (error) {
      console.error("Error al generar PDF:", error)
      showErrorToast("Error de descarga", "No se pudo generar el PDF. Intenta nuevamente o contacta al soporte.")
    } finally {
      dispatch({ type: "SET_PDF_GENERATING", payload: false })
    }
  }

  // Modificar la función renderStep para añadir transiciones entre pasos
  const renderStep = () => {
    const content = (() => {
      switch (state.currentStep) {
        case 0:
          return <LandingStep onStart={handleStartAssessment} />
        case 1:
          return (
            <UserInfoStep
              userInfo={state.userInfo}
              setUserInfo={(userInfo) => dispatch({ type: "SET_USER_INFO", payload: userInfo })}
              onSubmit={handleUserInfoSubmit}
            />
          )
        case 2:
          return (
            <SkillSelectionStep
              skills={state.skills}
              selectedSkills={state.selectedSkills}
              setSelectedSkills={(skills) => dispatch({ type: "SET_SELECTED_SKILLS", payload: skills })}
              onContinue={handleSkillSelection}
            />
          )
        case 3:
          const currentSkillId = state.selectedSkills[state.currentSkillIndex]
          const currentSkill = state.skills.find((s) => s.id === currentSkillId)

          if (!currentSkill) return <div>Cargando habilidad...</div>

          if (!state.skillObjectiveSubmitted) {
            return (
              <SkillObjectiveStep
                skillName={currentSkill.name}
                learningObjective={state.currentSkillLearningObjective}
                setLearningObjective={(objective) =>
                  dispatch({ type: "SET_CURRENT_SKILL_LEARNING_OBJECTIVE", payload: objective })
                }
                onSubmitObjective={handleSubmitSkillObjective}
                indicadoresInfo={currentSkill.indicadoresInfo}
              />
            )
          } else {
            return (
              <AssessmentStep
                skill={currentSkill}
                questionIndex={state.currentQuestionIndex}
                currentAnswer={state.currentAnswer}
                setCurrentAnswer={(answer) => dispatch({ type: "SET_CURRENT_ANSWER", payload: answer })}
                onNext={handleAnswerQuestion}
              />
            )
          }
        case 4:
          const resultSkillId = state.selectedSkills[state.currentSkillIndex]
          const result = state.results[resultSkillId]

          if (!result) return <div>Cargando resultados...</div>

          const currentSkill2 = state.skills.find((s) => s.id === resultSkillId)
          const openEndedQuestionId = currentSkill2?.questions.find((q) => q.type === "open")?.id
          const openEndedAnswer = state.answers[resultSkillId]?.find(
            (answer) => answer.questionId === openEndedQuestionId,
          )?.value as string | undefined

          const userProfileForMentor = {
            ...state.userInfo,
            learningObjective: state.currentSkillLearningObjective,
          }

          const allSkillsForNavigation = state.selectedSkills.map((skillId) => {
            const skillResult = state.results[skillId]
            return {
              id: skillId,
              name: state.skills.find((s) => s.id === skillId)?.name || skillId,
              globalScore: skillResult?.globalScore,
              status: skillResult ? "evaluado" : "no_evaluado",
            }
          })

          const handleSelectSkill = (skillId: string) => {
            const newIndex = state.selectedSkills.findIndex((id) => id === skillId)
            if (newIndex >= 0) {
              dispatch({ type: "SET_CURRENT_SKILL_INDEX", payload: newIndex })
            }
          }

          return state.showMentorSession ? (
            <MentorSessionInterface
              skillId={resultSkillId}
              skillName={result.skillName}
              globalScore={result.globalScore}
              indicatorScores={result.indicatorScores}
              openEndedAnswer={openEndedAnswer}
              userProfile={userProfileForMentor}
              onSessionComplete={handleMentorSessionComplete}
            />
          ) : (
            <ResultsStepComponent
              result={result}
              hasMoreSkills={state.currentSkillIndex < state.selectedSkills.length - 1}
              onNextSkill={handleNextSkill}
              onStartMentorSession={handleStartMentorSession}
              allSkills={state.selectedSkills.length > 1 ? allSkillsForNavigation : undefined}
              onSelectSkill={state.selectedSkills.length > 1 ? handleSelectSkill : undefined}
            />
          )
        case 5:
          return (
            <SummaryStep
              results={state.results}
              onRestart={handleRestart}
              onDownloadPDF={handleDownloadPDF}
              pdfGenerating={state.pdfGenerating}
              setCurrentStep={(step) => dispatch({ type: "SET_CURRENT_STEP", payload: step })}
            />
          )
        default:
          return <div>Error: Paso desconocido</div>
      }
    })()

    // Envolver el contenido en un div con animación
    return <div className="animate-fadeIn">{content}</div>
  }

  // Modificar el return principal para añadir transiciones al indicador de progreso
  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Indicador de progreso general con animación */}
        {state.currentStep > 0 && (
          <div className="mb-6 text-center font-medium text-blue-400 tracking-wider bg-gray-800/50 py-2 px-4 rounded-lg shadow-inner animate-fadeInDown">
            {renderOverallProgress()}
          </div>
        )}

        {state.loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fadeIn">
            <div className="w-12 h-12 border-t-2 border-b-2 border-blue-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-xl animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
              Procesando tu evaluación...
            </p>
            <p className="mt-2 text-sm text-gray-400 animate-fadeInUp" style={{ animationDelay: "0.5s" }}>
              Esto puede tomar unos momentos
            </p>
          </div>
        ) : (
          renderStep()
        )}
      </div>
    </div>
  )
}
