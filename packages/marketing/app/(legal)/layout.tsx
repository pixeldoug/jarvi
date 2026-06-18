import type { ReactNode } from 'react';

import { LegalLayout } from './_components/LegalLayout/LegalLayout';

export default function LegalRouteLayout({ children }: { children: ReactNode }) {
  return <LegalLayout>{children}</LegalLayout>;
}
