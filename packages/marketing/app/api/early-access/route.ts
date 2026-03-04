import { NextResponse } from 'next/server';

const DEFAULT_BACKEND_URL =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3001'
    : 'https://jarvi-production.up.railway.app';

const getBackendUrl = (): string => {
  const rawUrl = process.env.MARKETING_BACKEND_URL || DEFAULT_BACKEND_URL;
  return rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const response = await fetch(`${getBackendUrl()}/api/early-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({ error: 'Resposta inválida do servidor' }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Marketing early access route error:', error);
    return NextResponse.json(
      { error: 'Não foi possível enviar seu cadastro agora. Tente novamente.' },
      { status: 500 }
    );
  }
}
