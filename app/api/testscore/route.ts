import { NextResponse } from "next/server"

export async function POST(request: Request) {
  console.log("Simplified /api/testscore was hit!")

  return NextResponse.json({ message: "Simplified testscore API reached successfully" }, { status: 200 })
}
