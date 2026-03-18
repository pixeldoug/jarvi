import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { LegalLayout } from '../components/LegalLayout/LegalLayout';

export const metadata: Metadata = {
  title: 'Política de Privacidade – Jarvi',
  description: 'Leia a Política de Privacidade da plataforma Jarvi.',
};

export default function PoliticaDePrivacidadeLayout({ children }: { children: ReactNode }) {
  return <LegalLayout>{children}</LegalLayout>;
}
