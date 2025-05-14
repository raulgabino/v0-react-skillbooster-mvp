"use client"

import type React from "react"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import MentorSessionInterface, { type MentorSessionData } from "./mentor-session-interface"

// Importación dinámica de jsPDF y html2canvas para evitar problemas de SSR
const jsPDF = dynamic(() => import("jspdf"), { ssr: false })
const html2canvas = dynamic(() => import("html2canvas"), { ssr: false })

// Importar tipos
type UserInfo = {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
  learningObjective?: string // Nuevo campo añadido
}

type Skill = {
  id: string
  axis: string
  questions: Question[]
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

type SkillResult = {
  skillId: string
  skillName: string
  globalScore: number
  indicatorScores: {
    id: string
    name: string
    score: number
  }[]
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
    learningObjective: "", // Inicializado como string vacío
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

  // Cargar datos de preguntas
  useEffect(() => {
    // Cargamos los datos desde la API
    const loadQuestions = async () => {
      try {
        // Llamada a la API para obtener las preguntas
        const response = await fetch("/api/questions")
        const data = await response.json()

        // Procesamos los datos para agruparlos por habilidad
        const skillsMap: Record<string, Question[]> = {}

        // Procesamos los datos recibidos de la API
        data.forEach((question: Question) => {
          if (!skillsMap[question.axis]) {
            skillsMap[question.axis] = []
          }
          skillsMap[question.axis].push(question)
        })

        // Convertimos el mapa a un array de habilidades
        const skillsArray: Skill[] = Object.keys(skillsMap).map((axis) => ({
          id: axis.replace(/\s+/g, "_").toLowerCase(),
          axis: axis,
          questions: skillsMap[axis],
        }))

        setSkills(skillsArray)
      } catch (error) {
        console.error("Error al cargar las preguntas:", error)
      }
    }

    loadQuestions()
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
      setCurrentStep(3)
      setCurrentSkillIndex(0)
      setCurrentQuestionIndex(0)

      // Inicializamos el objeto de respuestas para cada habilidad seleccionada
      const initialAnswers: Record<string, Answer[]> = {}
      selectedSkills.forEach((skillId) => {
        initialAnswers[skillId] = []
      })
      setAnswers(initialAnswers)
    }
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
          skillName: currentSkill.axis,
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
          skillName: currentSkill.axis,
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
      setCurrentStep(3) // Volvemos a la pantalla de evaluación
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
      learningObjective: "",
    })
    setAcceptedTerms(false)
    setSelectedSkills([])
    setCurrentSkillIndex(0)
    setCurrentQuestionIndex(0)
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

        if (!currentSkill) return <div>Cargando...</div>

        return (
          <AssessmentStep
            skill={currentSkill}
            questionIndex={currentQuestionIndex}
            currentAnswer={currentAnswer}
            setCurrentAnswer={setCurrentAnswer}
            onNext={handleAnswerQuestion}
          />
        )
      case 4:
        const resultSkillId = selectedSkills[currentSkillIndex]
        const result = results[resultSkillId]

        if (!result) return <div>Cargando resultados...</div>

        // Encontrar la respuesta a la pregunta abierta
        const currentSkill2 = skills.find((s) => s.id === resultSkillId)
        const openEndedQuestionId = currentSkill2?.questions.find((q) => q.type === "open")?.id
        const openEndedAnswer = answers[resultSkillId]?.find((answer) => answer.questionId === openEndedQuestionId)
          ?.value as string | undefined

        return showMentorSession ? (
          <MentorSessionInterface
            skillId={resultSkillId}
            skillName={result.skillName}
            globalScore={result.globalScore}
            indicatorScores={result.indicatorScores}
            openEndedAnswer={openEndedAnswer}
            userProfile={userInfo}
            onSessionComplete={handleMentorSessionComplete}
          />
        ) : (
          <ResultsStep
            result={result}
            hasMoreSkills={currentSkillIndex < selectedSkills.length - 1}
            onNextSkill={handleNextSkill}
            onStartMentorSession={handleStartMentorSession}
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

  // Determinar si hay una habilidad seleccionada para personalizar el texto del campo de objetivo
  const getObjectiveLabel = () => {
    // Aquí podríamos obtener la habilidad seleccionada si ya existiera
    // Por ahora usamos un texto genérico
    return "Si tienes un objetivo específico para la habilidad que vas a evaluar, ¿cuál es o en qué situación te gustaría aplicarla mejor?"
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

        {/* Nuevo campo para el objetivo de aprendizaje */}
        <div>
          <label htmlFor="learningObjective" className="block mb-2 text-sm font-medium">
            {getObjectiveLabel()}
          </label>
          <textarea
            id="learningObjective"
            name="learningObjective"
            value={userInfo.learningObjective}
            onChange={handleChange}
            rows={3}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Este campo es opcional"
          ></textarea>
        </div>

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
                {skill.axis}
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
      <h2 className="text-2xl font-bold mb-2 text-center">{skill.axis}</h2>

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
        <p className="text-lg mb-6">{question.prompt}</p>

        {question.type === "likert" ? (
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-gray-400 px-2">
              <span>Muy en desacuerdo</span>
              <span>Muy de acuerdo</span>
            </div>
            <div className="flex justify-between gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  onClick={() => handleLikertChange(value)}
                  className={`flex-1 py-3 rounded-md transition-all ${
                    currentAnswer === value ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <textarea
            value={currentAnswer as string}
            onChange={handleOpenChange}
            rows={6}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Escribe tu respuesta aquí..."
          ></textarea>
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
}: {
  result: SkillResult
  hasMoreSkills: boolean
  onNextSkill: () => void
  onStartMentorSession: () => void
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
          <div className="space-y-4">
            {result.indicatorScores.slice(0, 6).map((indicator, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{indicator.name}</span>
                  <span>{indicator.score}/100</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${indicator.score}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
                      <p className="mb-1">
                        <span className="font-medium text-green-400">💪 Fortaleza: </span>
                        {highestScore.name} ({highestScore.score}/100)
                      </p>
                      <p>
                        <span className="font-medium text-yellow-400">🔍 Oportunidad: </span>
                        {lowestScore.name} ({lowestScore.score}/100)
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
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
