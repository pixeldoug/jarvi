import { ImageResponse } from 'next/og';

export const alt = 'Jarvi – App de tarefas com memória inteligente';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '96px',
          background: 'linear-gradient(135deg, #4a1ef5 0%, #6137f3 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            opacity: 0.9,
            marginBottom: 24,
          }}
        >
          Jarvi
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            maxWidth: 900,
          }}
        >
          App de tarefas com memória inteligente
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 400,
            opacity: 0.85,
            marginTop: 32,
            maxWidth: 820,
          }}
        >
          Organize desde pequenas tarefas até as mais complexas com IA.
        </div>
      </div>
    ),
    { ...size }
  );
}
