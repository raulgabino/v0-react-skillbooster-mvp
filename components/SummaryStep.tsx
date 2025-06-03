"use client"

import type React from "react"

import { animations } from "@/lib/animation-config"

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

interface SummaryStepProps {
  results: Record<string, SkillResult>
  onRestart: () => void
  onDownloadPDF: () => void
  pdfGenerating: boolean
  setCurrentStep: (step: number) => void
}

export default function SummaryStep({
  results,
  onRestart,
  onDownloadPDF,
  pdfGenerating,
  setCurrentStep,
}: SummaryStepProps) {
  const skillResults = Object.values(results)
  const averageScore =
    skillResults.length > 0
      ? Math.round(skillResults.reduce((sum, result) => sum + result.globalScore, 0) / skillResults.length)
      : 0

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-400"
    if (score >= 40) return "text-yellow-400"
    return "text-red-400"
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 70) return "bg-green-500"
    if (score >= 40) return "bg-yellow-500"
    return "bg-red-500"
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8 animate-fadeInDown">
        <h2 className="text-4xl font-bold text-blue-300 mb-4">🎉 ¡Evaluación Completada!</h2>
        <p className="text-gray-400 text-lg">Aquí tienes un resumen completo de tus resultados y recomendaciones</p>
      </div>

      {/* Overall Score */}
      <div className="bg-gray-800/50 p-8 rounded-lg mb-8 text-center animate-fadeInUp">
        <h3 className="text-2xl font-semibold mb-4">Puntuación General</h3>
        <div className="relative w-32 h-32 mx-auto mb-4">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#374151" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#2563EB"
              strokeWidth="8"
              strokeDasharray={`${(averageScore / 100) * 283} 283`}
              strokeDashoffset="0"
              transform="rotate(-90 50 50)"
              className="animate-circleProgress"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold">{averageScore}</span>
            <span className="text-sm text-gray-400">de 100</span>
          </div>
        </div>
        <p className="text-gray-300">
          Promedio de {skillResults.length} habilidad{skillResults.length > 1 ? "es" : ""} evaluada
          {skillResults.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* PDF Content */}
      <div id="summary-content-to-pdf">
        {/* Skills Summary */}
        <div className="grid gap-6 mb-8 animate-fadeInUp" style={{ animationDelay: "0.2s" }}>
          {skillResults.map((result, index) => (
            <div
              key={result.skillId}
              className="bg-gray-800/50 p-6 rounded-lg animate-fadeInLeft"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold text-white">{result.skillName}</h3>
                <span className={`text-2xl font-bold ${getScoreColor(result.globalScore)}`}>
                  {result.globalScore}/100
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
                <div
                  className={`h-3 rounded-full ${getScoreBgColor(result.globalScore)} animate-progressFill`}
                  style={{ "--progress-value": `${result.globalScore}%` } as React.CSSProperties}
                ></div>
              </div>

              {/* Top indicators */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Indicadores Principales:</h4>
                <div className="grid md:grid-cols-2 gap-2">
                  {result.indicatorScores.slice(0, 4).map((indicator) => (
                    <div key={indicator.id} className="flex justify-between text-sm">
                      <span className="text-gray-400">{indicator.name}</span>
                      <span className={getScoreColor(indicator.score)}>{indicator.score}/100</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Recomendaciones:</h4>
                <ul className="space-y-1">
                  {result.tips.slice(0, 3).map((tip, tipIndex) => (
                    <li key={tipIndex} className="text-sm text-gray-400 flex items-start">
                      <span className="text-blue-400 mr-2">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Mentor session indicator */}
              {result.mentorSessionData && (
                <div className="mt-4 p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <p className="text-sm text-blue-300 flex items-center">
                    <span className="mr-2">🤖</span>
                    Sesión de mentoría completada
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Next Steps */}
        <div className="bg-gray-800/50 p-6 rounded-lg mb-8 animate-fadeInUp" style={{ animationDelay: "0.4s" }}>
          <h3 className="text-xl font-semibold text-blue-300 mb-4">🚀 Próximos Pasos Recomendados</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <span className="text-green-400 text-lg">1.</span>
                <div>
                  <h4 className="font-medium text-white">Enfócate en tus fortalezas</h4>
                  <p className="text-sm text-gray-400">
                    Aprovecha las áreas donde obtuviste mejores puntuaciones para liderar proyectos
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-yellow-400 text-lg">2.</span>
                <div>
                  <h4 className="font-medium text-white">Desarrolla áreas de oportunidad</h4>
                  <p className="text-sm text-gray-400">
                    Crea un plan de mejora para las habilidades con menor puntuación
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <span className="text-blue-400 text-lg">3.</span>
                <div>
                  <h4 className="font-medium text-white">Practica regularmente</h4>
                  <p className="text-sm text-gray-400">
                    Aplica las recomendaciones en tu trabajo diario y proyectos actuales
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-purple-400 text-lg">4.</span>
                <div>
                  <h4 className="font-medium text-white">Reevalúa periódicamente</h4>
                  <p className="text-sm text-gray-400">
                    Vuelve a evaluar tus habilidades en 3-6 meses para medir tu progreso
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        className="flex flex-col sm:flex-row justify-center gap-4 mb-8 animate-fadeInUp"
        style={{ animationDelay: "0.6s" }}
      >
        <button
          onClick={onDownloadPDF}
          disabled={pdfGenerating}
          className={`
            px-6 py-3 bg-green-600 hover:bg-green-700 
            rounded-full text-white font-semibold
            shadow-lg hover:shadow-xl transform hover:scale-105
            ${animations.transitions.default}
            ${pdfGenerating ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          {pdfGenerating ? (
            <span className="flex items-center">
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
            </span>
          ) : (
            "📄 Descargar Reporte PDF"
          )}
        </button>

        <button
          onClick={() => setCurrentStep(4)}
          className={`
            px-6 py-3 bg-blue-600 hover:bg-blue-700 
            rounded-full text-white font-semibold
            shadow-lg hover:shadow-xl transform hover:scale-105
            ${animations.transitions.default}
          `}
        >
          📊 Ver Resultados Detallados
        </button>

        <button
          onClick={onRestart}
          className={`
            px-6 py-3 bg-gray-600 hover:bg-gray-700 
            rounded-full text-white font-semibold
            shadow-lg hover:shadow-xl transform hover:scale-105
            ${animations.transitions.default}
          `}
        >
          🔄 Nueva Evaluación
        </button>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-500 text-sm animate-fadeInUp" style={{ animationDelay: "0.8s" }}>
        <p>¡Gracias por usar SkillBoosterX! 🚀</p>
        <p className="mt-1">Continúa desarrollando tus habilidades y alcanza tus objetivos profesionales.</p>
      </div>
    </div>
  )
}
