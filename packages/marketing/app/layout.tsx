import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { PostHogProvider } from './providers/PostHogProvider';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Jarvi – App de tarefas com memória inteligente',
  description:
    'Jarvi é um app de tarefas com IA e memória inteligente que te ajuda a organizar desde pequenas tarefas até as mais complexas.',
  openGraph: {
    title: 'Jarvi – App de tarefas com memória inteligente',
    description:
      'Organize tarefas complexas e tarefas do dia a dia com o Jarvi, um app de produtividade com IA e memória inteligente.',
  },
  icons: {
    icon: [
      { url: '/assets/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/assets/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/assets/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/assets/icons/favicon-32x32.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={plusJakartaSans.className}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
