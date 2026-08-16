import type { Metadata } from 'next';
import Script from 'next/script';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { PostHogProvider } from './providers/PostHogProvider';
import { MetaPixelProvider } from './providers/MetaPixelProvider';
import { SITE_URL } from './lib/site';
import { getMetaPixelBootstrapScript } from './lib/metaPixelBootstrap';
import './styles/globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
const metaPixelBootstrap =
  META_PIXEL_ID && /^\d+$/.test(META_PIXEL_ID)
    ? getMetaPixelBootstrapScript(META_PIXEL_ID)
    : '';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Jarvi – App de tarefas com memória inteligente',
  description:
    'Jarvi é um app de tarefas com IA e memória inteligente que te ajuda a organizar desde pequenas tarefas até as mais complexas.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: 'Jarvi',
    title: 'Jarvi – App de tarefas com memória inteligente',
    description:
      'Organize tarefas complexas e tarefas do dia a dia com o Jarvi, um app de produtividade com IA e memória inteligente.',
  },
  twitter: {
    card: 'summary_large_image',
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
        {metaPixelBootstrap ? (
          <>
            <Script id="meta-pixel" strategy="beforeInteractive">
              {metaPixelBootstrap}
            </Script>
            <noscript>
              <img
                height={1}
                width={1}
                style={{ display: 'none' }}
                src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        ) : null}
        <MetaPixelProvider>
          <PostHogProvider>{children}</PostHogProvider>
        </MetaPixelProvider>
      </body>
    </html>
  );
}
