"use client"

import type React from "react"

import { animations } from "@/lib/animation-config"

interface UserInfo {
  name: string
  role: string
  experience: string
  projectDescription: string
  obstacles: string
}

interface UserInfoStepProps {
  userInfo: UserInfo
  setUserInfo: (userInfo: UserInfo) => void
  onSubmit: (e: React.FormEvent) => void
}

export default function UserInfoStep({ userInfo, setUserInfo, onSubmit }: UserInfoStepProps) {
  const handleInputChange = (field: keyof UserInfo, value: string) => {
    setUserInfo({
      ...userInfo,
      [field]: value,
    })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8 animate-fadeInDown">
        <h2 className="text-3xl font-bold text-blue-300 mb-4">Cuéntanos sobre ti</h2>
        <p className="text-gray-400">
          Esta información nos ayudará a personalizar tu experiencia de evaluación y mentoría
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 animate-fadeInUp">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Nombre */}
          <div className={animations.transitions.default}>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Nombre completo *
            </label>
            <input
              type="text"
              id="name"
              value={userInfo.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
              placeholder="Tu nombre completo"
              required
            />
          </div>

          {/* Rol */}
          <div className={animations.transitions.default}>
            <label htmlFor="role" className="block text-sm font-medium text-gray-300 mb-2">
              Rol o posición *
            </label>
            <input
              type="text"
              id="role"
              value={userInfo.role}
              onChange={(e) => handleInputChange("role", e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
              placeholder="Ej: Gerente de Proyecto, Desarrollador, etc."
              required
            />
          </div>
        </div>

        {/* Experiencia */}
        <div className={animations.transitions.default}>
          <label htmlFor="experience" className="block text-sm font-medium text-gray-300 mb-2">
            Años de experiencia
          </label>
          <select
            id="experience"
            value={userInfo.experience}
            onChange={(e) => handleInputChange("experience", e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
          >
            <option value="">Selecciona tu experiencia</option>
            <option value="0-1">0-1 años</option>
            <option value="2-3">2-3 años</option>
            <option value="4-5">4-5 años</option>
            <option value="6-10">6-10 años</option>
            <option value="10+">Más de 10 años</option>
          </select>
        </div>

        {/* Descripción del proyecto */}
        <div className={animations.transitions.default}>
          <label htmlFor="projectDescription" className="block text-sm font-medium text-gray-300 mb-2">
            Describe tu proyecto o contexto profesional actual *
          </label>
          <textarea
            id="projectDescription"
            value={userInfo.projectDescription}
            onChange={(e) => handleInputChange("projectDescription", e.target.value)}
            rows={4}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white resize-none"
            placeholder="Describe brevemente en qué estás trabajando actualmente, el tipo de organización, sector, etc."
            required
          />
        </div>

        {/* Obstáculos */}
        <div className={animations.transitions.default}>
          <label htmlFor="obstacles" className="block text-sm font-medium text-gray-300 mb-2">
            ¿Cuáles son tus principales obstáculos o desafíos? *
          </label>
          <textarea
            id="obstacles"
            value={userInfo.obstacles}
            onChange={(e) => handleInputChange("obstacles", e.target.value)}
            rows={4}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white resize-none"
            placeholder="Describe los principales retos que enfrentas en tu trabajo o proyecto actual"
            required
          />
        </div>

        {/* Botón de envío */}
        <div className="text-center pt-6">
          <button
            type="submit"
            className={`
              px-8 py-3 bg-blue-600 hover:bg-blue-700 
              rounded-full text-white font-semibold
              shadow-lg hover:shadow-xl transform hover:scale-105
              ${animations.transitions.default}
            `}
          >
            Continuar a Selección de Habilidades
          </button>
        </div>
      </form>

      {/* Indicador de progreso */}
      <div className="mt-8 flex justify-center">
        <div className="flex space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
          <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
          <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
        </div>
      </div>
    </div>
  )
}
