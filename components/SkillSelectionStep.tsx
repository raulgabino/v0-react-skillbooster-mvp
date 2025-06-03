"use client"

import { animations } from "@/lib/animation-config"

interface Skill {
  id: string
  name: string
  questions: any[]
  indicadoresInfo: any[]
  openQuestionId: string
}

interface SkillSelectionStepProps {
  skills: Skill[]
  selectedSkills: string[]
  setSelectedSkills: (skills: string[]) => void
  onContinue: () => void
}

export default function SkillSelectionStep({
  skills,
  selectedSkills,
  setSelectedSkills,
  onContinue,
}: SkillSelectionStepProps) {
  const handleSkillToggle = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      setSelectedSkills(selectedSkills.filter((id) => id !== skillId))
    } else {
      setSelectedSkills([...selectedSkills, skillId])
    }
  }

  const getSkillDescription = (skillName: string) => {
    const descriptions: Record<string, string> = {
      "Comunicación Estratégica": "Habilidad para comunicar ideas de forma clara, adaptada y persuasiva",
      "Pensamiento Sistémico (Consumo, Costos, Medioambiente)":
        "Capacidad para analizar interconexiones entre factores económicos, sociales y ambientales",
      "Interpretación de Datos Ambientales (Sensores/Recibos)":
        "Habilidad para analizar y extraer insights de datos ambientales y de consumo",
      "Aprendizaje Adaptativo (Personalización Contextual)":
        "Capacidad para diseñar experiencias de aprendizaje que se adapten al contexto del usuario",
    }
    return descriptions[skillName] || "Habilidad importante para el desarrollo profesional"
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8 animate-fadeInDown">
        <h2 className="text-3xl font-bold text-blue-300 mb-4">Selecciona las habilidades a evaluar</h2>
        <p className="text-gray-400">Elige una o más habilidades que te gustaría evaluar y mejorar</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8 animate-fadeInUp">
        {skills.map((skill, index) => (
          <div
            key={skill.id}
            className={`
              relative p-6 rounded-lg border-2 cursor-pointer
              ${animations.transitions.default}
              ${
                selectedSkills.includes(skill.id)
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-gray-600 bg-gray-800/50 hover:border-gray-500"
              }
            `}
            onClick={() => handleSkillToggle(skill.id)}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            {/* Checkbox */}
            <div className="absolute top-4 right-4">
              <div
                className={`
                  w-6 h-6 rounded border-2 flex items-center justify-center
                  ${animations.transitions.default}
                  ${
                    selectedSkills.includes(skill.id) ? "border-blue-500 bg-blue-500" : "border-gray-400 bg-transparent"
                  }
                `}
              >
                {selectedSkills.includes(skill.id) && (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            </div>

            {/* Skill content */}
            <div className="pr-8">
              <h3 className="text-lg font-semibold text-white mb-3">{skill.name}</h3>
              <p className="text-gray-400 text-sm mb-4">{getSkillDescription(skill.name)}</p>

              <div className="flex items-center text-xs text-gray-500">
                <span>📝 {skill.questions.length} preguntas</span>
                <span className="mx-2">•</span>
                <span>⏱️ ~5-8 min</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selection summary */}
      {selectedSkills.length > 0 && (
        <div className="bg-gray-800/50 p-4 rounded-lg mb-6 animate-fadeInUp">
          <p className="text-center text-gray-300">
            Has seleccionado <span className="font-semibold text-blue-400">{selectedSkills.length}</span> habilidad
            {selectedSkills.length > 1 ? "es" : ""} para evaluar
          </p>
          <p className="text-center text-sm text-gray-500 mt-1">
            Tiempo estimado total: {selectedSkills.length * 7} minutos
          </p>
        </div>
      )}

      {/* Continue button */}
      <div className="text-center">
        <button
          onClick={onContinue}
          disabled={selectedSkills.length === 0}
          className={`
            px-8 py-3 rounded-full font-semibold
            shadow-lg hover:shadow-xl transform hover:scale-105
            ${animations.transitions.default}
            ${
              selectedSkills.length > 0
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-600 text-gray-400 cursor-not-allowed"
            }
          `}
        >
          {selectedSkills.length > 0 ? "Comenzar Evaluación" : "Selecciona al menos una habilidad"}
        </button>
      </div>

      {/* Progress indicator */}
      <div className="mt-8 flex justify-center">
        <div className="flex space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
          <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
        </div>
      </div>
    </div>
  )
}
