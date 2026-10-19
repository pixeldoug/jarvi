import type { Metadata } from 'next';
import ManifestoPage from './ManifestoPage';
import { APP_URL, withAttributionFromSearch } from '../lib/appLinks';

type SearchParams = Record<string, string | string[] | undefined>;

const title = 'Manifesto – Jarvi';
const description =
  'Por que estou criando a Jarvi: a vida pessoal não deveria acontecer apenas no tempo que sobra.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/manifesto',
  },
  // Page-level openGraph/twitter replace the root ones wholesale, so repeat
  // the shared fields here.
  openGraph: {
    type: 'article',
    locale: 'pt_BR',
    url: '/manifesto',
    siteName: 'Jarvi',
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return (
    <ManifestoPage
      initialLoginHref={withAttributionFromSearch(`${APP_URL}/`, params)}
      initialSignupHref={withAttributionFromSearch(`${APP_URL}/criar-conta`, params)}
    />
  );
}
