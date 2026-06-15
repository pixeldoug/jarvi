import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CHANGELOG_ENTRIES } from './changelog.data';
import { ChangelogLayout } from '../components/ChangelogLayout/ChangelogLayout';

export const metadata: Metadata = {
  title: 'Novidades – Jarvi',
  description:
    'Acompanhe todas as atualizações da Jarvi: novas funcionalidades, melhorias e correções, publicadas regularmente.',
  openGraph: {
    title: 'Novidades – Jarvi',
    description:
      'Veja o que há de novo na Jarvi: integrações, IA, produtividade e muito mais.',
    url: 'https://jarvi.app/novidades',
  },
  alternates: {
    canonical: 'https://jarvi.app/novidades',
  },
};

export default function NovidadesLayout({ children }: { children: ReactNode }) {
  return <ChangelogLayout entries={CHANGELOG_ENTRIES}>{children}</ChangelogLayout>;
}
