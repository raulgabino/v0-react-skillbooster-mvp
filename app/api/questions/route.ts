import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

// Tipos para la respuesta API estructurada
interface IndicadorInfo {
  id: string
  nombre: string
  descripcion_indicador?: string
}

interface Question {
  id: string
  axis: string
  type: "likert" | "open"
  indicator: string
  prompt: string
}

interface SkillDefinitionFromJSON {
  name: string
  rubrica: Record<string, string>
  likert_indicators: string[]
  indicadores_info: IndicadorInfo[]
  open_question_id: string
  scoring_weights: {
    likert: number
    open: number
  }
  prompt_score_rubric_text: string
  prompt_tutor_definition: any
}

interface Skill {
  id: string
  name: string
  questions: Question[]
  indicadoresInfo: IndicadorInfo[]
  openQuestionId: string
}

export async function GET(request: Request) {
  try {
    // Definir las rutas a los archivos JSON
    const intakeFormPath = path.join(process.cwd(), "data", "intake_form.json")
    const skillDefinitionsPath = path.join(process.cwd(), "data", "skill_definitions.json")

    // Leer los archivos
    const intakeFormContent = fs.readFileSync(intakeFormPath, "utf8")
    const skillDefinitionsContent = fs.readFileSync(skillDefinitionsPath, "utf8")

    // Parsear el contenido JSON
    const intakeFormData: Question[] = JSON.parse(intakeFormContent)
    const skillDefinitionsData: Record<string, SkillDefinitionFromJSON> = JSON.parse(skillDefinitionsContent)

    // Procesar y combinar los datos
    const combinedSkillsData: Skill[] = []

    for (const skillDefKey in skillDefinitionsData) {
      const definition = skillDefinitionsData[skillDefKey]
      const skillQuestions = intakeFormData.filter((q) => q.axis === definition.name)

      if (skillQuestions.length > 0) {
        combinedSkillsData.push({
          id: skillDefKey,
          name: definition.name,
          questions: skillQuestions,
          indicadoresInfo: definition.indicadores_info,
          openQuestionId: definition.open_question_id,
        })
      }
    }

    // Devolver los datos combinados como respuesta
    return NextResponse.json(combinedSkillsData)
  } catch (error) {
    console.error("Error al cargar y combinar datos de habilidades:", error)
    return NextResponse.json({ error: "No se pudieron cargar los datos de las habilidades." }, { status: 500 })
  }
}
