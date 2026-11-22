import { WhatsAppEntry } from '@/features/auth/whatsapp-entry';

/** WhatsApp sign-in. A new number creates the account, so this is also sign-up. */
export default function WhatsAppSignInScreen() {
  return <WhatsAppEntry mode="signIn" />;
}
