"use client"

import { ChevronRight } from "lucide-react"

interface Skill {
  id: string
  name: string
  globalScore?: number
  status: "evaluado" | "no_evaluado"
}

interface SkillNavigationTreeProps {
  skills: Skill[]
  onSelectSkill: (skillId: string) => void
  currentSkillId?: string
}

export default function SkillNavigationTree({ skills, onSelectSkill, currentSkillId }: SkillNavigationTreeProps) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold mb-3 text-gray-300">Navegación de Habilidades</h3>
      <div className="flex flex-wrap gap-2 md:gap-4 items-center justify-center">
        {skills.map((skill, index) => (
          <div key={skill.id} className="flex items-center">
            <button
              onClick={() => onSelectSkill(skill.id)}
              className={`
                flex flex-col items-center justify-center p-3 rounded-lg transition-all
                ${
                  skill.status === "evaluado"
                    ? "bg-gray-700 hover:bg-gray-600 border border-blue-500"
                    : "bg-gray-800 hover:bg-gray-700 border border-gray-600"
                }
                ${currentSkillId === skill.id ? "ring-2 ring-blue-500" : ""}
              `}
            >
              <span className="text-sm font-medium mb-1">{skill.name}</span>
              {skill.status === "evaluado" && skill.globalScore !== undefined && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    skill.globalScore >= 70
                      ? "bg-green-900/50 text-green-300"
                      : skill.globalScore >= 40
                        ? "bg-yellow-900/50 text-yellow-300"
                        : "bg-red-900/50 text-red-300"
                  }`}
                >
                  {skill.globalScore}/100
                </span>
              )}
              {skill.status === "no_evaluado" && <span className="text-xs text-gray-400">No evaluado</span>}
            </button>
            {index < skills.length - 1 && <ChevronRight className="mx-1 text-gray-500 hidden md:block" />}
          </div>
        ))}
      </div>
    </div>
  )
}
