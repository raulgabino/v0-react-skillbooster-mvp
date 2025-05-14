import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export async function GET(request: Request) {
  try {
    // Definir la ruta al archivo JSON
    const filePath = path.join(process.cwd(), "data", "skill_definitions.json")

    // Leer el archivo
    const fileContent = fs.readFileSync(filePath, "utf8")

    // Parsear el contenido JSON
    const jsonData = JSON.parse(fileContent)

    // Devolver los datos como respuesta
    return NextResponse.json(jsonData)
  } catch (error) {
    console.error("Error al cargar las definiciones de habilidades:", error)
    return NextResponse.json({ error: "No se pudieron cargar las definiciones de habilidades." }, { status: 500 })
  }
}
