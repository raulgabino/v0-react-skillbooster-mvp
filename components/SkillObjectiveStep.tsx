"use client"

import type React from "react"

import { animations } from "@/lib/animation-config"

interface IndicadorInfo {
  id: string
  nombre: string
  descripcion_indicador?: string
}

interface SkillObjectiveStepProps {
  skillName: string
  learningObjective: string
  setLearningObjective: (objective: string) => void
  onSubmitObjective: () => void
  indicadoresInfo: IndicadorInfo[]
}

export default function SkillObjectiveStep({
  skillName,
  learningObjective,
  setLearningObjective,
  onSubmitObjective,
  indicadoresInfo,
}: SkillObjectiveStepProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmitObjective()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8 animate-fadeInDown">
        <h2 className="text-3xl font-bold text-blue-300 mb-4">Definamos tu objetivo para: {skillName}</h2>
        <p className="text-gray-400">
          Antes de comenzar la evaluación, cuéntanos qué esperas lograr con esta habilidad
        </p>
      </div>

      {/* Skill overview */}
      <div className="bg-gray-800/50 p-6 rounded-lg mb-8 animate-fadeInUp">
        <h3 className="text-lg font-semibold text-white mb-4">¿Qué evaluaremos en {skillName}?</h3>
        <div className="grid gap-3">
          {indicadoresInfo.slice(0, 6).map((indicador, index) => (
            <div
              key={indicador.id}
              className="flex items-start space-x-3 animate-fadeInLeft"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <span className="text-white font-medium">{indicador.nombre}</span>
                {indicador.descripcion_indicador && (
                  <p className="text-gray-400 text-sm mt-1">{indicador.descripcion_indicador}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Objective form */}
      <form onSubmit={handleSubmit} className="space-y-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <div>
          <label htmlFor="objective" className="block text-sm font-medium text-gray-300 mb-3">
            ¿Qué objetivo específico tienes para mejorar tu {skillName}?
          </label>
          <textarea
            id="objective"
            value={learningObjective}
            onChange={(e) => setLearningObjective(e.target.value)}
            rows={4}
            className={`
              w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg 
              focus:outline-none focus:ring-2 focus:ring-blue-500 text-white resize-none
              ${animations.transitions.default}
            `}
            placeholder={`Ejemplo: "Quiero mejorar mi ${skillName.toLowerCase()} para liderar mejor mi equipo en el proyecto de sostenibilidad que estamos desarrollando..."`}
          />
          <p className="text-xs text-gray-500 mt-2">
            💡 Tip: Sé específico sobre tu contexto y lo que esperas lograr. Esto nos ayudará a personalizar tu
            experiencia.
          </p>
        </div>

        {/* Suggested objectives */}
        <div className="bg-gray-800/30 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Ejemplos de objetivos comunes:</h4>
          <div className="space-y-2">
            {[
              `Aplicar ${skillName.toLowerCase()} en mi rol actual para obtener mejores resultados`,
              `Desarrollar ${skillName.toLowerCase()} para liderar proyectos más complejos`,
              `Mejorar ${skillName.toLowerCase()} para comunicarme mejor con mi equipo`,
              `Fortalecer ${skillName.toLowerCase()} para tomar decisiones más informadas`,
            ].map((example, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setLearningObjective(example)}
                className={`
                  text-left w-full p-2 text-sm text-gray-400 hover:text-white 
                  hover:bg-gray-700/50 rounded transition-colors
                  ${animations.transitions.fast}
                `}
              >
                "_{example}_"
              </button>
            ))}
          </div>
        </div>

        {/* Submit button */}
        <div className="text-center pt-4">
          <button
            type="submit"
            className={`
              px-8 py-3 bg-blue-600 hover:bg-blue-700 
              rounded-full text-white font-semibold
              shadow-lg hover:shadow-xl transform hover:scale-105
              ${animations.transitions.default}
            `}
          >
            {learningObjective.trim() ? "Comenzar Evaluación" : "Continuar sin objetivo específico"}
          </button>

          {!learningObjective.trim() && (
            <p className="text-xs text-gray-500 mt-2">Puedes continuar sin definir un objetivo específico</p>
          )}
        </div>
      </form>
    </div>
  )
}
