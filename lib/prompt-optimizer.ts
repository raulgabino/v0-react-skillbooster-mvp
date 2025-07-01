interface OptimizedPrompt {
  prompt: string
  expectedTokens: number
  skillId: string
  personalizationLevel: "HIGH" | "MAXIMUM"
}

interface UserContext {
  role: string
  experience: string
  industry?: string
  obstacles: string[]
  projectDescription: string
}

interface AssessmentResult {
  score: number
  strength: string
  weakness: string
  reasoning: string
}

export class PromptOptimizer {
  // Map skills to expert-level context and role-specific insights
  private static readonly SKILL_INTELLIGENCE = {
    liderazgo_equipos: {
      expertFocus: "17-year leadership development specialist",
      coreElements: ["empathy", "structure", "solutions", "follow_up"],
      roleAdaptations: {
        gerente: "Project delivery + stakeholder management context",
        director: "Scaling culture + performance management focus",
        lider: "Technical excellence + people development balance",
        coordinador: "Task delegation + team coordination emphasis",
      },
      rubricWeights: "Empathy(25), Structure(30), Solutions(30), Follow-up(15)",
    },
    comunicacion_estrategica: {
      expertFocus: "Strategic communication specialist",
      coreElements: ["clarity", "adaptation", "value", "persuasion"],
      roleAdaptations: {
        gerente: "Executive communication + presentation skills",
        director: "Vision communication + organizational alignment",
        lider: "Technical communication + cross-team collaboration",
        coordinador: "Clear instruction delivery + feedback loops",
      },
      rubricWeights: "Clarity(25), Adaptation(25), Value(25), Persuasion(25)",
    },
    feedback_coaching: {
      expertFocus: "Executive coaching and feedback specialist",
      coreElements: ["evidence_based", "timing", "development", "dialogue"],
      roleAdaptations: {
        gerente: "Performance improvement + team development",
        director: "Leadership coaching + succession planning",
        lider: "Skill development + mentoring approach",
        coordinador: "Constructive feedback + growth mindset",
      },
      rubricWeights: "Evidence(25), Timing(25), Development(30), Dialogue(20)",
    },
    gestion_proyectos: {
      expertFocus: "Senior project management consultant",
      coreElements: ["planning", "scheduling", "risk_mgmt", "monitoring"],
      roleAdaptations: {
        gerente: "Resource optimization + stakeholder alignment",
        director: "Portfolio management + strategic execution",
        lider: "Technical project delivery + team coordination",
        coordinador: "Task management + progress tracking",
      },
      rubricWeights: "Planning(30), Scheduling(30), Risk(20), Monitoring(20)",
    },
    negociacion_conflictos: {
      expertFocus: "Conflict resolution and negotiation expert",
      coreElements: ["preparation", "common_ground", "emotional_mgmt", "solutions"],
      roleAdaptations: {
        gerente: "Team conflicts + resource negotiations",
        director: "Strategic negotiations + organizational diplomacy",
        lider: "Technical disputes + priority negotiations",
        coordinador: "Task conflicts + workflow optimization",
      },
      rubricWeights: "Preparation(25), Common-ground(30), Emotional(30), Solutions(15)",
    },
    pensamiento_sistemico: {
      expertFocus: "Systems thinking and complexity management expert",
      coreElements: ["connections", "causality", "feedback_loops", "leverage"],
      roleAdaptations: {
        gerente: "Process optimization + interdependency management",
        director: "Organizational systems + strategic thinking",
        lider: "Technical system design + holistic problem solving",
        coordinador: "Workflow systems + efficiency optimization",
      },
      rubricWeights: "Connections(40), Causality(30), Holistic(30)",
    },
    ia_negocios: {
      expertFocus: "AI business implementation specialist",
      coreElements: ["use_cases", "viability", "roi", "ethics"],
      roleAdaptations: {
        gerente: "AI project management + ROI assessment",
        director: "AI strategy + organizational transformation",
        lider: "AI implementation + technical feasibility",
        coordinador: "AI workflow integration + process automation",
      },
      rubricWeights: "Use-cases(30), Viability(30), ROI(25), Ethics(15)",
    },
    optimizacion_procesos: {
      expertFocus: "Process automation and optimization expert",
      coreElements: ["mapping", "inefficiencies", "tools", "measurement"],
      roleAdaptations: {
        gerente: "Process redesign + efficiency metrics",
        director: "Digital transformation + automation strategy",
        lider: "Technical automation + tool selection",
        coordinador: "Workflow optimization + performance tracking",
      },
      rubricWeights: "Mapping(30), Tools(30), Design(25), Impact(15)",
    },
    interpretacion_datos: {
      expertFocus: "Data analysis and decision-making expert",
      coreElements: ["problem_definition", "data_quality", "patterns", "action"],
      roleAdaptations: {
        gerente: "KPI analysis + performance metrics",
        director: "Strategic analytics + data-driven decisions",
        lider: "Technical metrics + optimization insights",
        coordinador: "Operational data + process improvements",
      },
      rubricWeights: "Definition(30), Quality(25), Patterns(25), Action(20)",
    },
    pensamiento_analitico: {
      expertFocus: "Critical thinking and analytical reasoning expert",
      coreElements: ["decomposition", "assumptions", "evidence", "logic"],
      roleAdaptations: {
        gerente: "Problem analysis + decision frameworks",
        director: "Strategic analysis + risk assessment",
        lider: "Technical problem solving + systematic thinking",
        coordinador: "Process analysis + logical troubleshooting",
      },
      rubricWeights: "Decomposition(30), Evidence(30), Logic(25), Perspectives(15)",
    },
  } as const

  /**
   * Creates optimized prompt for skill assessment scoring
   * Reduces tokens while maintaining expert-level personalization
   */
  static createScoringPrompt(skillId: string, userResponse: string, userContext: UserContext): OptimizedPrompt {
    const skillIntel = this.SKILL_INTELLIGENCE[skillId as keyof typeof this.SKILL_INTELLIGENCE]
    if (!skillIntel) {
      throw new Error(`Skill ${skillId} not found in intelligence map`)
    }

    // Determine role-specific context
    const roleKey = this.extractRoleKey(userContext.role)
    const roleContext =
      skillIntel.roleAdaptations[roleKey as keyof typeof skillIntel.roleAdaptations] ||
      skillIntel.roleAdaptations["coordinador"]

    // Build focused prompt maintaining expertise
    const optimizedPrompt = `EXPERT: ${skillIntel.expertFocus}
CLIENT: ${userContext.role} | ${userContext.experience} experience
CONTEXT: ${roleContext}
CHALLENGE: ${userContext.obstacles[0] || "team development"}

RESPONSE: "${userResponse}"

CRITERIA: ${skillIntel.rubricWeights}

EXPERT ANALYSIS for ${userContext.role}: Assess leadership maturity addressing ${userContext.obstacles[0] || "challenges"}.

JSON: {"score":N,"strength":"specific_strength","weakness":"actionable_area","reasoning":"expert_insight"}`

    return {
      prompt: optimizedPrompt,
      expectedTokens: 80,
      skillId,
      personalizationLevel: "HIGH",
    }
  }

  /**
   * Creates optimized prompt for personalized tips generation
   * Maintains 17-year expertise while reducing token usage
   */
  static createTipsPrompt(
    skillId: string,
    assessmentResult: AssessmentResult,
    userContext: UserContext,
  ): OptimizedPrompt {
    const skillIntel = this.SKILL_INTELLIGENCE[skillId as keyof typeof this.SKILL_INTELLIGENCE]
    const roleKey = this.extractRoleKey(userContext.role)
    const roleContext =
      skillIntel.roleAdaptations[roleKey as keyof typeof skillIntel.roleAdaptations] ||
      skillIntel.roleAdaptations["coordinador"]

    const optimizedPrompt = `CONSULTANT: ${skillIntel.expertFocus} (17 years experience)
CLIENT: ${userContext.role} at ${userContext.projectDescription || "organization"}
ASSESSMENT: ${assessmentResult.score}/100 | Strength: ${assessmentResult.strength} | Develop: ${assessmentResult.weakness}
OBSTACLES: ${userContext.obstacles.join(", ")}

EXPERT RECOMMENDATIONS for ${roleContext}:

1. LEVERAGE: How to use ${assessmentResult.strength} for ${userContext.obstacles[0]}?
2. DEVELOP: Specific weekly action for ${assessmentResult.weakness}?  
3. APPLY: Strategic implementation in their context?

JSON: {"tips":["leverage_tip","development_tip","strategic_tip"],"confidence":"expert"}`

    return {
      prompt: optimizedPrompt,
      expectedTokens: 70,
      skillId,
      personalizationLevel: "MAXIMUM",
    }
  }

  /**
   * Parse structured JSON response with error handling
   */
  static parseAssessmentResponse(response: string): AssessmentResult {
    try {
      const parsed = JSON.parse(response)
      return {
        score: parsed.score || 50,
        strength: parsed.strength || "communication",
        weakness: parsed.weakness || "follow_through",
        reasoning: parsed.reasoning || "Assessment completed",
      }
    } catch (error) {
      // Fallback for malformed JSON
      return {
        score: 50,
        strength: "demonstrated_competency",
        weakness: "structured_approach",
        reasoning: "Response analysis completed",
      }
    }
  }

  /**
   * Parse tips response with error handling
   */
  static parseTipsResponse(response: string): string[] {
    try {
      const parsed = JSON.parse(response)
      return (
        parsed.tips || [
          "Continue developing your current strengths",
          "Focus on consistent application of skills",
          "Seek feedback and iterate on your approach",
        ]
      )
    } catch (error) {
      return [
        "Build on your demonstrated capabilities",
        "Practice structured approaches to challenges",
        "Apply learnings consistently in your role",
      ]
    }
  }

  /**
   * Extract role key for mapping (private utility)
   */
  private static extractRoleKey(role: string): string {
    const lowerRole = role.toLowerCase()
    if (lowerRole.includes("gerente") || lowerRole.includes("manager")) return "gerente"
    if (lowerRole.includes("director") || lowerRole.includes("head")) return "director"
    if (lowerRole.includes("líder") || lowerRole.includes("lider") || lowerRole.includes("lead")) return "lider"
    return "coordinador"
  }

  /**
   * Calculate expected cost savings
   */
  static calculateSavings(
    originalTokens: number,
    optimizedTokens: number,
  ): {
    tokenReduction: number
    percentSaved: number
    costSavings: number
  } {
    const tokenReduction = originalTokens - optimizedTokens
    const percentSaved = (tokenReduction / originalTokens) * 100
    const costSavings = (tokenReduction * 0.00015) / 1000 // GPT-4o mini input cost

    return {
      tokenReduction,
      percentSaved: Math.round(percentSaved * 10) / 10,
      costSavings: Math.round(costSavings * 1000000) / 1000000,
    }
  }
}
