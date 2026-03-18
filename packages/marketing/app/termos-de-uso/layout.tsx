import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { LegalLayout } from '../components/LegalLayout/LegalLayout';

export const metadata: Metadata = {
  title: 'Termos de Uso – Jarvi',
  description: 'Leia os Termos de Uso da plataforma Jarvi.',
};

export default function TermosDeUsoLayout({ children }: { children: ReactNode }) {
  return <LegalLayout>{children}</LegalLayout>;
}
