"use client"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info, Lightbulb } from "lucide-react"

interface SkillObjectiveStepProps {
  skillName: string
  learningObjective: string
  setLearningObjective: (value: string) => void
  onSubmitObjective: () => void
  indicadoresInfo: Array<{ id: string; nombre: string; descripcion_indicador?: string }>
}

export default function SkillObjectiveStep({
  skillName,
  learningObjective,
  setLearningObjective,
  onSubmitObjective,
  indicadoresInfo,
}: SkillObjectiveStepProps) {
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
