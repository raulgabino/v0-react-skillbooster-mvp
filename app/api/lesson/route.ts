// app/api/score/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  console.log("Simplified /api/score was hit!"); // Para verificar en los logs de Vercel
  return NextResponse.json({ message: "Simplified score API reached successfully" }, { status: 200 });
}
