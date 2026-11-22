# Jarvi mobile

App iOS/Android da Jarvi (Expo SDK 58, React Native 0.88, Expo Router). Mesmo backend e mesmo produto da web: tarefas, calendário, chat com a Jarvi e cadastro.

**Não é um workspace do npm.** O app usa React 19 e a web ainda está no 18; com hoisting as duas versões se misturariam. Por isso `packages/mobile` tem `package-lock.json` próprio e é instalado à parte:

```bash
cd packages/mobile && npm install
```

## Rodar no simulador

1. Backend local: `npm run dev:backend` na raiz (porta 3001).
2. `cp .env.example .env.local` (aponta para `http://localhost:3001`).
3. `npm start` e `i` para abrir no simulador iOS (Expo Go).

Fora de produção o backend devolve o código do WhatsApp na resposta e o app mostra "Código de teste: …". Nenhuma mensagem é enviada.

O Expo Go não tem o módulo nativo do Google Sign-In, então o botão "Continuar com Google" só aparece em build de desenvolvimento ou de loja.

## Qualidade

```bash
npm run check   # typecheck + lint (0 warnings) + testes
npm run doctor  # expo-doctor
```

O CI (`.github/workflows/mobile.yml`) roda os mesmos passos em todo PR que toca `packages/mobile`.

## Onde fica cada coisa

| Pasta | O quê |
|-------|-------|
| `src/app` | Rotas (Expo Router). `(auth)` login, `onboarding`, `(app)` logado com as abas em `(tabs)` |
| `src/api` | Cliente HTTP e endpoints tipados do backend |
| `src/auth` | Sessão (token no Keychain/Keystore) e Google |
| `src/features` | Tarefas, chat, cadastro, assinatura |
| `src/lib` | Funções puras (datas, recorrência, lembretes, descrição, telefone), com testes |
| `src/theme` | Tokens copiados do design system da web (`packages/web/src/design-system/tokens`) |
| `src/ui` | Componentes base |
| `src/types` | Modelos da API. `recurrence.ts`/`reminder.ts` espelham `packages/shared` (mantenha em sincronia) |

| `modules/jarvi-watch` | Módulo nativo local que passa a sessão do iPhone para o Apple Watch (WatchConnectivity) |
| `targets/watch` | App do Apple Watch em SwiftUI, embutido no app do iPhone pelo `@bacons/apple-targets` |

Contrato de UI: [compliance.md](compliance.md).

## Apple Watch

O relógio mostra as tarefas vencidas e as de hoje, marca como feita e cria tarefa para hoje por voz (o campo "Nova tarefa" abre o ditado do relógio). Ele não tem login próprio: o app do iPhone manda o token pelo WatchConnectivity a cada entrada e abertura (`src/features/watch/use-watch-session.ts`), e o relógio guarda no Keychain e fala direto com o backend. Sair no iPhone também desconecta o relógio.

- Só vai junto em build nativo (EAS). No Expo Go e no Android o módulo não existe e nada acontece.
- O `expo prebuild` cria o alvo `JarviWatch` (bundle `com.jarvi.app.watchkitapp`, watchOS 10+) e gera o ícone em `targets/watch/Assets.xcassets`, que fica fora do git.
- O EAS pede um perfil de assinatura também para o relógio no primeiro build (`eas build` cuida disso com a conta Apple).
- Para instalar: TestFlight no iPhone, e o app aparece no relógio pareado (ou pelo app Watch do iPhone).
- Textos em `targets/watch/pt.lproj` e `en.lproj` (as chaves são o texto em português).

## Builds e publicação (EAS)

Os builds rodam na nuvem da Expo. O SDK 58 exige Xcode 26.4+, então não dependemos do Xcode local.

| Perfil | Backend | Para quê |
|--------|---------|----------|
| `development` | staging | Dev client em aparelho |
| `development-simulator` | staging | Dev client no simulador iOS |
| `preview` | staging | Teste interno (link direto / Play interno) |
| `production` | produção | TestFlight, App Store e Play |

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform ios
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios --latest
```

Antes do primeiro build de produção:

- **Conta Expo:** `extra.eas.projectId` em `app.config.ts` aponta para o projeto antigo. Se a conta logada não for dona dele, rode `npx eas-cli@latest init` e troque o id.
- **Apple:** conta Apple Developer ativa. O `bundleIdentifier` é `com.jarvi.app`; se já estiver em uso por outra conta, troque.
- **Google Sign-In no Android:** criar o OAuth client Android no Google Cloud com o SHA-1 da chave do EAS (`eas credentials`). O backend já aceita o client web, que é o que o Android usa como `webClientId`.
- **Google Sign-In no iOS:** produção precisa de `GOOGLE_MOBILE_CLIENT_ID` (client iOS) configurado no backend.
- **Loja pública:** a Apple pede "Entrar com Apple" quando há login com Google, e a forma de cobrança dentro do app ainda está em aberto. Os dois ficam decididos antes do envio para revisão.
