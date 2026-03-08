import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Jarvi – App de tarefas com memória inteligente',
  description:
    'Jarvi é um app de produtividade com IA e memória inteligente que aprende com você para organizar tarefas complexas e tarefas do dia a dia.',
  openGraph: {
    title: 'Jarvi – App de tarefas com memória inteligente',
    description:
      'Organize tarefas complexas e tarefas do dia a dia com o Jarvi, um app de produtividade com IA e memória inteligente.',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={plusJakartaSans.className}>{children}</body>
    </html>
  );
}
