import { NextResponse } from 'next/server';
import { getGoogleMapsApiKey } from '@/lib/server-store';

export async function GET() {
  const apiKey = getGoogleMapsApiKey();
  return NextResponse.json({
    ok: true,
    apiKey,
    hasKey: Boolean(apiKey),
  });
}
