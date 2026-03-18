import type { Metadata } from 'next';
import { OnboardingWizard } from '../acesso-antecipado/OnboardingWizard';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function BetaOnboardingPage() {
  return <OnboardingWizard />;
}

