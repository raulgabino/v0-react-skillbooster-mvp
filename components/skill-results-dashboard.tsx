"use client"

import { useState } from "react"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts"
import { Info } from "lucide-react"

interface IndicatorScore {
  id: string
  name: string
  score: number
  descripcion_indicador?: string
  feedback_especifico?: string
}

interface SkillResultsDashboardProps {
  skillName: string
  globalScore: number
  indicatorScores: IndicatorScore[]
  tips: string[]
  onStartMentorSession: () => void
  onShowNextStep: () => void
}

export default function SkillResultsDashboard({
  skillName,
  globalScore,
  indicatorScores,
  tips,
  onStartMentorSession,
  onShowNextStep,
}: SkillResultsDashboardProps) {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | null>(null)

  // Preparar datos para el gráfico de radar
  const radarData = indicatorScores.map((indicator) => ({
    subject: indicator.name,
    score: indicator.score,
    fullMark: 100,
    id: indicator.id,
  }))

  // Función para determinar el color basado en la puntuación
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

  // Componente personalizado para el tooltip del gráfico radar
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-700">
          <p className="font-medium text-blue-300">{data.subject}</p>
          <p className={`font-bold ${getScoreColor(data.score)}`}>{data.score}/100</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center text-blue-300">
        Resultados Detallados: {skillName}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Columna 1: Puntuación Global y Gráfico Radar */}
        <div className="lg:col-span-2 space-y-6">
          {/* Puntuación Global */}
          <div className="bg-gray-800 rounded-lg p-6 flex flex-col items-center">
            <h3 className="text-xl font-semibold mb-4 text-center">Puntuación Global para {skillName}</h3>
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
                  strokeDasharray={`${(globalScore / 100) * 283} 283`}
                  strokeDashoffset="0"
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-5xl font-bold">{globalScore}</span>
                <span className="text-sm text-gray-400">de 100</span>
              </div>
            </div>
          </div>

          {/* Gráfico Radar */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Perfil de Indicadores</h3>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                  <PolarGrid stroke="#4B5563" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: "#D1D5DB", fontSize: 12 }}
                    tickFormatter={(value) => {
                      // Truncar nombres largos para mejor visualización
                      return value.length > 15 ? `${value.substring(0, 15)}...` : value
                    }}
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#9CA3AF" }} stroke="#4B5563" />
                  <Radar
                    name="Puntuación"
                    dataKey="score"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.6}
                    onMouseOver={(data, index) => setActiveTooltipIndex(index)}
                    onMouseLeave={() => setActiveTooltipIndex(null)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Columna 2: Indicadores Detallados y Recomendaciones */}
        <div className="space-y-6">
          {/* Indicadores Detallados */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Indicadores Detallados</h3>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              {indicatorScores.map((indicator, index) => (
                <div key={indicator.id} className="py-2.5 border-b border-gray-700/50 last:border-b-0">
                  <div className="flex justify-between text-sm mb-1 items-center">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-100">{indicator.name}</span>
                      {indicator.descripcion_indicador && (
                        <div className="group relative ml-1.5">
                          <button
                            aria-label={`Más información sobre ${indicator.name}`}
                            className="p-0.5 rounded-full hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <Info className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64">
                            <div className="bg-gray-900 border-gray-700 text-white p-3 rounded-md shadow-lg text-xs">
                              <p className="font-semibold mb-1">{indicator.name}</p>
                              <p>{indicator.descripcion_indicador}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <span
                      className={`px-2 py-1 rounded-md ${getScoreColor(indicator.score)} bg-opacity-20 ${
                        indicator.score >= 70 ? "bg-green-900" : indicator.score >= 40 ? "bg-yellow-900" : "bg-red-900"
                      }`}
                    >
                      {indicator.score}/100
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2.5 mb-1.5">
                    <div
                      className={`h-2.5 rounded-full ${getScoreBgColor(indicator.score)}`}
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
          </div>

          {/* Recomendaciones y Plan de Acción */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4 text-blue-300">Recomendaciones y Plan de Acción</h3>
            <ul className="space-y-3 mb-6">
              {tips.map((tip, index) => {
                // Determinar el tipo de tip para aplicar estilos específicos
                const isTipFortaleza = tip.toLowerCase().includes("fortaleza") || index === 0
                const isTipOportunidad = tip.toLowerCase().includes("oportunidad") || index === 1
                const isTipConsejo = tip.toLowerCase().includes("consejo") || index === 2

                return (
                  <li
                    key={index}
                    className={`p-3 rounded-md ${
                      isTipFortaleza
                        ? "bg-green-900/20 border-l-4 border-green-500"
                        : isTipOportunidad
                          ? "bg-yellow-900/20 border-l-4 border-yellow-500"
                          : "bg-blue-900/20 border-l-4 border-blue-500"
                    }`}
                  >
                    <span
                      className={`font-medium ${
                        isTipFortaleza ? "text-green-400" : isTipOportunidad ? "text-yellow-400" : "text-blue-400"
                      }`}
                    >
                      {isTipFortaleza ? "💪 Fortaleza: " : isTipOportunidad ? "🔍 Oportunidad: " : "💡 Consejo: "}
                    </span>
                    {tip.replace(/^(Fortaleza|Oportunidad|Consejo):\s*/i, "")}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6">
        <button
          onClick={onStartMentorSession}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-medium transition-all flex items-center justify-center"
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
        <button
          onClick={onShowNextStep}
          className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full text-white font-medium transition-all"
        >
          Continuar
        </button>
      </div>
    </div>
  )
}
