'use client';

import { FormEvent, useState } from 'react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^\+?\d{10,15}$/;

const normalizeWhatsapp = (value: string): string => value.trim().replace(/[^\d+]/g, '');

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export function EarlyAccessForm() {
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [wantsBroadcastUpdates, setWantsBroadcastUpdates] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedWhatsapp = normalizeWhatsapp(whatsapp);

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setSubmitState('error');
      setFeedbackMessage('Digite um email válido para entrar na lista de acesso antecipado.');
      return;
    }

    if (!WHATSAPP_REGEX.test(normalizedWhatsapp)) {
      setSubmitState('error');
      setFeedbackMessage('Digite um WhatsApp válido com DDI (ex: +5511999999999).');
      return;
    }

    setSubmitState('loading');
    setFeedbackMessage('');

    try {
      const response = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          whatsapp: normalizedWhatsapp,
          wantsBroadcastUpdates,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Não foi possível concluir seu cadastro agora.'
        );
      }

      setSubmitState('success');
      setFeedbackMessage(
        typeof data.message === 'string'
          ? data.message
          : 'Cadastro recebido! Em breve entraremos em contato.'
      );
    } catch (error) {
      setSubmitState('error');
      setFeedbackMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir seu cadastro agora.'
      );
    }
  };

  return (
    <form className="earlyAccessForm" onSubmit={handleSubmit}>
      <div className="formGrid">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={submitState === 'loading' || submitState === 'success'}
          />
        </label>

        <label className="field">
          <span>WhatsApp</span>
          <input
            type="tel"
            name="whatsapp"
            placeholder="+5511999999999"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            autoComplete="tel"
            required
            disabled={submitState === 'loading' || submitState === 'success'}
          />
        </label>
      </div>

      <label className="checkboxField">
        <input
          type="checkbox"
          checked={wantsBroadcastUpdates}
          onChange={(event) => setWantsBroadcastUpdates(event.target.checked)}
          disabled={submitState === 'loading' || submitState === 'success'}
        />
        <span>Quero entrar na lista de transmissão para receber updates do progresso.</span>
      </label>

      <p className="disclaimer">
        Sem spam e sem conteúdo promocional. Vamos usar seu contato apenas para conversar sobre o
        produto e evolução da Jarvi.
      </p>

      <button
        className="button buttonPrimary submitButton"
        type="submit"
        disabled={submitState === 'loading' || submitState === 'success'}
      >
        {submitState === 'loading' ? 'Enviando...' : 'Quero acesso antecipado'}
      </button>

      {feedbackMessage ? (
        <p className={submitState === 'success' ? 'formFeedbackSuccess' : 'formFeedbackError'}>
          {feedbackMessage}
        </p>
      ) : null}
    </form>
  );
}
