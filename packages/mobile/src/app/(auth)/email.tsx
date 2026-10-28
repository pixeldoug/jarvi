import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-provider';
import { GoogleButton } from '@/auth/google-button';
import { WEB_APP_URL } from '@/lib/links';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

export default function EmailSignInScreen() {
  const { acceptSession } = useAuth();
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptSession(await authApi.login(normalized, password));
    } catch (err) {
      if (err instanceof ApiError && err.data.pendingVerification) {
        router.push({ pathname: '/verificar-email', params: { email: normalized } });
        return;
      }
      setError(errorMessage(err, 'E-mail ou senha incorretos.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <>
          <Button label="Entrar" onPress={() => void signIn()} loading={busy} />
          <GoogleButton />
        </>
      }
    >
      <View style={styles.header}>
        <Text variant="heading-lg">Entrar com e-mail</Text>
        <Text variant="body-md" color="contentSecondary">
          Use o e-mail e a senha da sua conta Jarvi.
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Senha"
          value={password}
          onChangeText={setPassword}
          placeholder="Sua senha"
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void signIn()}
          error={error}
        />
        <Button
          label="Esqueci minha senha"
          variant="ghost"
          size="sm"
          style={styles.forgot}
          onPress={() => void WebBrowser.openBrowserAsync(`${WEB_APP_URL}/forgot-password`)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  forgot: {
    alignSelf: 'flex-start',
    paddingHorizontal: 0,
  },
});
