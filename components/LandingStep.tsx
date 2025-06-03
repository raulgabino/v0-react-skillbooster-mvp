"use client"

import { animations } from "@/lib/animation-config"

interface LandingStepProps {
  onStart: () => void
}

export default function LandingStep({ onStart }: LandingStepProps) {
  return (
    <div className="text-center space-y-8 max-w-3xl mx-auto">
      {/* Hero Section */}
      <div className={`space-y-6 ${animations.transitions.default}`}>
        <div className="animate-fadeInDown">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            SkillBoosterX
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mt-4">Evalúa. Mejora. Despega.</p>
        </div>

        <div className="animate-fadeInUp" style={{ animationDelay: "0.2s" }}>
          <p className="text-lg text-gray-400 leading-relaxed">
            Herramienta ágil para líderes y equipos que creen en la sostenibilidad con acción real. Descubre tus
            fortalezas, identifica oportunidades de mejora y recibe mentoría personalizada.
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-6 my-12 animate-fadeInUp" style={{ animationDelay: "0.4s" }}>
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors">
          <div className="text-blue-400 text-3xl mb-3">📊</div>
          <h3 className="text-lg font-semibold mb-2">Evaluación Integral</h3>
          <p className="text-gray-400 text-sm">Evalúa múltiples habilidades con preguntas diseñadas por expertos</p>
        </div>

        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors">
          <div className="text-green-400 text-3xl mb-3">🎯</div>
          <h3 className="text-lg font-semibold mb-2">Feedback Personalizado</h3>
          <p className="text-gray-400 text-sm">Recibe consejos específicos basados en tu perfil y contexto</p>
        </div>

        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors">
          <div className="text-purple-400 text-3xl mb-3">🤖</div>
          <h3 className="text-lg font-semibold mb-2">Mentor IA</h3>
          <p className="text-gray-400 text-sm">Sesiones de mentoría interactivas con inteligencia artificial</p>
        </div>
      </div>

      {/* CTA */}
      <div className="animate-fadeInUp" style={{ animationDelay: "0.6s" }}>
        <button
          onClick={onStart}
          className={`
            px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 
            hover:from-blue-700 hover:to-purple-700 
            rounded-full text-white font-semibold text-lg
            shadow-lg hover:shadow-xl transform hover:scale-105
            ${animations.transitions.default}
          `}
        >
          Comenzar Evaluación
        </button>

        <p className="text-sm text-gray-500 mt-4">⏱️ Tiempo estimado: 10-15 minutos por habilidad</p>
      </div>

      {/* Trust indicators */}
      <div className="animate-fadeInUp" style={{ animationDelay: "0.8s" }}>
        <div className="flex justify-center items-center space-x-8 text-gray-600 text-sm">
          <div className="flex items-center space-x-2">
            <span>🔒</span>
            <span>Datos seguros</span>
          </div>
          <div className="flex items-center space-x-2">
            <span>⚡</span>
            <span>Resultados inmediatos</span>
          </div>
          <div className="flex items-center space-x-2">
            <span>📈</span>
            <span>Mejora continua</span>
          </div>
        </div>
      </div>
    </div>
  )
}
