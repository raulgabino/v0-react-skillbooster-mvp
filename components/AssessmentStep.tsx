"use client"

import type React from "react"

import { animations } from "@/lib/animation-config"

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
  indicadoresInfo: any[]
  openQuestionId: string
}

interface AssessmentStepProps {
  skill: Skill
  questionIndex: number
  currentAnswer: string | number
  setCurrentAnswer: (answer: string | number) => void
  onNext: () => void
}

export default function AssessmentStep({
  skill,
  questionIndex,
  currentAnswer,
  setCurrentAnswer,
  onNext,
}: AssessmentStepProps) {
  const currentQuestion = skill.questions[questionIndex]
  const progress = ((questionIndex + 1) / skill.questions.length) * 100

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onNext()
  }

  const isAnswerValid = () => {
    if (currentQuestion.type === "likert") {
      return typeof currentAnswer === "number" && currentAnswer >= 1 && currentAnswer <= 5
    } else {
      return typeof currentAnswer === "string" && currentAnswer.trim().length > 0
    }
  }

  const renderLikertScale = () => {
    const labels = [
      "Nunca / Muy en desacuerdo",
      "Raramente / En desacuerdo",
      "A veces / Neutral",
      "Frecuentemente / De acuerdo",
      "Siempre / Muy de acuerdo",
    ]

    return (
      <div className="space-y-4">
        <p className="text-center text-gray-400 text-sm mb-6">
          Selecciona la opción que mejor describa tu situación actual
        </p>

        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className={`
                flex items-center p-4 rounded-lg border-2 cursor-pointer
                ${animations.transitions.default}
                ${
                  currentAnswer === value
                    ? "border-blue-500 bg-blue-900/20"
                    : "border-gray-600 bg-gray-800/50 hover:border-gray-500"
                }
              `}
            >
              <input
                type="radio"
                name="likert"
                value={value}
                checked={currentAnswer === value}
                onChange={(e) => setCurrentAnswer(Number(e.target.value))}
                className="sr-only"
              />
              <div
                className={`
                  w-5 h-5 rounded-full border-2 mr-4 flex items-center justify-center
                  ${animations.transitions.default}
                  ${currentAnswer === value ? "border-blue-500 bg-blue-500" : "border-gray-400"}
                `}
              >
                {currentAnswer === value && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{value}</span>
                  <span className="text-sm text-gray-400">{labels[value - 1]}</span>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    )
  }

  const renderOpenQuestion = () => {
    return (
      <div className="space-y-4">
        <textarea
          value={currentAnswer as string}
          onChange={(e) => setCurrentAnswer(e.target.value)}
          rows={6}
          className={`
            w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg 
            focus:outline-none focus:ring-2 focus:ring-blue-500 text-white resize-none
            ${animations.transitions.default}
          `}
          placeholder="Escribe tu respuesta aquí... Sé específico y detallado en tu explicación."
        />
        <p className="text-xs text-gray-500">
          💡 Tip: Proporciona ejemplos concretos y detalles específicos para obtener un feedback más personalizado.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress bar */}
      <div className="mb-8 animate-fadeInDown">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-400">
            Pregunta {questionIndex + 1} de {skill.questions.length}
          </span>
          <span className="text-sm text-gray-400">{Math.round(progress)}% completado</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className={`bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      {/* Question */}
      <div className="bg-gray-800/50 p-8 rounded-lg mb-8 animate-fadeInUp">
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">{skill.name}</span>
            <span className="ml-3 text-sm text-gray-400">
              {currentQuestion.type === "likert" ? "Escala de valoración" : "Pregunta abierta"}
            </span>
          </div>

          <h2 className="text-xl font-semibold text-white leading-relaxed">{currentQuestion.prompt}</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {currentQuestion.type === "likert" ? renderLikertScale() : renderOpenQuestion()}

          {/* Navigation */}
          <div className="flex justify-between items-center pt-6">
            <div className="text-sm text-gray-500">
              {questionIndex === skill.questions.length - 1 ? (
                <span>🎯 Última pregunta - ¡Ya casi terminas!</span>
              ) : (
                <span>
                  Pregunta {questionIndex + 1} de {skill.questions.length}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={!isAnswerValid()}
              className={`
                px-6 py-3 rounded-full font-semibold
                shadow-lg hover:shadow-xl transform hover:scale-105
                ${animations.transitions.default}
                ${
                  isAnswerValid()
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }
              `}
            >
              {questionIndex === skill.questions.length - 1 ? "Finalizar Evaluación" : "Siguiente Pregunta"}
            </button>
          </div>
        </form>
      </div>

      {/* Question type indicator */}
      <div className="text-center text-xs text-gray-500 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        {currentQuestion.type === "likert" ? (
          <span>📊 Evalúa tu nivel actual en esta área</span>
        ) : (
          <span>✍️ Describe tu experiencia y enfoque en una situación práctica</span>
        )}
      </div>
    </div>
  )
}
