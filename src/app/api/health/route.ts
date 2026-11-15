import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'casa-do-tempero-delivery',
    framework: 'next-app-router',
    evolutionConfigured: Boolean(
      process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY,
    ),
    timestamp: new Date().toISOString(),
  });
}
