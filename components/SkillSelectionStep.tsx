"use client"

import { useState, useEffect } from "react"

// Nuevo tipo para representar un paquete de habilidades
interface SkillPackage {
  id: string
  name: string
  description: string
  targetAudience: string
  skills: string[]
}

interface SkillSelectionStepProps {
  // `setSelectedSkills` sigue esperando un array de strings (IDs de habilidades),
  // por lo que el contrato con el componente padre no se rompe.
  setSelectedSkills: (skills: string[]) => void
  onContinue: () => void
}

export default function SkillSelectionStep({ setSelectedSkills, onContinue }: SkillSelectionStepProps) {
  // Estado para almacenar los paquetes cargados desde el nuevo JSON
  const [packages, setPackages] = useState<SkillPackage[]>([])
  // Estado para rastrear los IDs de los PAQUETES seleccionados por el usuario
  const [selectedPackages, setSelectedPackages] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // **CAMBIO CLAVE 1: Cargar los paquetes con manejo de errores mejorado**
  useEffect(() => {
    const fetchPackages = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // CORRECCIÓN: Usar la ruta correcta del archivo JSON
        const response = await fetch("/public/data/skill_packages.json")

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }

        const data: Record<string, SkillPackage> = await response.json()
        setPackages(Object.values(data))
        console.log("Paquetes cargados exitosamente:", Object.values(data))
      } catch (error) {
        console.error("Error al cargar los paquetes de habilidades:", error)
        setError("Error al cargar los paquetes. Por favor, recarga la página.")

        // Fallback: usar paquetes predefinidos
        const fallbackPackages: SkillPackage[] = [
          {
            id: "lider_equipo_emergente",
            name: "Paquete: Líder de Equipo Emergente",
            description:
              "Desarrolla las competencias fundamentales para liderar, motivar y guiar equipos hacia el éxito.",
            targetAudience:
              "Nuevos gerentes, líderes de equipo, supervisores y profesionales que aspiran a su primer rol de liderazgo.",
            skills: ["liderazgo_equipos", "comunicacion_estrategica", "feedback_coaching"],
          },
          {
            id: "gestor_proyectos_exitosos",
            name: "Paquete: Gestor de Proyectos Exitosos",
            description:
              "Adquiere las habilidades clave para planificar, ejecutar y entregar proyectos a tiempo y dentro del presupuesto.",
            targetAudience:
              "Gerentes de Proyecto, coordinadores, líderes de producto y miembros de equipos de proyecto.",
            skills: ["gestion_proyectos", "negociacion_conflictos", "pensamiento_sistemico"],
          },
          {
            id: "ia_productividad",
            name: "Paquete: Inteligencia Artificial para la Productividad",
            description:
              "Aprende a integrar herramientas de IA y automatización para optimizar procesos y mejorar la toma de decisiones.",
            targetAudience:
              "Gerentes, analistas, profesionales de operaciones y cualquier rol que busque una ventaja competitiva.",
            skills: ["ia_negocios", "optimizacion_procesos", "interpretacion_datos"],
          },
        ]
        setPackages(fallbackPackages)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPackages()
  }, [])

  const handlePackageToggle = (packageId: string) => {
    if (selectedPackages.includes(packageId)) {
      setSelectedPackages(selectedPackages.filter((id) => id !== packageId))
    } else {
      setSelectedPackages([...selectedPackages, packageId])
    }
  }

  // **CAMBIO CLAVE 2: Lógica para procesar la selección antes de continuar**
  const handleContinueClick = () => {
    // 1. Encontrar los paquetes completos que fueron seleccionados
    const fullSelectedPackages = packages.filter((p) => selectedPackages.includes(p.id))

    // 2. Extraer todas las listas de habilidades de esos paquetes
    const skillsFromPackages = fullSelectedPackages.map((p) => p.skills)

    // 3. Aplanar el array y eliminar duplicados para obtener la lista final de IDs de habilidades
    const uniqueSkills = [...new Set(skillsFromPackages.flat())]

    // 4. Actualizar el estado del componente padre con la lista consolidada de habilidades
    setSelectedSkills(uniqueSkills)

    // 5. Proceder al siguiente paso
    onContinue()
  }

  // Mostrar loading
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-blue-300 mb-4">Cargando paquetes de habilidades...</h2>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    )
  }

  // Mostrar error
  if (error) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-red-300 mb-4">Error al cargar</h2>
        <p className="text-gray-400 mb-6">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
        >
          Recargar página
        </button>
      </div>
    )
  }

  // **CAMBIO CLAVE 3: La UI ahora renderiza paquetes en lugar de habilidades**
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8 animate-fadeInDown">
        <h2 className="text-3xl font-bold text-blue-300 mb-4">Selecciona tu Ruta de Desarrollo</h2>
        <p className="text-gray-400">Elige uno de nuestros paquetes curados para comenzar tu evaluación.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8 animate-fadeInUp">
        {packages.map((pkg, index) => (
          <div
            key={pkg.id}
            className={`
              relative p-6 rounded-lg border-2 cursor-pointer
              flex flex-col justify-between
              ${
                selectedPackages.includes(pkg.id)
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-gray-600 bg-gray-800/50 hover:border-gray-500"
              }
            `}
            onClick={() => handlePackageToggle(pkg.id)}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="absolute top-4 right-4">
              <div
                className={`
                  w-6 h-6 rounded-full border-2 flex items-center justify-center
                  ${
                    selectedPackages.includes(pkg.id) ? "border-blue-500 bg-blue-500" : "border-gray-400 bg-transparent"
                  }
                `}
              >
                {selectedPackages.includes(pkg.id) && (
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

            <div className="pr-8">
              <h3 className="text-lg font-semibold text-white mb-2">{pkg.name}</h3>
              <p className="text-gray-400 text-sm mb-4">{pkg.description}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">DIRIGIDO A:</p>
              <p className="text-xs text-gray-400">{pkg.targetAudience}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center">
        <button
          onClick={handleContinueClick}
          disabled={selectedPackages.length === 0}
          className={`
            px-8 py-3 rounded-full font-semibold
            shadow-lg hover:shadow-xl transform hover:scale-105
            ${
              selectedPackages.length > 0
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-600 text-gray-400 cursor-not-allowed"
            }
          `}
        >
          {selectedPackages.length > 0 ? "Comenzar Evaluación" : "Selecciona un paquete"}
        </button>
      </div>
    </div>
  )
}
