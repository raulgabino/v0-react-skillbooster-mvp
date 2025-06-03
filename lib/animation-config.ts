// Configuración centralizada de animaciones
export const animations = {
  // Duraciones (en ms)
  durations: {
    fast: 150,
    default: 300,
    medium: 500,
    slow: 800,
  },

  // Curvas de aceleración
  easings: {
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    bounce: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  },

  // Clases de Tailwind para transiciones comunes
  transitions: {
    default: "transition-all duration-300 ease-in-out",
    fast: "transition-all duration-150 ease-in-out",
    slow: "transition-all duration-500 ease-in-out",
    button: "transition-colors duration-200 ease-in-out",
    transform: "transition-transform duration-300 ease-out",
    opacity: "transition-opacity duration-300 ease-in-out",
    scale: "transition-all duration-200 ease-out",
    bounce: "transition-transform duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
  },

  // Clases para animaciones específicas
  animations: {
    fadeIn: "animate-fadeIn",
    pulse: "animate-pulse",
    spin: "animate-spin",
    bounce: "animate-bounce",
  },
}
