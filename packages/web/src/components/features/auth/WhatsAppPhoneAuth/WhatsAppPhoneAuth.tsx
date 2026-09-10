import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { CaretUpDown } from '@phosphor-icons/react';
import { useAuth } from '../../../../contexts/AuthContext';
import { Button, OtpInput } from '../../../ui';
import { captureProductEvent } from '../../../../lib/productAnalytics';
import { trackRegistrationCompleted } from '../../../../lib/openaiPixel';
import { readOpenAiAdsContext } from '../../../../lib/attribution';
import styles from './WhatsAppPhoneAuth.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const WA_PHONE_STORAGE_KEY = 'jarvi_onboarding_wa_phone';
const WA_AWAITING_STORAGE_KEY = 'jarvi_onboarding_wa_awaiting';

interface CountryDial {
  iso: string;
  flag: string;
  dial: string;
  placeholder: string;
}

const COUNTRY_DIALS: CountryDial[] = [
  { iso: 'BR', flag: '🇧🇷', dial: '55', placeholder: '(11) 99000-9900' },
  { iso: 'PT', flag: '🇵🇹', dial: '351', placeholder: 'Seu número com DDD' },
  { iso: 'US', flag: '🇺🇸', dial: '1', placeholder: 'Seu número com DDD' },
  { iso: 'AR', flag: '🇦🇷', dial: '54', placeholder: 'Seu número com DDD' },
];

type WhatsappState = 'initial' | 'awaitingCode';

export interface WhatsAppAuthUser {
  id: string;
  email: string;
  name: string;
  authProvider?: 'email' | 'google' | 'whatsapp';
  whatsappVerified?: boolean;
  onboardingCompletedAt?: string | null;
}

interface WhatsAppPhoneAuthProps {
  source: 'login' | 'onboarding';
  onSuccess: (user: WhatsAppAuthUser, meta: { isNewUser: boolean }) => void;
  children?: ReactNode;
}

function formatNationalNumber(digits: string, iso: string): string {
  const value = digits.replace(/\D/g, '');
  if (iso === 'BR') {
    if (value.length <= 2) return value;
    if (value.length <= 7) return `(${value.slice(0, 2)}) ${value.slice(2)}`;
    return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7, 11)}`;
  }
  if (iso === 'US') {
    if (value.length <= 3) return value;
    if (value.length <= 6) return `(${value.slice(0, 3)}) ${value.slice(3)}`;
    return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
  }
  return value.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

function toE164(dial: string, nationalDigits: string): string {
  return `+${dial}${nationalDigits.replace(/\D/g, '')}`;
}

function parseStoredPhone(stored: string): { iso: string; national: string } | null {
  const digits = stored.replace(/\D/g, '');
  if (!digits) return null;
  const match = COUNTRY_DIALS.find((country) => digits.startsWith(country.dial) && digits.length > country.dial.length);
  if (!match) return { iso: 'BR', national: digits.replace(/^55/, '') };
  return { iso: match.iso, national: digits.slice(match.dial.length) };
}

async function parseApiPayload(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<Record<string, unknown>>;
  }
  const rawText = await response.text();
  if (!rawText) return {};
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return { error: rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
  }
}

export function WhatsAppPhoneAuth({ source, onSuccess, children }: WhatsAppPhoneAuthProps) {
  const { token, acceptSession } = useAuth();
  const countryMenuRef = useRef<HTMLDivElement | null>(null);

  const [countryIso, setCountryIso] = useState('BR');
  const [nationalNumber, setNationalNumber] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [whatsappState, setWhatsappState] = useState<WhatsappState>('initial');
  const [verificationCode, setVerificationCode] = useState('');
  const [whatsappError, setWhatsappError] = useState('');
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [localWhatsappCode, setLocalWhatsappCode] = useState<string | null>(null);

  const selectedCountry = COUNTRY_DIALS.find((item) => item.iso === countryIso) ?? COUNTRY_DIALS[0]!;
  const e164Phone = toE164(selectedCountry.dial, nationalNumber);

  useEffect(() => {
    try {
      const storedPhone = sessionStorage.getItem(WA_PHONE_STORAGE_KEY);
      const awaiting = sessionStorage.getItem(WA_AWAITING_STORAGE_KEY) === '1';
      if (!storedPhone) return;
      const parsed = parseStoredPhone(storedPhone);
      if (parsed) {
        setCountryIso(parsed.iso);
        setNationalNumber(parsed.national);
      }
      if (awaiting) setWhatsappState('awaitingCode');
    } catch {
      // ignore storage
    }
  }, []);

  useEffect(() => {
    if (!countryOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!countryMenuRef.current?.contains(event.target as Node)) setCountryOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [countryOpen]);

  const persistPhoneDraft = (phone: string, awaiting: boolean) => {
    try {
      sessionStorage.setItem(WA_PHONE_STORAGE_KEY, phone);
      sessionStorage.setItem(WA_AWAITING_STORAGE_KEY, awaiting ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const handleRequestWhatsappCode = async (e?: FormEvent) => {
    e?.preventDefault();
    const national = nationalNumber.replace(/\D/g, '');
    if (selectedCountry.iso === 'BR' && national.length < 10) {
      setWhatsappError('Digite um número válido com DDD.');
      return;
    }
    if (national.length < 8) {
      setWhatsappError('Digite um número válido.');
      return;
    }
    setWhatsappError('');
    setWhatsappBusy(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/onboarding/whatsapp/request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: e164Phone }),
      });
      const data = await parseApiPayload(res);
      if (!res.ok) throw new Error(String(data.error || 'Erro ao enviar código de verificação'));
      persistPhoneDraft(e164Phone, true);
      const devCode = typeof data.devCode === 'string' ? data.devCode.replace(/\D/g, '').slice(0, 6) : '';
      setLocalWhatsappCode(devCode.length === 6 ? devCode : null);
      setWhatsappState('awaitingCode');
    } catch (err) {
      setWhatsappError(err instanceof Error ? err.message : 'Erro ao enviar código');
    } finally {
      setWhatsappBusy(false);
    }
  };

  const handleEditNumber = () => {
    setWhatsappError('');
    setVerificationCode('');
    setLocalWhatsappCode(null);
    setWhatsappState('initial');
    persistPhoneDraft(e164Phone, false);
  };

  const handleVerifyWhatsapp = async (code = verificationCode) => {
    if (whatsappBusy) return;
    if (code.replace(/\D/g, '').length !== 6) return;
    setWhatsappError('');
    setWhatsappBusy(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const ads = readOpenAiAdsContext();
      const res = await fetch(`${API_URL}/api/onboarding/whatsapp/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: e164Phone, code, ...ads }),
      });
      const data = await parseApiPayload(res);
      if (!res.ok) throw new Error(String(data.error || 'Erro ao validar código'));
      const nextToken = typeof data.token === 'string' ? data.token : '';
      const nextUser = data.user as WhatsAppAuthUser | undefined;
      if (!nextToken || !nextUser) throw new Error('Não foi possível entrar agora.');
      acceptSession(nextToken, {
        ...nextUser,
        whatsappVerified: true,
      });
      try {
        sessionStorage.removeItem(WA_AWAITING_STORAGE_KEY);
      } catch {
        // ignore
      }
      window.dispatchEvent(
        new CustomEvent('jarvi:whatsapp-link-changed', { detail: { linked: true } }),
      );
      captureProductEvent('whatsapp_linked', { source });
      const isNewUser = Boolean(data.isNewUser);
      if (isNewUser) {
        captureProductEvent('user_registered', { method: 'whatsapp' });
        trackRegistrationCompleted(nextUser.id ? `cr_${nextUser.id}` : undefined);
      }
      if (source === 'onboarding') {
        captureProductEvent('onboarding_step_completed', { step: 'whatsapp' });
      }
      onSuccess({ ...nextUser, whatsappVerified: true }, { isNewUser });
    } catch (err) {
      setWhatsappError(err instanceof Error ? err.message : 'Erro ao validar código');
    } finally {
      setWhatsappBusy(false);
    }
  };

  return (
    <div className={styles.root}>
      <div
        className={
          whatsappState === 'awaitingCode'
            ? `${styles.questionBlock} ${styles.questionBlockCentered}`
            : styles.questionBlock
        }
      >
        {whatsappState === 'initial' ? (
          <h1>{source === 'login' ? 'Login com whatsapp' : 'Digite seu whatsapp'}</h1>
        ) : (
          <>
            <h1>Confirme seu WhatsApp</h1>
            <div className={styles.confirmCopy}>
              <p className={styles.stepSubtitle}>
                Enviamos um código de 6 dígitos para{' '}
                {formatNationalNumber(nationalNumber, selectedCountry.iso) || 'seu número'}.
              </p>
              <p className={styles.stepSubtitle}>
                Número errado?{' '}
                <button
                  type="button"
                  className={styles.editNumberLink}
                  onClick={handleEditNumber}
                  disabled={whatsappBusy}
                >
                  Editar
                </button>
              </p>
            </div>
          </>
        )}
      </div>

      {whatsappError && <p className={styles.errorMessage}>{whatsappError}</p>}

      {whatsappState === 'initial' && (
        <form className={styles.whatsappForm} onSubmit={(e) => void handleRequestWhatsappCode(e)}>
          <div
            className={whatsappError ? `${styles.phoneBar} ${styles.phoneBarError}` : styles.phoneBar}
            ref={countryMenuRef}
          >
            <button
              type="button"
              className={styles.countryButton}
              onClick={() => setCountryOpen((open) => !open)}
              aria-label="Selecionar país"
              aria-expanded={countryOpen}
              aria-haspopup="listbox"
            >
              <span className={styles.countryFlag} aria-hidden="true">
                {selectedCountry.flag}
              </span>
              <CaretUpDown size={14} weight="bold" />
            </button>
            {countryOpen && (
              <div className={styles.countryMenu} role="listbox">
                {COUNTRY_DIALS.map((country) => (
                  <button
                    key={country.iso}
                    type="button"
                    role="option"
                    aria-selected={country.iso === selectedCountry.iso}
                    className={styles.countryOption}
                    onClick={() => {
                      setCountryIso(country.iso);
                      setCountryOpen(false);
                    }}
                  >
                    <span aria-hidden="true">{country.flag}</span>
                    <span>+{country.dial}</span>
                  </button>
                ))}
              </div>
            )}
            <span className={styles.phoneDivider} aria-hidden="true" />
            <input
              id="whatsapp-phone"
              className={styles.phoneInput}
              value={formatNationalNumber(nationalNumber, selectedCountry.iso)}
              onChange={(e) => {
                setWhatsappError('');
                setNationalNumber(e.target.value.replace(/\D/g, '').slice(0, 11));
              }}
              placeholder={selectedCountry.placeholder}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              aria-label="Número do WhatsApp"
              aria-invalid={Boolean(whatsappError)}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="medium"
            fullWidth
            disabled={whatsappBusy}
            loading={whatsappBusy}
          >
            {source === 'login' ? 'Entrar' : 'Continuar'}
          </Button>
        </form>
      )}

      {whatsappState === 'awaitingCode' && (
        <div className={styles.whatsappForm}>
          <OtpInput
            showLabel={false}
            value={verificationCode}
            onChange={setVerificationCode}
            onComplete={(code) => void handleVerifyWhatsapp(code)}
            disabled={whatsappBusy}
            error={Boolean(whatsappError)}
          />
          {localWhatsappCode && (
            <p className={styles.helperText}>
              WhatsApp da Twilio falhou neste ambiente. Use {localWhatsappCode} para continuar.
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="small"
            disabled={whatsappBusy}
            className={styles.resendButton}
            onClick={() => void handleRequestWhatsappCode()}
          >
            Reenviar
          </Button>
        </div>
      )}

      {children}
    </div>
  );
}
