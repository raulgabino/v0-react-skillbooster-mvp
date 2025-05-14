"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"

interface IndicatorScore {
  id: string
  name: string
  score: number
}

interface UserInfo {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
  learningObjective?: string // Nuevo campo añadido
}

interface MentorSessionProps {
  skillId: string
  skillName: string
  globalScore: number
  indicatorScores: IndicatorScore[]
  openEndedAnswer?: string
  userProfile?: UserInfo
  onSessionComplete: (sessionData: MentorSessionData) => void
}

export interface MentorSessionData {
  microLesson: string
  actionPlan: string
  userInsight: string
  userCommitment: string
  mentorProjection: string
  conversationHistory: ConversationMessage[]
  exerciseScore?: number
  exerciseScoreJustification?: string
  sessionFeedback?: {
    rating: number
    comment?: string
  }
}

interface ConversationMessage {
  sender: "mentor" | "user"
  text: string
}

export default function MentorSessionInterface({
  skillId,
  skillName,
  globalScore,
  indicatorScores,
  openEndedAnswer,
  userProfile,
  onSessionComplete,
}: MentorSessionProps) {
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [currentUserInput, setCurrentUserInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentMentorPhase, setCurrentMentorPhase] = useState("start_session")
  const [sessionData, setSessionData] = useState<Partial<MentorSessionData>>({
    conversationHistory: [],
  })
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackRating, setFeedbackRating] = useState<number>(0)
  const [feedbackComment, setFeedbackComment] = useState("")
  const [exerciseScore, setExerciseScore] = useState<number | undefined>(undefined)
  const [exerciseScoreJustification, setExerciseScoreJustification] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const conversationEndRef = useRef<HTMLDivElement>(null)

  // Función para hacer scroll al final de la conversación
  const scrollToBottom = () => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Efecto para hacer scroll cuando se actualiza la conversación
  useEffect(() => {
    scrollToBottom()
  }, [conversationHistory])

  // Iniciar la sesión al montar el componente
  useEffect(() => {
    startSession()
  }, [])

  // Función para iniciar la sesión
  const startSession = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/mentor_session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          skillId,
          skillName,
          globalScore,
          indicatorScores,
          openEndedAnswer,
          userProfile,
          conversationHistory: [],
          currentMentorPhase: "start_session",
        }),
      })

      if (!response.ok) {
        throw new Error(`Error al iniciar la sesión de mentoría: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // Guardar la micro-lección (primer mensaje del mentor)
      setSessionData((prev) => ({
        ...prev,
        microLesson: data.mentorMessage,
      }))

      // Actualizar la conversación
      setConversationHistory([
        {
          sender: "mentor",
          text: data.mentorMessage,
        },
      ])

      // Actualizar la fase
      setCurrentMentorPhase(data.nextMentorPhase)
    } catch (error) {
      console.error("Error al iniciar la sesión:", error)
      setError("Error al iniciar la sesión. Por favor, intenta de nuevo más tarde.")
      setConversationHistory([
        {
          sender: "mentor",
          text: "Lo siento, ha ocurrido un error al iniciar la sesión. Por favor, intenta de nuevo más tarde.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // Función para enviar un mensaje
  const sendMessage = async () => {
    if (!currentUserInput.trim() || isLoading) return

    setError(null)
    // Añadir el mensaje del usuario a la conversación
    const userMessage = { sender: "user" as const, text: currentUserInput.trim() }
    const updatedHistory = [...conversationHistory, userMessage]
    setConversationHistory(updatedHistory)

    // Guardar datos específicos según la fase
    if (currentMentorPhase === "phase3_feedback") {
      setSessionData((prev) => ({
        ...prev,
        userInsight: currentUserInput.trim(),
      }))
    } else if (currentMentorPhase === "phase5_synthesis") {
      setSessionData((prev) => ({
        ...prev,
        userCommitment: currentUserInput.trim(),
      }))
    }

    // Limpiar el input
    setCurrentUserInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/mentor_session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          skillId,
          skillName,
          globalScore,
          indicatorScores,
          openEndedAnswer,
          userProfile,
          conversationHistory: updatedHistory,
          userResponse: userMessage.text,
          currentMentorPhase,
        }),
      })

      if (!response.ok) {
        throw new Error(`Error en la sesión de mentoría: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // Extraer el score del ejercicio y su justificación si estamos en la fase 3
      if (currentMentorPhase === "phase3_feedback" && data.exerciseScore !== undefined) {
        setExerciseScore(data.exerciseScore)
        setExerciseScoreJustification(data.exerciseScoreJustification)

        // Actualizar sessionData con estos valores
        setSessionData((prev) => ({
          ...prev,
          exerciseScore: data.exerciseScore,
          exerciseScoreJustification: data.exerciseScoreJustification,
        }))
      }

      // Guardar datos específicos según la fase
      if (currentMentorPhase === "phase4_action_plan") {
        setSessionData((prev) => ({
          ...prev,
          actionPlan: data.mentorMessage,
        }))
      } else if (currentMentorPhase === "phase5_synthesis") {
        setSessionData((prev) => ({
          ...prev,
          mentorProjection: data.mentorMessage,
        }))
      }

      // Actualizar la conversación
      const mentorMessage = { sender: "mentor" as const, text: data.mentorMessage }
      setConversationHistory([...updatedHistory, mentorMessage])

      // Actualizar la fase
      setCurrentMentorPhase(data.nextMentorPhase)

      // Si la sesión ha terminado, mostrar el formulario de feedback
      if (data.nextMentorPhase === "session_completed") {
        setShowFeedback(true)
      }
    } catch (error) {
      console.error("Error en la sesión:", error)
      setError("Error en la sesión. Por favor, intenta de nuevo o finaliza manualmente.")
      setConversationHistory([
        ...updatedHistory,
        {
          sender: "mentor",
          text: "Lo siento, ha ocurrido un error. Por favor, intenta de nuevo más tarde.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // Función para finalizar manualmente la sesión
  const handleFinishSession = () => {
    setShowFeedback(true)
  }

  // Función para enviar el feedback
  const sendFeedback = async () => {
    if (feedbackRating === 0) return

    setIsLoading(true)
    setError(null)
    try {
      // Enviar el feedback a la API
      const response = await fetch("/api/mentor_feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          skillId,
          rating: feedbackRating,
          comment: feedbackComment,
        }),
      })

      if (!response.ok) {
        throw new Error(`Error al enviar el feedback: ${response.status} ${response.statusText}`)
      }

      // Actualizar sessionData con el feedback
      const updatedSessionData: MentorSessionData = {
        microLesson: sessionData.microLesson || "",
        actionPlan: sessionData.actionPlan || "",
        userInsight: sessionData.userInsight || "",
        userCommitment: sessionData.userCommitment || "",
        mentorProjection: sessionData.mentorProjection || "",
        conversationHistory: conversationHistory,
        exerciseScore: exerciseScore,
        exerciseScoreJustification: exerciseScoreJustification,
        sessionFeedback: {
          rating: feedbackRating,
          comment: feedbackComment,
        },
      }

      // Notificar al componente padre que la sesión ha terminado
      onSessionComplete(updatedSessionData)
    } catch (error) {
      console.error("Error al enviar el feedback:", error)
      setError("Error al enviar el feedback, pero tu sesión ha sido guardada.")

      // Aún así, completamos la sesión
      const updatedSessionData: MentorSessionData = {
        microLesson: sessionData.microLesson || "",
        actionPlan: sessionData.actionPlan || "",
        userInsight: sessionData.userInsight || "",
        userCommitment: sessionData.userCommitment || "",
        mentorProjection: sessionData.mentorProjection || "",
        conversationHistory: conversationHistory,
        exerciseScore: exerciseScore,
        exerciseScoreJustification: exerciseScoreJustification,
        sessionFeedback: {
          rating: feedbackRating,
          comment: feedbackComment,
        },
      }
      onSessionComplete(updatedSessionData)
    } finally {
      setIsLoading(false)
    }
  }

  // Manejar el envío con Enter (pero permitir nueva línea con Shift+Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Renderizar estrellas para el feedback
  const renderStars = () => {
    return (
      <div className="flex space-x-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setFeedbackRating(star)}
            className={`text-2xl ${
              star <= feedbackRating ? "text-yellow-400" : "text-gray-400"
            } hover:text-yellow-400 transition-colors`}
            aria-label={`${star} estrellas`}
          >
            ★
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[70vh] bg-gray-900 rounded-lg overflow-hidden">
      {/* Área de conversación */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversationHistory.map((message, index) => (
          <div key={index} className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.sender === "user" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-100"
              }`}
            >
              {message.sender === "mentor" ? (
                <ReactMarkdown className="whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
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
            <div className="bg-gray-800 text-gray-100 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-300"></div>
                <span className="text-sm text-gray-400">Mentor está escribiendo...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={conversationEndRef}></div>
      </div>

      {/* Área de error */}
      {error && (
        <div className="bg-red-600 text-white p-2 text-center">
          <p>{error}</p>
        </div>
      )}

      {/* Área de input o feedback */}
      <div className="p-4 bg-gray-800 border-t border-gray-700">
        {showFeedback ? (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">¿Cómo calificarías esta sesión de mentoría?</h3>
            <div className="flex justify-center">{renderStars()}</div>
            <textarea
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Comentarios adicionales (opcional)"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            ></textarea>
            <div className="flex justify-end">
              <button
                onClick={sendFeedback}
                disabled={feedbackRating === 0 || isLoading}
                className={`px-4 py-2 rounded-md ${
                  feedbackRating === 0 || isLoading
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isLoading ? "Enviando..." : "Enviar Feedback"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex space-x-2">
            <textarea
              value={currentUserInput}
              onChange={(e) => setCurrentUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu mensaje..."
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              disabled={isLoading}
            ></textarea>
            <div className="flex flex-col space-y-2">
              <button
                onClick={sendMessage}
                disabled={!currentUserInput.trim() || isLoading}
                className={`px-4 py-2 rounded-md ${
                  !currentUserInput.trim() || isLoading
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                Enviar
              </button>
              <button
                onClick={handleFinishSession}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md"
              >
                Finalizar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
