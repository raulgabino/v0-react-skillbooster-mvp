import { NextResponse } from "next/server"

interface FeedbackRequestPayload {
  skillId: string
  rating: number
  comment?: string
}

interface FeedbackResponsePayload {
  success: boolean
  message: string
}

export async function POST(request: Request): Promise<NextResponse<FeedbackResponsePayload>> {
  try {
    const { skillId, rating, comment } = (await request.json()) as FeedbackRequestPayload

    // Aquí se podría implementar la lógica para guardar el feedback en una base de datos
    console.log(`Feedback recibido para la habilidad ${skillId}:`, { rating, comment })

    // Por ahora, simplemente devolvemos una respuesta exitosa
    return NextResponse.json({
      success: true,
      message: "Feedback recibido correctamente",
    })
  } catch (error) {
    console.error("Error al procesar el feedback:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Error al procesar el feedback",
      },
      { status: 500 },
    )
  }
}
