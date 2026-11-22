import { WhatsAppEntry } from '@/features/auth/whatsapp-entry';

/** "Criar conta": same WhatsApp code as sign-in, with sign-up copy. */
export default function SignUpScreen() {
  return <WhatsAppEntry mode="signUp" />;
}
