import { NextResponse } from "next/server"

// Importación directa de archivos JSON para mayor robustez en serverless
import intakeFormData from "@/data/intake_form.json"
import skillDefinitionsData from "@/data/skill_definitions.json"

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
    // Usar datos importados directamente
    const intakeFormQuestions: Question[] = intakeFormData as Question[]
    const skillDefinitions: Record<string, SkillDefinitionFromJSON> = skillDefinitionsData as Record<
      string,
      SkillDefinitionFromJSON
    >

    // Procesar y combinar los datos
    const combinedSkillsData: Skill[] = []

    for (const skillDefKey in skillDefinitions) {
      const definition = skillDefinitions[skillDefKey]
      const skillQuestions = intakeFormQuestions.filter((q) => q.axis === definition.name)

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

    // Validar que tenemos datos
    if (combinedSkillsData.length === 0) {
      console.warn("No se encontraron habilidades válidas en los datos")
      return NextResponse.json({ error: "No se encontraron habilidades disponibles." }, { status: 404 })
    }

    console.log(`API /api/questions: ${combinedSkillsData.length} habilidades cargadas exitosamente`)
    return NextResponse.json(combinedSkillsData)
  } catch (error) {
    console.error("Error al cargar y combinar datos de habilidades:", error)
    return NextResponse.json(
      {
        error: "No se pudieron cargar los datos de las habilidades.",
        details: "Error interno del servidor. Contacte al administrador.",
      },
      { status: 500 },
    )
  }
}
