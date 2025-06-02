"use client"

import type React from "react"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import MentorSessionInterface, { type MentorSessionData } from "./mentor-session-interface"
import ReactMarkdown from "react-markdown"
import { useToast } from "@/hooks/use-toast"

// Importación dinámica de jsPDF y html2canvas para evitar problemas de SSR
const jsPDF = dynamic(() => import("jspdf"), { ssr: false })
const html2canvas = dynamic(() => import("html2canvas"), { ssr: false })

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Progress } from "@/components/ui/progress"
import { Info, MessageSquare, Lightbulb, Target, ClipboardList, TrendingUp, Star } from "lucide-react"
import { Check } from "lucide-react"

// Importar tipos
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

// Componente principal
export default function SkillboosterMVP() {
  const { toast } = useToast()

  // Estado para controlar el flujo
  const [currentStep, setCurrentStep] = useState<number>(0)
  const [userInfo, setUserInfo] = useState<UserInfo>({
    name: "",
    role: "",
    experience: "",
    projectDescription: "",
    obstacles: "",
  })
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(false)
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [currentSkillIndex, setCurrentSkillIndex] = useState<number>(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0)
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({})
  const [currentAnswer, setCurrentAnswer] = useState<string | number>("")
  const [results, setResults] = useState<Record<string, SkillResult>>({})
  const [loading, setLoading] = useState<boolean>(false)
  const [pdfGenerating, setPdfGenerating] = useState<boolean>(false)
  const [showMentorSession, setShowMentorSession] = useState<boolean>(false)

  // Nuevos estados para manejar el objetivo de aprendizaje específico de cada habilidad
  const [currentSkillLearningObjective, setCurrentSkillLearningObjective] = useState<string>("")
  const [skillObjectiveSubmitted, setSkillObjectiveSubmitted] = useState<boolean>(false)

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
    const totalSelectedSkills = selectedSkills.length

    switch (currentStep) {
      case 0:
        return ""
      case 1:
        return "Paso 1 de 4: Perfil de Usuario"
      case 2:
        return "Paso 2 de 4: Selección de Habilidades"
      case 3:
        if (totalSelectedSkills > 0) {
          const currentSkill = skills.find((s) => s.id === selectedSkills[currentSkillIndex])
          const skillName = currentSkill?.name || "Habilidad"

          if (!skillObjectiveSubmitted) {
            return `Paso 3 de 4: Definiendo Objetivo - ${skillName} (${currentSkillIndex + 1}/${totalSelectedSkills})`
          } else {
            return `Paso 3 de 4: Evaluación - ${skillName} (${currentSkillIndex + 1}/${totalSelectedSkills}) - Pregunta ${currentQuestionIndex + 1}/${skills.find((s) => s.id === selectedSkills[currentSkillIndex])?.questions.length || 0}`
          }
        }
        return "Paso 3 de 4: Evaluación de Habilidad"
      case 4:
        if (totalSelectedSkills > 0) {
          const currentSkill = skills.find((s) => s.id === selectedSkills[currentSkillIndex])
          const skillName = currentSkill?.name || "Habilidad"

          if (showMentorSession) {
            return `Paso 3 de 4: Sesión de Mentoría - ${skillName} (${currentSkillIndex + 1}/${totalSelectedSkills})`
          } else {
            return `Paso 3 de 4: Resultados - ${skillName} (${currentSkillIndex + 1}/${totalSelectedSkills})`
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
        setSkills(skillsData)
        showSuccessToast("Datos cargados", "Las habilidades se han cargado correctamente")
      } catch (error) {
        console.error("Error al cargar las habilidades:", error)
        showErrorToast(
          "Error al cargar datos",
          "No se pudieron cargar las habilidades. Por favor, recarga la página o contacta al soporte técnico.",
        )
        setSkills([])
      }
    }

    loadSkillsData()
  }, [])

  // Manejadores de eventos
  const handleStartAssessment = () => {
    setCurrentStep(1)
  }

  const handleUserInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (userInfo.name && userInfo.role && userInfo.projectDescription && userInfo.obstacles) {
      setCurrentStep(2)
      showSuccessToast("Perfil completado", "Tu información ha sido guardada correctamente")
    } else {
      showErrorToast("Información incompleta", "Por favor, completa todos los campos requeridos")
    }
  }

  const handleSkillSelection = () => {
    if (selectedSkills.length > 0) {
      setCurrentSkillIndex(0)
      setCurrentQuestionIndex(0)
      setCurrentSkillLearningObjective("")
      setSkillObjectiveSubmitted(false)

      const initialAnswers: Record<string, Answer[]> = {}
      selectedSkills.forEach((skillId) => {
        initialAnswers[skillId] = []
      })
      setAnswers(initialAnswers)

      setCurrentStep(3)
      showSuccessToast(
        "Habilidades seleccionadas",
        `Comenzarás la evaluación de ${selectedSkills.length} habilidad${selectedSkills.length > 1 ? "es" : ""}`,
      )
    } else {
      showErrorToast("Selección requerida", "Debes seleccionar al menos una habilidad para continuar")
    }
  }

  const handleSubmitSkillObjective = () => {
    setSkillObjectiveSubmitted(true)
    showSuccessToast("Objetivo definido", "Ahora comenzaremos con las preguntas de evaluación")
  }

  const handleAnswerQuestion = async () => {
    const currentSkillId = selectedSkills[currentSkillIndex]
    const currentSkill = skills.find((s) => s.id === currentSkillId)

    if (!currentSkill) {
      showErrorToast("Error del sistema", "No se pudo encontrar la habilidad actual")
      return
    }

    const currentQuestion = currentSkill.questions[currentQuestionIndex]

    // Guardamos la respuesta actual
    const newAnswers = { ...answers }
    newAnswers[currentSkillId] = [
      ...newAnswers[currentSkillId],
      {
        questionId: currentQuestion.id,
        value: currentAnswer,
      },
    ]
    setAnswers(newAnswers)
    setCurrentAnswer("")

    // Verificamos si hay más preguntas para esta habilidad
    if (currentQuestionIndex < currentSkill.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else {
      // Última pregunta - Llamamos a las APIs para obtener puntuación y tips
      setLoading(true)

      try {
        // Encontrar la respuesta a la pregunta abierta
        const openEndedAnswer = newAnswers[currentSkillId].find(
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
            answers: newAnswers[currentSkillId],
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
              ...userInfo,
              learningObjective: currentSkillLearningObjective,
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
            `Consejo: Practica regularmente las habilidades de ${currentSkill.name} en tu contexto de ${userInfo?.role || "trabajo"}.`,
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
        const newResults = { ...results }
        newResults[currentSkillId] = result
        setResults(newResults)

        // 5. Pasamos a la pantalla de resultados
        setCurrentStep(4)
        setShowMentorSession(false)
        showSuccessToast("Evaluación completada", `Tu puntuación global es ${globalScore}/100`)
      } catch (error: any) {
        console.error("Error DETALLADO al procesar la evaluación:", error)

        showErrorToast(
          "Error en la evaluación",
          error.message || "Ocurrió un problema al procesar tu evaluación. Se mostrarán resultados aproximados.",
        )

        // Fallback mejorado
        const currentSkillId = selectedSkills[currentSkillIndex]
        const currentSkill = skills.find((s) => s.id === currentSkillId)

        if (!currentSkill) {
          console.error("No se pudo encontrar currentSkill en el bloque catch")
          return
        }

        const fallbackResult: SkillResult = {
          skillId: currentSkillId,
          skillName: currentSkill.name,
          globalScore: 75,
          indicatorScores: newAnswers[currentSkillId].map((answer) => {
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

        const newResults = { ...results }
        newResults[currentSkillId] = fallbackResult
        setResults(newResults)
        setCurrentStep(4)
        setShowMentorSession(false)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleNextSkill = () => {
    if (currentSkillIndex < selectedSkills.length - 1) {
      setCurrentSkillIndex(currentSkillIndex + 1)
      setCurrentQuestionIndex(0)
      setCurrentSkillLearningObjective("")
      setSkillObjectiveSubmitted(false)
      setCurrentStep(3)
      setShowMentorSession(false)
    } else {
      setCurrentStep(5)
      showSuccessToast("¡Evaluación completa!", "Has completado todas las habilidades seleccionadas")
    }
  }

  const handleRestart = () => {
    setCurrentStep(0)
    setUserInfo({
      name: "",
      role: "",
      experience: "",
      projectDescription: "",
      obstacles: "",
    })
    setAcceptedTerms(false)
    setSelectedSkills([])
    setCurrentSkillIndex(0)
    setCurrentQuestionIndex(0)
    setCurrentSkillLearningObjective("")
    setSkillObjectiveSubmitted(false)
    setAnswers({})
    setResults({})
    setShowMentorSession(false)
    showSuccessToast("Reinicio completo", "Puedes comenzar una nueva evaluación")
  }

  const handleStartMentorSession = () => {
    setShowMentorSession(true)
    showSuccessToast("Sesión iniciada", "Comenzando tu sesión personalizada con el mentor")
  }

  const handleMentorSessionComplete = (sessionData: MentorSessionData) => {
    const currentSkillId = selectedSkills[currentSkillIndex]

    const newResults = { ...results }
    newResults[currentSkillId] = {
      ...newResults[currentSkillId],
      mentorSessionData: sessionData,
    }
    setResults(newResults)

    showSuccessToast("Sesión completada", "Tu sesión de mentoría ha sido guardada exitosamente")
    handleNextSkill()
  }

  const handleDownloadPDF = async () => {
    const summaryElement = document.getElementById("summary-content-to-pdf")
    if (!summaryElement) {
      showErrorToast("Error de descarga", "No se pudo encontrar el contenido para generar el PDF")
      return
    }

    setPdfGenerating(true)
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
      setPdfGenerating(false)
    }
  }

  // Renderizado condicional según la etapa actual
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <LandingStep onStart={handleStartAssessment} />
      case 1:
        return <UserInfoStep userInfo={userInfo} setUserInfo={setUserInfo} onSubmit={handleUserInfoSubmit} />
      case 2:
        return (
          <SkillSelectionStep
            skills={skills}
            selectedSkills={selectedSkills}
            setSelectedSkills={setSelectedSkills}
            onContinue={handleSkillSelection}
          />
        )
      case 3:
        const currentSkillId = selectedSkills[currentSkillIndex]
        const currentSkill = skills.find((s) => s.id === currentSkillId)

        if (!currentSkill) return <div>Cargando habilidad...</div>

        if (!skillObjectiveSubmitted) {
          return (
            <SkillObjectiveStep
              skillName={currentSkill.name}
              learningObjective={currentSkillLearningObjective}
              setLearningObjective={setCurrentSkillLearningObjective}
              onSubmitObjective={handleSubmitSkillObjective}
              indicadoresInfo={currentSkill.indicadoresInfo}
            />
          )
        } else {
          return (
            <AssessmentStep
              skill={currentSkill}
              questionIndex={currentQuestionIndex}
              currentAnswer={currentAnswer}
              setCurrentAnswer={setCurrentAnswer}
              onNext={handleAnswerQuestion}
            />
          )
        }
      case 4:
        const resultSkillId = selectedSkills[currentSkillIndex]
        const result = results[resultSkillId]

        if (!result) return <div>Cargando resultados...</div>

        const currentSkill2 = skills.find((s) => s.id === resultSkillId)
        const openEndedQuestionId = currentSkill2?.questions.find((q) => q.type === "open")?.id
        const openEndedAnswer = answers[resultSkillId]?.find((answer) => answer.questionId === openEndedQuestionId)
          ?.value as string | undefined

        const userProfileForMentor = {
          ...userInfo,
          learningObjective: currentSkillLearningObjective,
        }

        const allSkillsForNavigation = selectedSkills.map((skillId) => {
          const skillResult = results[skillId]
          return {
            id: skillId,
            name: skills.find((s) => s.id === skillId)?.name || skillId,
            globalScore: skillResult?.globalScore,
            status: skillResult ? "evaluado" : "no_evaluado",
          }
        })

        const handleSelectSkill = (skillId: string) => {
          const newIndex = selectedSkills.findIndex((id) => id === skillId)
          if (newIndex >= 0) {
            setCurrentSkillIndex(newIndex)
          }
        }

        return showMentorSession ? (
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
          <ResultsStep
            result={result}
            hasMoreSkills={currentSkillIndex < selectedSkills.length - 1}
            onNextSkill={handleNextSkill}
            onStartMentorSession={handleStartMentorSession}
            allSkills={selectedSkills.length > 1 ? allSkillsForNavigation : undefined}
            onSelectSkill={selectedSkills.length > 1 ? handleSelectSkill : undefined}
          />
        )
      case 5:
        return (
          <SummaryStep
            results={results}
            onRestart={handleRestart}
            onDownloadPDF={handleDownloadPDF}
            pdfGenerating={pdfGenerating}
            setCurrentStep={setCurrentStep}
          />
        )
      default:
        return <div>Error: Paso desconocido</div>
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Indicador de progreso general */}
        {currentStep > 0 && (
          <div className="mb-6 text-center font-medium text-blue-400 tracking-wider bg-gray-800/50 py-2 px-4 rounded-lg shadow-inner">
            {renderOverallProgress()}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-t-2 border-b-2 border-blue-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-xl">Procesando tu evaluación...</p>
            <p className="mt-2 text-sm text-gray-400">Esto puede tomar unos momentos</p>
          </div>
        ) : (
          renderStep()
        )}
      </div>
    </div>
  )
}

// Componentes para cada etapa (manteniendo los existentes sin cambios)
function LandingStep({
  onStart,
}: {
  onStart: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <h1 className="text-5xl md:text-6xl font-bold mb-3">
        <span className="text-white">SkillBooster</span>
        <span className="text-blue-500">X</span>
      </h1>
      <h2 className="text-3xl md:text-4xl font-semibold text-gray-300 mb-10">Evalúa. Mejora. Despega.</h2>

      <p className="text-lg text-gray-200 max-w-2xl mx-auto mb-12 text-center">
        Descubre y potencia las habilidades clave de tu equipo con micro-evaluaciones y mentoría IA personalizada.
      </p>

      <button
        onClick={onStart}
        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full text-lg font-medium transition-colors duration-150 ease-in-out"
      >
        Empezar Evaluación
      </button>

      <p className="text-xs text-gray-400 mt-4">
        Al continuar, aceptas nuestros{" "}
        <a href="#terminos" className="underline hover:text-blue-400">
          Términos y Condiciones
        </a>
        .
      </p>
    </div>
  )
}

function UserInfoStep({
  userInfo,
  setUserInfo,
  onSubmit,
}: {
  userInfo: UserInfo
  setUserInfo: (value: UserInfo) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  // Define the fields in order
  const fields = [
    { name: "name", label: "¿Cómo te llamas?", type: "text", placeholder: "Escribe aquí tu nombre" },
    {
      name: "role",
      label: "¿Cuál es tu rol actual?",
      type: "text",
      placeholder: "Ej: Gerente de Proyecto, Desarrollador...",
    },
    {
      name: "experience",
      label: "¿Cuántos años de experiencia tienes en este rol?",
      type: "number",
      placeholder: "Ej: 3",
    },
    {
      name: "projectDescription",
      label: "Cuéntanos brevemente sobre tu proyecto o contexto profesional actual.",
      type: "textarea",
      placeholder: "Describe el proyecto o contexto en el que estás trabajando...",
    },
    {
      name: "obstacles",
      label: "Y finalmente, ¿cuáles son los principales obstáculos que enfrentas?",
      type: "textarea",
      placeholder: "Describe los desafíos o problemas que estás tratando de resolver...",
    },
  ]

  // State to track current field index
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0)
  const currentField = fields[currentFieldIndex]

  // Animation state
  const [direction, setDirection] = useState<"entering" | "exiting">("entering")
  const [isAnimating, setIsAnimating] = useState(false)

  // Handle field change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setUserInfo({ ...userInfo, [name]: value })
  }

  // Check if current field is valid
  const isCurrentFieldValid = () => {
    const value = userInfo[currentField.name as keyof UserInfo]

    // For required fields
    if (currentField.name !== "experience") {
      return Boolean(value && String(value).trim() !== "")
    }

    // For experience (optional or valid number)
    return value === "" || (typeof value === "string" && !isNaN(Number(value)))
  }

  // Handle next field
  const handleNextField = () => {
    if (!isCurrentFieldValid()) return

    if (currentFieldIndex < fields.length - 1) {
      // Animate exit
      setDirection("exiting")
      setIsAnimating(true)

      setTimeout(() => {
        setCurrentFieldIndex(currentFieldIndex + 1)
        setDirection("entering")

        setTimeout(() => {
          setIsAnimating(false)
        }, 300)
      }, 300)
    } else {
      // Submit form on last field
      const formEvent = { preventDefault: () => {} } as React.FormEvent
      onSubmit(formEvent)
    }
  }

  // Handle key press (Enter to advance)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && isCurrentFieldValid()) {
      if (currentField.type !== "textarea") {
        e.preventDefault()
        handleNextField()
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">
        Primero, cuéntanos un poco sobre ti y tu proyecto
      </h2>

      {/* Progress indicator */}
      <div className="flex justify-center mb-8">
        <div className="flex space-x-2">
          {fields.map((field, index) => (
            <div
              key={field.name}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                index === currentFieldIndex ? "bg-blue-500" : index < currentFieldIndex ? "bg-blue-300" : "bg-gray-600"
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-3">
          {currentFieldIndex + 1} de {fields.length}
        </span>
      </div>

      <div className="relative overflow-hidden">
        <div
          className={`transition-all duration-300 ease-in-out ${
            isAnimating
              ? direction === "exiting"
                ? "opacity-0 transform translate-x-10"
                : "opacity-0 transform -translate-x-10"
              : "opacity-100 transform translate-x-0"
          }`}
        >
          <div className="mb-8">
            <label htmlFor={currentField.name} className="block text-xl text-white mb-4 font-medium">
              {currentField.label}
            </label>

            {currentField.type === "textarea" ? (
              <textarea
                id={currentField.name}
                name={currentField.name}
                value={(userInfo[currentField.name as keyof UserInfo] as string) || ""}
                onChange={handleChange}
                onKeyDown={handleKeyPress}
                placeholder={currentField.placeholder}
                rows={4}
                className="w-full px-1 py-2 bg-gray-800 text-white border-0 border-b-2 border-gray-700 focus-visible:outline-none focus-visible:border-blue-500 transition-colors rounded-t-md"
                autoFocus
              />
            ) : (
              <input
                type={currentField.type}
                id={currentField.name}
                name={currentField.name}
                value={(userInfo[currentField.name as keyof UserInfo] as string) || ""}
                onChange={handleChange}
                onKeyDown={handleKeyPress}
                placeholder={currentField.placeholder}
                className="w-full px-1 py-2 bg-gray-800 text-white border-0 border-b-2 border-gray-700 focus-visible:outline-none focus-visible:border-blue-500 transition-colors"
                autoFocus
                min={currentField.type === "number" ? 0 : undefined}
              />
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleNextField}
              disabled={!isCurrentFieldValid()}
              className={`px-6 py-2 rounded-full text-white font-medium transition-all flex items-center ${
                isCurrentFieldValid() ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
            >
              {currentFieldIndex === fields.length - 1 ? (
                "Continuar al siguiente paso"
              ) : (
                <>
                  Siguiente
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 ml-2"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Nuevo componente para el objetivo de aprendizaje específico de la habilidad
function SkillObjectiveStep({
  skillName,
  learningObjective,
  setLearningObjective,
  onSubmitObjective,
  indicadoresInfo,
}: {
  skillName: string
  learningObjective: string
  setLearningObjective: (value: string) => void
  onSubmitObjective: () => void
  indicadoresInfo: Array<{ id: string; nombre: string; descripcion_indicador?: string }>
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold mb-4 text-center text-white">{skillName}</h2>
      <p className="text-lg text-gray-300 mb-6 text-center">
        Antes de evaluar, revisemos el enfoque de esta habilidad y, si lo deseas, define un objetivo personal.
      </p>

      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-md overflow-hidden mb-8">
        <div className="p-5 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">Contexto de: {skillName}</h3>
        </div>

        <div className="p-5">
          <p className="mb-3 text-gray-300">Esta habilidad te ayuda a mejorar en los siguientes aspectos clave:</p>

          <ul className="space-y-2 mb-6">
            {indicadoresInfo.map((indicador) => (
              <li key={indicador.id} className="flex items-start">
                <div className="flex-shrink-0 h-5 w-5 text-blue-400 mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex items-center">
                  <span className="text-gray-200">{indicador.nombre}</span>
                  {indicador.descripcion_indicador && (
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            aria-label={`Más información sobre ${indicador.nombre}`}
                            className="ml-1.5 p-0.5 rounded-full hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <Info className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-gray-700 text-gray-200 p-3 rounded-md shadow-lg max-w-xs">
                          <p>{indicador.descripcion_indicador}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="h-px bg-gray-700 my-6"></div>

          <div>
            <label htmlFor="learningObjective" className="block mb-3 text-sm font-medium text-gray-200">
              Si tienes un objetivo específico para la habilidad de <strong>{skillName}</strong> o una situación donde
              te gustaría aplicarla mejor, ¿cuál sería? <span className="text-gray-400">(Opcional)</span>
            </label>
            <textarea
              id="learningObjective"
              value={learningObjective}
              onChange={(e) => setLearningObjective(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
              placeholder={`Ej: Aplicar técnicas de ${skillName} en reuniones de equipo para mejorar mi desempeño profesional.`}
            ></textarea>

            <div className="mt-2 flex items-center text-xs text-gray-400">
              <Lightbulb className="w-4 h-4 mr-1.5 text-blue-400" />
              <span>Este objetivo nos ayudará a personalizar tu sesión con el mentor.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={onSubmitObjective}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full text-lg font-medium transition-colors"
        >
          Continuar a la Evaluación
        </button>
      </div>
    </div>
  )
}

function SkillSelectionStep({
  skills,
  selectedSkills,
  setSelectedSkills,
  onContinue,
}: {
  skills: Skill[]
  selectedSkills: string[]
  setSelectedSkills: (value: string[]) => void
  onContinue: () => void
}) {
  const toggleSkill = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      setSelectedSkills(selectedSkills.filter((id) => id !== skillId))
    } else {
      setSelectedSkills([...selectedSkills, skillId])
    }
  }

  // Function to get a brief description for the tooltip
  const getSkillDescription = (skill: Skill) => {
    // If we have indicadores_info, use the first one's description
    if (skill.indicadoresInfo && skill.indicadoresInfo.length > 0 && skill.indicadoresInfo[0].descripcion_indicador) {
      return skill.indicadoresInfo[0].descripcion_indicador
    }

    // Default description
    return `Evalúa tu nivel de competencia en ${skill.name}`
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center text-white">
        ¿Qué habilidades quieres evaluar hoy?
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-2xl mx-auto">
        {skills.map((skill) => (
          <div
            key={skill.id}
            onClick={() => toggleSkill(skill.id)}
            className={`relative p-6 rounded-xl cursor-pointer transition-all duration-200 ease-in-out transform hover:scale-[1.03] ${
              selectedSkills.includes(skill.id)
                ? "bg-blue-600/20 border-2 border-blue-500 text-white"
                : "bg-gray-800 border border-gray-700 hover:bg-gray-700/70 text-gray-200"
            }`}
          >
            {selectedSkills.includes(skill.id) && <Check className="h-5 w-5 text-blue-400 absolute top-4 right-4" />}

            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <h3 className="text-xl font-semibold mb-2">{skill.name}</h3>
                    <Info className="h-4 w-4 text-gray-400 hover:text-white ml-2 inline-block" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-gray-700 text-gray-200 border-gray-600 rounded-md shadow-lg p-3 text-sm max-w-xs">
                  <p>{getSkillDescription(skill)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="mt-4 space-y-1">
              {skill.indicadoresInfo.slice(0, 3).map((indicador) => (
                <p key={indicador.id} className="text-sm text-gray-400 truncate">
                  • {indicador.nombre}
                </p>
              ))}
              {skill.indicadoresInfo.length > 3 && (
                <p className="text-xs text-gray-500 italic">+{skill.indicadoresInfo.length - 3} indicadores más</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onContinue}
          disabled={selectedSkills.length === 0}
          className={`px-8 py-3 rounded-full text-lg font-medium transition-colors ${
            selectedSkills.length > 0
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-700 text-gray-400 cursor-not-allowed"
          }`}
        >
          {selectedSkills.length === 0
            ? "Selecciona al menos una habilidad"
            : `Iniciar Evaluación de ${selectedSkills.length === 1 ? "Habilidad" : `${selectedSkills.length} Habilidades`}`}
        </button>
      </div>
    </div>
  )
}

function AssessmentStep({
  skill,
  questionIndex,
  currentAnswer,
  setCurrentAnswer,
  onNext,
}: {
  skill: Skill
  questionIndex: number
  currentAnswer: string | number
  setCurrentAnswer: (value: string | number) => void
  onNext: () => void
}) {
  const question = skill.questions[questionIndex]
  const isLastQuestion = questionIndex === skill.questions.length - 1

  // Definir las etiquetas descriptivas para la escala Likert
  const likertLabels: Record<number, string> = {
    1: "Totalmente en desacuerdo",
    2: "En desacuerdo",
    3: "Neutral / A veces",
    4: "De acuerdo",
    5: "Totalmente de acuerdo",
  }

  const handleLikertChange = (value: number) => {
    setCurrentAnswer(value)
  }

  const handleOpenChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentAnswer(e.target.value)
  }

  const isNextDisabled =
    (question.type === "likert" && !currentAnswer) ||
    (question.type === "open" && (!currentAnswer || (currentAnswer as string).trim() === ""))

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-center">{skill.name}</h2>

      <div className="mb-6 flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Pregunta {questionIndex + 1} de {skill.questions.length}
        </div>
        <div className="w-2/3 bg-gray-700 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: `${((questionIndex + 1) / skill.questions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        {question.type === "likert" ? (
          <>
            <p className="text-lg mb-6">{question.prompt}</p>
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-gray-400 px-2">
                <span>Muy en desacuerdo</span>
                <span>Muy de acuerdo</span>
              </div>
              <div className="flex justify-between gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <div key={value} className="flex flex-col items-center flex-1">
                    <button
                      onClick={() => handleLikertChange(value)}
                      className={`w-full py-3 rounded-md transition-all mb-1 ${
                        currentAnswer === value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                      }`}
                      aria-label={`${likertLabels[value]} (${value})`}
                    >
                      {value}
                    </button>
                    <span className="text-xs text-gray-400 text-center px-1 h-8">{likertLabels[value]}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-gray-700/50 p-5 rounded-lg border border-blue-600/30 shadow-lg">
            <div className="flex items-center text-blue-400 mb-3">
              <Lightbulb className="w-5 h-5 mr-2" />
              <h4 className="text-lg font-semibold">Pregunta de Aplicación Práctica</h4>
            </div>

            <p className="text-sm text-gray-300 mb-4 italic">
              Esta pregunta nos ayuda a entender cómo aplicarías esta habilidad en situaciones reales. Tu respuesta
              detallada permitirá una evaluación más precisa y una sesión de mentoría personalizada.
            </p>

            <div className="bg-gray-800/70 p-4 rounded-md mb-4 border-l-4 border-blue-500">
              <p className="text-base text-gray-100">{question.prompt}</p>
            </div>

            <textarea
              value={currentAnswer as string}
              onChange={handleOpenChange}
              rows={7}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
              placeholder="Describe tu enfoque aquí de manera detallada. Cuanto más específico seas, mejor podremos personalizar tu experiencia de aprendizaje..."
            ></textarea>

            <div className="flex items-center mt-3 text-xs text-gray-400">
              <MessageSquare className="w-4 h-4 mr-1 text-gray-500" />
              <span>Tu respuesta será analizada para personalizar tu sesión con el mentor.</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onNext}
          disabled={isNextDisabled}
          className={`px-8 py-3 rounded-full text-lg font-medium transition-all ${
            !isNextDisabled
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-700 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isLastQuestion ? "Enviar Respuestas" : "Siguiente Pregunta"}
        </button>
      </div>
    </div>
  )
}

function ResultsStep({
  result,
  hasMoreSkills,
  onNextSkill,
  onStartMentorSession,
  allSkills,
  onSelectSkill,
}: {
  result: SkillResult
  hasMoreSkills: boolean
  onNextSkill: () => void
  onStartMentorSession: () => void
  allSkills?: { id: string; name: string; globalScore: number; status: string }[]
  onSelectSkill?: (skillId: string) => void
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">Resultados para: {result.skillName}</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-gray-800 rounded-lg p-6 flex flex-col items-center">
          <h3 className="text-xl font-semibold mb-4">Puntaje Global</h3>
          <div className="relative w-48 h-48 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#374151" strokeWidth="10" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#2563EB"
                strokeWidth="10"
                strokeDasharray={`${(result.globalScore / 100) * 283} 283`}
                strokeDashoffset="0"
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-5xl font-bold">{result.globalScore}</span>
              <span className="text-sm text-gray-400">de 100</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Indicadores</h3>
          <TooltipProvider delayDuration={200}>
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
              {result.indicatorScores.map((indicator, index) => (
                <div key={index} className="py-2.5 border-b border-gray-700/50 last:border-b-0">
                  <div className="flex justify-between text-sm mb-1 items-center">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-100">{indicator.name}</span>
                      {indicator.descripcion_indicador && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              aria-label={`Más información sobre ${indicator.name}`}
                              className="ml-1.5 p-0.5 rounded-full hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <Info className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-gray-900 border-gray-700 text-white p-3 rounded-md shadow-lg max-w-xs text-xs z-50">
                            <p className="font-semibold mb-1">{indicator.name}</p>
                            <p>{indicator.descripcion_indicador}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <span
                      className={`px-2 py-1 rounded-md ${
                        indicator.score >= 70
                          ? "bg-green-900/40 text-green-300"
                          : indicator.score >= 40
                            ? "bg-yellow-900/40 text-yellow-300"
                            : "bg-red-900/40 text-red-300"
                      }`}
                    >
                      {indicator.score}/100
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2.5 mb-1.5">
                    <div
                      className={`h-2.5 rounded-full ${
                        indicator.score >= 70 ? "bg-green-500" : indicator.score >= 40 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${indicator.score}%` }}
                    ></div>
                  </div>
                  {indicator.feedback_especifico && (
                    <p className="text-xs text-blue-300/90 italic bg-gray-800/70 p-2 rounded-md mt-1 border-l-2 border-blue-500/50">
                      {indicator.feedback_especifico}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {allSkills && (
        <div className="mb-6">
          <h4 className="text-xl font-semibold mb-3">Navega entre tus Habilidades Evaluadas</h4>
          <div className="flex space-x-3 overflow-x-auto py-2">
            {allSkills.map((skill) => (
              <button
                key={skill.id}
                onClick={() => onSelectSkill?.(skill.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  skill.id === result.skillId
                    ? "bg-blue-600 text-white"
                    : skill.status === "evaluado"
                      ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                      : "bg-gray-800 text-gray-500 cursor-not-allowed"
                }`}
                disabled={skill.status !== "evaluado"}
              >
                {skill.name} ({skill.globalScore || "Pendiente"})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center mb-10">
        <button
          onClick={onStartMentorSession}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-medium transition-all flex items-center justify-center"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
          Iniciar Sesión con Mentor Práctico
        </button>
      </div>

      <div className="flex justify-center">
        <button
          onClick={onNextSkill}
          className="px-8 py-3 bg-gray-700 hover:bg-gray-600 rounded-full text-white font-medium transition-all"
        >
          {hasMoreSkills ? "Evaluar Siguiente Habilidad" : "Ver Resumen Final"}
        </button>
      </div>
    </div>
  )
}

function SummaryStep({
  results,
  onRestart,
  onDownloadPDF,
  pdfGenerating,
  setCurrentStep,
}: {
  results: Record<string, SkillResult>
  onRestart: () => void
  onDownloadPDF: () => void
  pdfGenerating: boolean
  setCurrentStep: (step: number) => void
}) {
  const resultsArray = Object.values(results)

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold mb-4 text-center">Resumen de tu Evaluación</h2>

      {/* Texto de cierre explícito */}
      <div className="bg-blue-900/30 rounded-lg p-4 mb-6 text-center">
        <p className="text-gray-200">
          Has completado tu ciclo de evaluación y mentoría para las habilidades seleccionadas. A continuación, puedes
          ver un resumen, descargar tu reporte completo o iniciar una nueva evaluación.
        </p>
      </div>

      <div id="summary-content-to-pdf" className="bg-gray-800 rounded-lg p-6 mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-xl font-semibold mb-4">Puntajes Globales</h3>
            <div className="space-y-4">
              {resultsArray.map((result, index) => (
                <div key={index}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{result.skillName}</span>
                    <span>{result.globalScore}/100</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${result.globalScore}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-4">Fortalezas y Oportunidades</h3>
            <TooltipProvider delayDuration={200}>
              <div className="space-y-4">
                {resultsArray.map((result) => {
                  // Encontrar el indicador con mayor puntuación (fortaleza)
                  const highestScore = [...result.indicatorScores].sort((a, b) => b.score - a.score)[0]
                  // Encontrar el indicador con menor puntuación (oportunidad)
                  const lowestScore = [...result.indicatorScores].sort((a, b) => a.score - b.score)[0]

                  return (
                    <div key={result.skillId} className="mb-4">
                      <h4 className="font-medium text-blue-400 mb-1">{result.skillName}</h4>
                      <div className="pl-2 text-sm">
                        <p className="mb-2 flex items-center">
                          <span className="font-medium text-green-400 mr-1">💪 Fortaleza: </span>
                          <span className="mr-1">{highestScore.name}</span>
                          {highestScore.descripcion_indicador && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  aria-label={`Más información sobre ${highestScore.name}`}
                                  className="ml-1.5 p-0.5 rounded-full hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-900 border-gray-700 text-white p-3 rounded-md shadow-lg max-w-xs text-xs">
                                <p className="font-semibold mb-1">{highestScore.name}</p>
                                <p>{highestScore.descripcion_indicador}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </p>
                        <p className="flex items-center">
                          <span className="font-medium text-yellow-400 mr-1">🔍 Oportunidad: </span>
                          <span className="mr-1">{lowestScore.name}</span>
                          {lowestScore.descripcion_indicador && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  aria-label={`Más información sobre ${lowestScore.name}`}
                                  className="ml-1.5 p-0.5 rounded-full hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-900 border-gray-700 text-white p-3 rounded-md shadow-lg max-w-xs text-xs">
                                <p className="font-semibold mb-1">{lowestScore.name}</p>
                                <p>{lowestScore.descripcion_indicador}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </TooltipProvider>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-4">Recomendaciones Clave</h3>
          <div className="space-y-4">
            {resultsArray.map((result) => (
              <div key={result.skillId} className="mb-4">
                <h4 className="font-medium text-blue-400 mb-1">{result.skillName}:</h4>
                <ul className="list-disc list-inside space-y-1 pl-4 text-sm">
                  {result.tips.map((tip, tipIndex) => (
                    <li key={tipIndex} className="text-gray-300">
                      <span
                        className={`font-medium ${tipIndex === 0 ? "text-green-400" : tipIndex === 1 ? "text-yellow-400" : "text-blue-400"}`}
                      >
                        {tipIndex === 0 ? "💪 Fortaleza: " : tipIndex === 1 ? "🔍 Oportunidad: " : "💡 Consejo: "}
                      </span>
                      {tip.replace(/^(Fortaleza|Oportunidad|Consejo):\s*/i, "")}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard del Ejercicio Práctico */}
        {resultsArray.some((result) => result.mentorSessionData?.exerciseScore !== undefined) && (
          <div className="mt-8 border-t border-gray-700 pt-6">
            <h3 className="text-xl font-semibold mb-4">Análisis de tu Práctica con el Mentor</h3>
            <div className="space-y-6">
              {resultsArray
                .filter((result) => result.mentorSessionData?.exerciseScore !== undefined)
                .map((result) => (
                  <div key={`exercise-${result.skillId}`} className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium text-blue-400 mb-3">{result.skillName}</h4>

                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium text-white">Tu Desempeño en el Ejercicio:</h5>
                        <span className="text-xl font-bold">{result.mentorSessionData?.exerciseScore}/100</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-3">
                        <div
                          className="bg-blue-600 h-3 rounded-full"
                          style={{ width: `${result.mentorSessionData?.exerciseScore}%` }}
                        ></div>
                      </div>
                    </div>

                    {result.mentorSessionData?.exerciseScoreJustification && (
                      <div>
                        <h5 className="font-medium text-white mb-2">Justificación del Mentor:</h5>
                        <p className="text-sm text-gray-300 pl-2">
                          {result.mentorSessionData.exerciseScoreJustification}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Sección de Sesión con Mentor */}
        {resultsArray.some((result) => result.mentorSessionData) && (
          <div className="mt-8 border-t border-gray-700 pt-6">
            <h3 className="text-xl font-semibold mb-4">Resultados de Sesión con Mentor</h3>
            <div className="space-y-6">
              {resultsArray
                .filter((result) => result.mentorSessionData)
                .map((result) => (
                  <div key={`mentor-${result.skillId}`} className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium text-blue-400 mb-3">{result.skillName}</h4>

                    <Accordion type="single" collapsible className="w-full">
                      {/* Item 1: Micro-Lección Personalizada */}
                      {result.mentorSessionData?.microLesson && (
                        <AccordionItem value="micro-lesson" className="border-b border-gray-600">
                          <AccordionTrigger className="py-3 hover:text-blue-300 transition-colors">
                            <div className="flex items-center">
                              <Lightbulb className="w-5 h-5 mr-2 text-blue-400" />
                              <span>Paso 1: Tu Micro-Lección Personalizada</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 px-3 bg-gray-800/50 rounded-md">
                            <ReactMarkdown className="text-sm text-gray-300 prose prose-invert prose-sm max-w-none">
                              {result.mentorSessionData.microLesson}
                            </ReactMarkdown>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {/* Item 2: Análisis de Tu Práctica con el Mentor */}
                      {result.mentorSessionData?.exerciseScore !== undefined && (
                        <AccordionItem value="exercise-analysis" className="border-b border-gray-600">
                          <AccordionTrigger className="py-3 hover:text-blue-300 transition-colors">
                            <div className="flex items-center">
                              <Target className="w-5 h-5 mr-2 text-green-400" />
                              <span>Paso 2: Tu Desempeño en el Ejercicio Práctico</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 px-3 bg-gray-800/50 rounded-md">
                            <div className="mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-300">Puntuación:</span>
                                <span className="text-lg font-semibold text-green-400">
                                  {result.mentorSessionData.exerciseScore}/100
                                </span>
                              </div>
                              <Progress value={result.mentorSessionData.exerciseScore} className="h-2 bg-gray-700" />
                            </div>

                            {result.mentorSessionData.exerciseScoreJustification && (
                              <div className="mt-3">
                                <h6 className="text-sm font-medium text-gray-200 mb-1">Justificación del Mentor:</h6>
                                <p className="text-sm text-gray-300 italic border-l-2 border-green-500/40 pl-3">
                                  {result.mentorSessionData.exerciseScoreJustification}
                                </p>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {/* Item 3: Plan de Acción SMART */}
                      {result.mentorSessionData?.actionPlan && (
                        <AccordionItem value="action-plan" className="border-b border-gray-600">
                          <AccordionTrigger className="py-3 hover:text-blue-300 transition-colors">
                            <div className="flex items-center">
                              <ClipboardList className="w-5 h-5 mr-2 text-yellow-400" />
                              <span>Paso 3: Tu Plan de Acción Personalizado</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 px-3 bg-gray-800/50 rounded-md">
                            <ReactMarkdown className="text-sm text-gray-300 prose prose-invert prose-sm max-w-none">
                              {result.mentorSessionData.actionPlan}
                            </ReactMarkdown>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {/* Item 4: Síntesis y Proyección de Crecimiento */}
                      {(result.mentorSessionData?.userInsight ||
                        result.mentorSessionData?.userCommitment ||
                        result.mentorSessionData?.mentorProjection) && (
                        <AccordionItem value="synthesis" className="border-b border-gray-600">
                          <AccordionTrigger className="py-3 hover:text-blue-300 transition-colors">
                            <div className="flex items-center">
                              <TrendingUp className="w-5 h-5 mr-2 text-blue-400" />
                              <span>Paso 4: Tu Síntesis y Proyección de Crecimiento</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 px-3 bg-gray-800/50 rounded-md">
                            <div className="space-y-4">
                              {result.mentorSessionData?.userInsight && (
                                <div>
                                  <h6 className="text-sm font-medium text-green-400 mb-1">
                                    Mi Principal "Aha!" Moment:
                                  </h6>
                                  <p className="text-sm text-gray-300 bg-gray-800/70 p-2 rounded-md">
                                    {result.mentorSessionData.userInsight}
                                  </p>
                                </div>
                              )}

                              {result.mentorSessionData?.userCommitment && (
                                <div>
                                  <h6 className="text-sm font-medium text-yellow-400 mb-1">Mi Compromiso de Acción:</h6>
                                  <p className="text-sm text-gray-300 bg-gray-800/70 p-2 rounded-md">
                                    {result.mentorSessionData.userCommitment}
                                  </p>
                                </div>
                              )}

                              {result.mentorSessionData?.mentorProjection && (
                                <div>
                                  <h6 className="text-sm font-medium text-blue-400 mb-1">
                                    Proyección de Crecimiento del Mentor:
                                  </h6>
                                  <ReactMarkdown className="text-sm text-gray-300 bg-gray-800/70 p-2 rounded-md prose prose-invert prose-sm max-w-none">
                                    {result.mentorSessionData.mentorProjection}
                                  </ReactMarkdown>
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {/* Item 5: Feedback de la Sesión (Opcional) */}
                      {result.mentorSessionData?.sessionFeedback && (
                        <AccordionItem value="feedback" className="border-b-0">
                          <AccordionTrigger className="py-3 hover:text-blue-300 transition-colors">
                            <div className="flex items-center">
                              <Star className="w-5 h-5 mr-2 text-yellow-400" />
                              <span>Tu Feedback sobre la Sesión</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 px-3 bg-gray-800/50 rounded-md">
                            <div className="flex items-center mb-2">
                              <p className="text-sm text-gray-300 mr-2">Calificación:</p>
                              <div className="flex">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <span
                                    key={star}
                                    className={
                                      star <= result.mentorSessionData!.sessionFeedback!.rating
                                        ? "text-yellow-400"
                                        : "text-gray-500"
                                    }
                                  >
                                    ★
                                  </span>
                                ))}
                              </div>
                            </div>

                            {result.mentorSessionData.sessionFeedback.comment && (
                              <div className="mt-2">
                                <h6 className="text-sm font-medium text-gray-200 mb-1">Tu comentario:</h6>
                                <p className="text-sm text-gray-300 italic bg-gray-800/70 p-2 rounded-md">
                                  "{result.mentorSessionData.sessionFeedback.comment}"
                                </p>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row justify-center gap-4 mb-6">
        <button
          onClick={onDownloadPDF}
          disabled={pdfGenerating}
          className={`px-8 py-3 rounded-full text-white font-medium transition-all flex items-center justify-center ${
            pdfGenerating ? "bg-gray-600 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {pdfGenerating ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Generando PDF...
            </>
          ) : (
            "Descargar Reporte PDF"
          )}
        </button>
        <button
          onClick={() => setCurrentStep(2)}
          className="px-8 py-3 bg-gray-700 hover:bg-gray-600 rounded-full text-white font-medium transition-all"
        >
          Evaluar Otras Habilidades
        </button>
        <button
          onClick={onRestart}
          className="px-8 py-3 bg-gray-700 hover:bg-gray-600 rounded-full text-white font-medium transition-all"
        >
          Iniciar Nueva Evaluación
        </button>
      </div>

      <div className="text-center text-gray-400 text-sm">
        <p>Gracias por utilizar SkillBoosterX. ¡Esperamos que esta evaluación te ayude en tu desarrollo profesional!</p>
      </div>
    </div>
  )
}
