"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

interface SkillPackage {
  id: string
  name: string
  description: string
  skills: string[]
  duration: string
  level: string
}

interface SkillSelectionStepProps {
  setSelectedSkills: (skills: string[]) => void
  onContinue: () => void
}

// Datos integrados directamente en el componente
const SKILL_PACKAGES: SkillPackage[] = [
  {
    id: "leadership_essentials",
    name: "Fundamentos de Liderazgo",
    description: "Habilidades esenciales para liderar equipos efectivamente",
    skills: ["liderazgo_equipos", "comunicacion_estrategica", "feedback_coaching"],
    duration: "15-20 min",
    level: "Esencial",
  },
  {
    id: "advanced_leadership",
    name: "Liderazgo Avanzado",
    description: "Competencias avanzadas para líderes experimentados",
    skills: ["liderazgo_equipos", "gestion_cambio", "toma_decisiones"],
    duration: "20-25 min",
    level: "Avanzado",
  },
  {
    id: "communication_master",
    name: "Maestría en Comunicación",
    description: "Domina todas las facetas de la comunicación profesional",
    skills: ["comunicacion_estrategica", "feedback_coaching"],
    duration: "10-15 min",
    level: "Intermedio",
  },
  {
    id: "change_management",
    name: "Gestión del Cambio",
    description: "Lidera transformaciones organizacionales exitosas",
    skills: ["gestion_cambio", "comunicacion_estrategica", "liderazgo_equipos"],
    duration: "20-25 min",
    level: "Avanzado",
  },
  {
    id: "decision_making",
    name: "Toma de Decisiones Estratégicas",
    description: "Mejora tu capacidad de tomar decisiones efectivas",
    skills: ["toma_decisiones", "comunicacion_estrategica"],
    duration: "10-15 min",
    level: "Intermedio",
  },
]

const INDIVIDUAL_SKILLS = [
  { id: "liderazgo_equipos", name: "Liderazgo de Equipos" },
  { id: "comunicacion_estrategica", name: "Comunicación Estratégica" },
  { id: "feedback_coaching", name: "Feedback Efectivo y Coaching" },
  { id: "gestion_cambio", name: "Gestión del Cambio" },
  { id: "toma_decisiones", name: "Toma de Decisiones" },
]

const SkillSelectionStep: React.FC<SkillSelectionStepProps> = ({ setSelectedSkills, onContinue }) => {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
  const [customSkills, setCustomSkills] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState<"package" | "custom">("package")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePackageSelect = (packageId: string) => {
    const selectedPkg = SKILL_PACKAGES.find((pkg) => pkg.id === packageId)
    if (selectedPkg) {
      setSelectedPackage(packageId)
      setSelectedSkills(selectedPkg.skills)
    }
  }

  const handleCustomSkillToggle = (skillId: string) => {
    setCustomSkills((prev) => {
      const newSkills = prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
      setSelectedSkills(newSkills)
      return newSkills
    })
  }

  const handleContinue = () => {
    if (selectionMode === "package" && selectedPackage) {
      onContinue()
    } else if (selectionMode === "custom" && customSkills.length > 0) {
      onContinue()
    }
  }

  const canContinue =
    (selectionMode === "package" && selectedPackage) || (selectionMode === "custom" && customSkills.length > 0)

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-center text-white mb-8">Selecciona tus Habilidades</h2>

      {error && (
        <div className="bg-red-600/20 border border-red-600 rounded-lg p-4 mb-6">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Selector de Modo */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-2 flex">
          <button
            onClick={() => setSelectionMode("package")}
            className={`px-6 py-2 rounded-md transition-colors ${
              selectionMode === "package"
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            Paquetes Predefinidos
          </button>
          <button
            onClick={() => setSelectionMode("custom")}
            className={`px-6 py-2 rounded-md transition-colors ${
              selectionMode === "custom" ? "bg-blue-600 text-white" : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            Selección Personalizada
          </button>
        </div>
      </div>

      {selectionMode === "package" ? (
        <div className="space-y-4 mb-8">
          <p className="text-center text-gray-300 mb-6">
            Elige un paquete de habilidades diseñado para tu nivel y objetivos
          </p>
          {SKILL_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              onClick={() => handlePackageSelect(pkg.id)}
              className={`bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 cursor-pointer transition-all border-2 ${
                selectedPackage === pkg.id
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-gray-700 hover:border-gray-600 hover:bg-gray-700/30"
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-semibold text-white">{pkg.name}</h3>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-blue-600/20 text-blue-300 rounded text-sm">{pkg.level}</span>
                  <span className="px-2 py-1 bg-gray-600/20 text-gray-300 rounded text-sm">{pkg.duration}</span>
                </div>
              </div>
              <p className="text-gray-300 mb-4">{pkg.description}</p>
              <div className="flex flex-wrap gap-2">
                {pkg.skills.map((skillId) => {
                  const skill = INDIVIDUAL_SKILLS.find((s) => s.id === skillId)
                  return (
                    <span key={skillId} className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full text-sm">
                      {skill?.name || skillId}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          <p className="text-center text-gray-300 mb-6">Selecciona las habilidades específicas que quieres evaluar</p>
          <div className="grid md:grid-cols-2 gap-4">
            {INDIVIDUAL_SKILLS.map((skill) => (
              <div
                key={skill.id}
                onClick={() => handleCustomSkillToggle(skill.id)}
                className={`bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 cursor-pointer transition-all border-2 ${
                  customSkills.includes(skill.id)
                    ? "border-blue-500 bg-blue-900/20"
                    : "border-gray-700 hover:border-gray-600 hover:bg-gray-700/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-white">{skill.name}</h3>
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      customSkills.includes(skill.id) ? "border-blue-500 bg-blue-500" : "border-gray-400"
                    }`}
                  >
                    {customSkills.includes(skill.id) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button
          onClick={handleContinue}
          disabled={!canContinue || isLoading}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-md transition-colors"
        >
          {isLoading ? "Cargando..." : "Continuar con Evaluación"}
        </Button>
      </div>

      {selectionMode === "package" && selectedPackage && (
        <div className="mt-6 text-center">
          <p className="text-gray-400">
            Has seleccionado:{" "}
            <span className="text-blue-300 font-medium">
              {SKILL_PACKAGES.find((pkg) => pkg.id === selectedPackage)?.name}
            </span>
          </p>
        </div>
      )}

      {selectionMode === "custom" && customSkills.length > 0 && (
        <div className="mt-6 text-center">
          <p className="text-gray-400">
            Has seleccionado {customSkills.length} habilidad{customSkills.length !== 1 ? "es" : ""}
          </p>
        </div>
      )}
    </div>
  )
}

export default SkillSelectionStep
