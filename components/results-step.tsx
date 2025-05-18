import SkillResultsDashboard from "./skill-results-dashboard"
import SkillNavigationTree from "./skill-navigation-tree"

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

interface ResultsStepProps {
  result: SkillResult
  hasMoreSkills: boolean
  onNextSkill: () => void
  onStartMentorSession: () => void
  allSkills?: Array<{
    id: string
    name: string
    globalScore?: number
    status: "evaluado" | "no_evaluado"
  }>
  onSelectSkill?: (skillId: string) => void
}

export default function ResultsStep({
  result,
  hasMoreSkills,
  onNextSkill,
  onStartMentorSession,
  allSkills,
  onSelectSkill,
}: ResultsStepProps) {
  // Si tenemos múltiples habilidades y la función para seleccionarlas, mostramos el navegador
  const showSkillNavigator = allSkills && allSkills.length > 1 && onSelectSkill

  return (
    <div className="max-w-5xl mx-auto">
      {showSkillNavigator && (
        <SkillNavigationTree skills={allSkills!} onSelectSkill={onSelectSkill!} currentSkillId={result.skillId} />
      )}

      <SkillResultsDashboard
        skillName={result.skillName}
        globalScore={result.globalScore}
        indicatorScores={result.indicatorScores}
        tips={result.tips}
        onStartMentorSession={onStartMentorSession}
        onShowNextStep={onNextSkill}
      />
    </div>
  )
}
