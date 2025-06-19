import type React from "react"

interface LoadingSpinnerProps {
  message?: string
  size?: "sm" | "md" | "lg"
  overlay?: boolean
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = "Cargando...", size = "md", overlay = false }) => {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  }

  const textSizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  }

  const spinnerContent = (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div
        className={`${sizeClasses[size]} border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin`}
      ></div>
      {message && <p className={`text-white font-medium ${textSizeClasses[size]} text-center`}>{message}</p>}
    </div>
  )

  if (overlay) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
        <div className="bg-gray-800 rounded-lg p-8 shadow-2xl border border-gray-600">{spinnerContent}</div>
      </div>
    )
  }

  return spinnerContent
}

export default LoadingSpinner
