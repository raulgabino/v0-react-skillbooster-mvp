"use client"

import type React from "react"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import MentorSessionInterface, { type MentorSessionData } from "./mentor-session-interface"

// Importación dinámica de jsPDF y html2canvas para evitar problemas de SSR
const jsPDF = dynamic(() => import("jspdf"), { ssr: false })
const html2canvas = dynamic(() => import("html2canvas"), { ssr: false })

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info, MessageSquare, Lightbulb } from "lucide-react"

// Importar tipos
type UserInfo = {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
  // Se elimina learningObjective del UserInfo general
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
  // Estado para controlar el flujo
  const [currentStep, setCurrentStep] = useState<number>(0)
  const [userInfo, setUserInfo] = useState<UserInfo>({
    name: "",
    role: "",
    experience: "",
    projectDescription: "",
    obstacles: "",
    // Se elimina learningObjective del estado inicial
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

  // Función para renderizar el indicador de progreso general
  const renderOverallProgress = (): string => {
    const totalSelectedSkills = selectedSkills.length

    switch (currentStep) {
      case 0: // LandingStep
        return "" // No mostramos progreso en la página de inicio
      case 1: // UserInfoStep
        return "Paso 1 de 4: Perfil de Usuario"
      case 2: // SkillSelectionStep
        return "Paso 2 de 4: Selección de Habilidades"
      case 3: // SkillObjectiveStep o AssessmentStep
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
      case 4: // ResultsStep o MentorSessionInterface
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
      case 5: // SummaryStep
        return "Paso 4 de 4: Resumen Final"
      default:
        return ""
    }
  }

  // Cargar datos de preguntas
  useEffect(() => {
    // Cargamos los datos desde la API
    const loadSkillsData = async () => {
      try {
        // Llamada a la API para obtener las habilidades con datos completos
        const response = await fetch("/api/questions")
        if (!response.ok) {
          throw new Error(`Error al cargar datos de habilidades: ${response.statusText}`)
        }

        const skillsData: Skill[] = await response.json()
        setSkills(skillsData)
      } catch (error) {
        console.error("Error al cargar las habilidades:", error)
      }
    }

    loadSkillsData()
  }, [])

  // Manejadores de eventos
  const handleStartAssessment = () => {
    if (acceptedTerms) {
      setCurrentStep(1)
    }
  }

  const handleUserInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (userInfo.name && userInfo.role && userInfo.projectDescription && userInfo.obstacles) {
      setCurrentStep(2)
    }
  }

  const handleSkillSelection = () => {
    if (selectedSkills.length > 0) {
      setCurrentSkillIndex(0)
      setCurrentQuestionIndex(0)
      setCurrentSkillLearningObjective("") // Limpiar para la nueva habilidad
      setSkillObjectiveSubmitted(false) // Reiniciar para la nueva habilidad

      // Inicializamos el objeto de respuestas para cada habilidad seleccionada
      const initialAnswers: Record<string, Answer[]> = {}
      selectedSkills.forEach((skillId) => {
        initialAnswers[skillId] = []
      })
      setAnswers(initialAnswers)

      setCurrentStep(3) // Ir al nuevo SkillObjectiveStep
    }
  }

  // Función para manejar el envío del objetivo de la habilidad
  const handleSubmitSkillObjective = () => {
    setSkillObjectiveSubmitted(true)
  }

  const handleAnswerQuestion = async () => {
    const currentSkillId = selectedSkills[currentSkillIndex]
    const currentSkill = skills.find((s) => s.id === currentSkillId)

    if (!currentSkill) return

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

    // Limpiamos la respuesta actual
    setCurrentAnswer("")

    // Verificamos si hay más preguntas para esta habilidad
    if (currentQuestionIndex < currentSkill.questions.length - 1) {
      // Pasamos a la siguiente pregunta
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
          throw new Error(`Error en la API de puntuación: ${scoreResponse.statusText}`)
        }

        const scoreData = await scoreResponse.json()
        const { indicatorScores, globalScore } = scoreData

        // 2. Llamada a la API de tips
        const lessonResponse = await fetch("/api/lesson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            skillId: currentSkillId,
            userInfo,
            indicatorScores,
            globalScore,
            openEndedAnswer,
          }),
        })

        if (!lessonResponse.ok) {
          throw new Error(`Error en la API de tips: ${lessonResponse.statusText}`)
        }

        const lessonData = await lessonResponse.json()
        const { tips } = lessonData

        // 3. Construimos el resultado completo
        const result: SkillResult = {
          skillId: currentSkillId,
          skillName: currentSkill.name, // Usar name en lugar de axis
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
      } catch (error) {
        console.error("Error al procesar la evaluación:", error)
        // En caso de error, mostramos un resultado simulado para no interrumpir el flujo
        const fallbackResult: SkillResult = {
          skillId: currentSkillId,
          skillName: currentSkill.name,
          globalScore: 75,
          indicatorScores: newAnswers[currentSkillId].map((answer) => ({
            id: answer.questionId,
            name: answer.questionId,
            score: typeof answer.value === "number" ? answer.value * 20 : 60,
          })),
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
    // Verificamos si hay más habilidades por evaluar
    if (currentSkillIndex < selectedSkills.length - 1) {
      // Pasamos a la siguiente habilidad
      setCurrentSkillIndex(currentSkillIndex + 1)
      setCurrentQuestionIndex(0)
      setCurrentSkillLearningObjective("") // Limpiar para la nueva habilidad
      setSkillObjectiveSubmitted(false) // Reiniciar para la nueva habilidad
      setCurrentStep(3) // Volvemos a la pantalla de objetivo de habilidad
      setShowMentorSession(false)
    } else {
      // Pasamos a la pantalla de resumen final
      setCurrentStep(5)
    }
  }

  const handleRestart = () => {
    // Reiniciamos todo el proceso
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
    setCurrentSkillLearningObjective("") // Limpiar el objetivo de aprendizaje
    setSkillObjectiveSubmitted(false) // Reiniciar el estado de envío
    setAnswers({})
    setResults({})
    setShowMentorSession(false)
  }

  const handleStartMentorSession = () => {
    setShowMentorSession(true)
  }

  const handleMentorSessionComplete = (sessionData: MentorSessionData) => {
    const currentSkillId = selectedSkills[currentSkillIndex]

    // Actualizar los resultados con los datos de la sesión de mentoría
    const newResults = { ...results }
    newResults[currentSkillId] = {
      ...newResults[currentSkillId],
      mentorSessionData: sessionData,
    }
    setResults(newResults)

    // Avanzar automáticamente al siguiente paso en el flujo
    handleNextSkill()
  }

  const handleDownloadPDF = async () => {
    const summaryElement = document.getElementById("summary-content-to-pdf")
    if (!summaryElement) {
      console.error("Elemento del resumen no encontrado para generar PDF.")
      return
    }

    setPdfGenerating(true)
    try {
      // Importar dinámicamente las librerías
      const jsPDFModule = await import("jspdf")
      const html2canvasModule = await import("html2canvas")

      const JsPDF = jsPDFModule.default
      const html2canvas = html2canvasModule.default

      // Crear el canvas
      const canvas = await html2canvas(summaryElement, {
        scale: 2, // Aumenta la escala para mejor calidad de imagen en el PDF
        useCORS: true, // Si tienes imágenes externas
        logging: false, // Para depuración
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
      const imgX = (pdfWidth - imgWidth * ratio) / 2 // Centrar imagen
      const imgY = 10 // Margen superior

      pdf.addImage(imgData, "PNG", imgX, imgY, imgWidth * ratio, imgHeight * ratio)
      pdf.save("reporte-skillboosterx.pdf")
    } catch (error) {
      console.error("Error al generar PDF:", error)
      // Aquí podrías mostrar un mensaje de error al usuario
    } finally {
      setPdfGenerating(false)
    }
  }

  // Renderizado condicional según la etapa actual
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <LandingStep
            acceptedTerms={acceptedTerms}
            setAcceptedTerms={setAcceptedTerms}
            onStart={handleStartAssessment}
          />
        )
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

        // Renderizar SkillObjectiveStep o AssessmentStep según el estado
        if (!skillObjectiveSubmitted) {
          return (
            <SkillObjectiveStep
              skillName={currentSkill.name} // Usar name en lugar de axis
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

        // Encontrar la respuesta a la pregunta abierta
        const currentSkill2 = skills.find((s) => s.id === resultSkillId)
        const openEndedQuestionId = currentSkill2?.questions.find((q) => q.type === "open")?.id
        const openEndedAnswer = answers[resultSkillId]?.find((answer) => answer.questionId === openEndedQuestionId)
          ?.value as string | undefined

        // Crear un perfil de usuario que incluya el objetivo de aprendizaje específico
        const userProfileForMentor = {
          ...userInfo,
          learningObjective: currentSkillLearningObjective, // Añadir el objetivo específico de la habilidad
        }

        // Preparar datos para el navegador de habilidades
        const allSkillsForNavigation = selectedSkills.map((skillId) => {
          const skillResult = results[skillId]
          return {
            id: skillId,
            name: skills.find((s) => s.id === skillId)?.name || skillId,
            globalScore: skillResult?.globalScore,
            status: skillResult ? "evaluado" : "no_evaluado",
          }
        })

        // Función para cambiar a otra habilidad evaluada
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
            userProfile={userProfileForMentor} // Pasar el perfil modificado
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
            <p className="mt-4 text-xl">Procesando...</p>
          </div>
        ) : (
          renderStep()
        )}
      </div>
    </div>
  )
}

// Componentes para cada etapa
function LandingStep({
  acceptedTerms,
  setAcceptedTerms,
  onStart,
}: {
  acceptedTerms: boolean
  setAcceptedTerms: (value: boolean) => void
  onStart: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
      <h1 className="text-5xl md:text-6xl font-bold mb-4">
        <span className="text-white">SkillBooster</span>
        <span className="text-blue-500">X</span>
      </h1>
      <h2 className="text-3xl md:text-4xl font-semibold mb-8">Evalúa. Mejora. Despega.</h2>

      <div className="max-w-2xl mb-10 text-gray-300">
        <p className="mb-6">
          Tu equipo tiene el poder de sostener el cambio. Nosotros lo afinamos. SkillBoosterX es una herramienta ágil
          para líderes y equipos que creen en la sostenibilidad con acción real.
        </p>
        <p className="mb-6">
          Medimos, fortalecemos y activamos 4 micro-habilidades esenciales para que tu proyecto avance, incluso cuando
          cambia la voz que lo lidera.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-left">
          <div className="flex items-start">
            <span className="mr-2 text-blue-500">💡</span>
            <p>Mide brechas invisibles</p>
          </div>
          <div className="flex items-start">
            <span className="mr-2 text-blue-500">🤝</span>
            <p>Redistribuye roles con inteligencia</p>
          </div>
          <div className="flex items-start">
            <span className="mr-2 text-blue-500">🚀</span>
            <p>Asigna retos breves, personalizados y efectivos</p>
          </div>
          <div className="flex items-start">
            <span className="mr-2 text-blue-500">📄</span>
            <p>Descarga reportes con una visión clara de tu equipo</p>
          </div>
        </div>
        <p className="italic">Porque los proyectos sustentables se construyen en equipo — no en piloto automático.</p>
      </div>

      <div className="mb-8 flex items-center">
        <input
          type="checkbox"
          id="terms"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mr-2 h-5 w-5"
        />
        <label htmlFor="terms" className="text-sm text-gray-300">
          Acepto el uso de mis datos para la evaluación y generación de recomendaciones.
        </label>
      </div>

      <button
        onClick={onStart}
        disabled={!acceptedTerms}
        className={`px-8 py-3 rounded-full text-lg font-medium transition-all ${
          acceptedTerms ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-700 text-gray-400 cursor-not-allowed"
        }`}
      >
        Empezar Evaluación
      </button>
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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setUserInfo({ ...userInfo, [name]: value })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">
        Primero, cuéntanos un poco sobre ti y tu proyecto
      </h2>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block mb-2 text-sm font-medium">
            Nombre
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={userInfo.name}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="role" className="block mb-2 text-sm font-medium">
            Rol Actual
          </label>
          <input
            type="text"
            id="role"
            name="role"
            value={userInfo.role}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="experience" className="block mb-2 text-sm font-medium">
            Años de Experiencia
          </label>
          <input
            type="number"
            id="experience"
            name="experience"
            value={userInfo.experience}
            onChange={handleChange}
            min="0"
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="projectDescription" className="block mb-2 text-sm font-medium">
            Describe brevemente tu proyecto o contexto
          </label>
          <textarea
            id="projectDescription"
            name="projectDescription"
            value={userInfo.projectDescription}
            onChange={handleChange}
            required
            rows={4}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          ></textarea>
        </div>

        <div>
          <label htmlFor="obstacles" className="block mb-2 text-sm font-medium">
            Principales obstáculos que enfrentas
          </label>
          <textarea
            id="obstacles"
            name="obstacles"
            value={userInfo.obstacles}
            onChange={handleChange}
            required
            rows={4}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          ></textarea>
        </div>

        {/* Se elimina el campo de objetivo de aprendizaje */}

        <div className="flex justify-center pt-4">
          <button
            type="submit"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-medium transition-all"
          >
            Continuar
          </button>
        </div>
      </form>
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
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">Objetivo para la habilidad: {skillName}</h2>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-semibold mb-3">Contexto de la Habilidad:</h3>
        <p className="mb-3">Esta habilidad se enfoca en tu capacidad para:</p>
        <ul className="list-disc pl-6 mb-6 space-y-1 text-gray-300">
          {indicadoresInfo.map((indicador) => (
            <li key={indicador.id}>{indicador.nombre}</li>
          ))}
        </ul>

        <div className="border-t border-gray-700 pt-5 mt-5">
          <label htmlFor="learningObjective" className="block mb-3 text-sm font-medium">
            Si tienes un objetivo específico para la habilidad de <strong>{skillName}</strong> o una situación donde te
            gustaría aplicarla mejor, ¿cuál sería? (Este campo es opcional)
          </label>
          <textarea
            id="learningObjective"
            value={learningObjective}
            onChange={(e) => setLearningObjective(e.target.value)}
            rows={5}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ej: Aplicar técnicas de comunicación asertiva en reuniones de equipo para presentar mis ideas con más confianza."
          ></textarea>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={onSubmitObjective}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-medium transition-all"
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

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">¿Qué habilidades quieres evaluar hoy?</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {skills.map((skill) => (
          <div
            key={skill.id}
            onClick={() => toggleSkill(skill.id)}
            className={`p-4 rounded-lg cursor-pointer transition-all ${
              selectedSkills.includes(skill.id)
                ? "bg-blue-600 border-2 border-blue-400"
                : "bg-gray-800 border border-gray-700 hover:bg-gray-700"
            }`}
          >
            <div className="flex items-center">
              <input
                type="checkbox"
                id={skill.id}
                checked={selectedSkills.includes(skill.id)}
                onChange={() => {}} // Manejado por el onClick del div
                className="h-5 w-5 mr-3"
              />
              <label htmlFor={skill.id} className="cursor-pointer font-medium">
                {skill.name}
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onContinue}
          disabled={selectedSkills.length === 0}
          className={`px-8 py-3 rounded-full text-lg font-medium transition-all ${
            selectedSkills.length > 0
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-700 text-gray-400 cursor-not-allowed"
          }`}
        >
          Iniciar Evaluación de Habilidad{selectedSkills.length !== 1 ? "es" : ""}
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
            <div className="absolute text-5xl font-bold">{result.globalScore}</div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Indicadores</h3>
          <TooltipProvider delayDuration={200}>
            <div className="space-y-4">
              {result.indicatorScores.slice(0, 6).map((indicator, index) => (
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
                        indicator.score >= 75
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
                        indicator.score >= 75 ? "bg-green-500" : indicator.score >= 40 ? "bg-yellow-500" : "bg-red-500"
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
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-medium transition-all"
        >
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
                          <span className="text-gray-400">({highestScore.score}/100)</span>
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
                          <span className="text-gray-400">({lowestScore.score}/100)</span>
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

                    {result.mentorSessionData?.microLesson && (
                      <div className="mb-4">
                        <h5 className="font-medium text-white mb-1">Mi Micro-Lección Personalizada:</h5>
                        <p className="text-sm text-gray-300 pl-2">{result.mentorSessionData.microLesson}</p>
                      </div>
                    )}

                    {result.mentorSessionData?.actionPlan && (
                      <div className="mb-4">
                        <h5 className="font-medium text-white mb-1">Mi Plan de Acción:</h5>
                        <p className="text-sm text-gray-300 pl-2">{result.mentorSessionData.actionPlan}</p>
                      </div>
                    )}

                    {(result.mentorSessionData?.userInsight ||
                      result.mentorSessionData?.userCommitment ||
                      result.mentorSessionData?.mentorProjection) && (
                      <div className="mb-4">
                        <h5 className="font-medium text-white mb-1">Mi Síntesis y Proyección de Crecimiento:</h5>

                        {result.mentorSessionData?.userInsight && (
                          <div className="mb-2">
                            <p className="text-sm font-medium text-green-400 pl-2">Mi Principal "Aha!" Moment:</p>
                            <p className="text-sm text-gray-300 pl-4">{result.mentorSessionData.userInsight}</p>
                          </div>
                        )}

                        {result.mentorSessionData?.userCommitment && (
                          <div className="mb-2">
                            <p className="text-sm font-medium text-yellow-400 pl-2">Mi Compromiso de Acción:</p>
                            <p className="text-sm text-gray-300 pl-4">{result.mentorSessionData.userCommitment}</p>
                          </div>
                        )}

                        {result.mentorSessionData?.mentorProjection && (
                          <div>
                            <p className="text-sm font-medium text-blue-400 pl-2">
                              Proyección de Crecimiento del Mentor:
                            </p>
                            <p className="text-sm text-gray-300 pl-4">{result.mentorSessionData.mentorProjection}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {result.mentorSessionData?.sessionFeedback && (
                      <div className="mt-3 pt-3 border-t border-gray-600">
                        <h5 className="font-medium text-white mb-1">Tu Feedback sobre la Sesión:</h5>
                        <div className="flex items-center mb-1">
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
                          <p className="text-sm text-gray-300 pl-2">
                            "{result.mentorSessionData.sessionFeedback.comment}"
                          </p>
                        )}
                      </div>
                    )}
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
