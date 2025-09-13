# 🎨 Design System Implementation Guide
## Jarvi - Design System com TailwindCSS & NativeWind

### 📋 Visão Geral
Este documento detalha a implementação completa do design system para o projeto Jarvi, incluindo integração com Figma, tokens compartilhados, e componentes cross-platform (Web + Mobile).

---

## 🎯 Objetivos
- [ ] Criar sistema de design tokens centralizado e reutilizável
- [ ] Integrar com Figma para sincronização automática de tokens
- [ ] Implementar TailwindCSS avançado para Web
- [ ] Configurar NativeWind para Mobile
- [ ] Desenvolver sistema de temas (dark/light) cross-platform
- [ ] Criar biblioteca de componentes baseada no design system
- [ ] Documentar componentes com Storybook

---

## 📁 Estrutura do Projeto

```
packages/shared/src/
├── design-system/
│   ├── tokens/           # Design tokens (cores, tipografia, espaçamentos)
│   ├── themes/           # Temas (light/dark)
│   ├── components/       # Componentes base reutilizáveis
│   ├── context/          # Context providers (Theme)
│   ├── figma/            # Integração com Figma
│   └── utils/            # Utilitários do design system
├── types/                # Tipos TypeScript
└── index.ts              # Exports principais
```

---

## 🚀 Fases de Implementação

### **FASE 1: Design Tokens & Figma Integration**
**Duração estimada:** 2-3 dias

#### 📝 Tarefas:
1. **Criar estrutura de tokens**
   - [ ] `packages/shared/src/design-system/tokens/index.ts`
   - [ ] Definir paleta de cores (primary, neutral, semantic)
   - [ ] Configurar tipografia (fontFamily, fontSize, fontWeight)
   - [ ] Estabelecer espaçamentos (spacing)
   - [ ] Definir bordas e sombras (borderRadius, shadows)

2. **Integração com Figma**
   - [ ] `packages/shared/src/design-system/figma/index.ts`
   - [ ] Criar interface para tokens do Figma
   - [ ] Implementar função de sincronização
   - [ ] Configurar API do Figma (se necessário)

#### ✅ Acceptance Criteria:
- [ ] Tokens de design estão centralizados em `packages/shared`
- [ ] Cores seguem padrão de nomenclatura (50-950)
- [ ] Tipografia está padronizada com Inter como fonte principal
- [ ] Espaçamentos seguem escala de 4px (0.25rem)
- [ ] Estrutura permite fácil sincronização com Figma
- [ ] TypeScript types estão definidos para todos os tokens

#### 🧪 Testes:
```bash
# Testar se tokens estão sendo exportados corretamente
npm run test:design-tokens
```

---

### **FASE 2: Sistema de Temas**
**Duração estimada:** 1-2 dias

#### 📝 Tarefas:
1. **Criar temas base**
   - [ ] `packages/shared/src/design-system/themes/index.ts`
   - [ ] Definir lightTheme com todas as variáveis
   - [ ] Definir darkTheme com todas as variáveis
   - [ ] Mapear tokens para cores semânticas

2. **Context de Tema**
   - [ ] `packages/shared/src/design-system/context/ThemeContext.tsx`
   - [ ] Criar ThemeProvider
   - [ ] Implementar toggleTheme
   - [ ] Adicionar persistência no localStorage (web)

#### ✅ Acceptance Criteria:
- [ ] Light e dark themes estão completamente definidos
- [ ] ThemeProvider funciona em Web e Mobile
- [ ] Toggle de tema persiste entre sessões (web)
- [ ] Cores semânticas (background, surface, text) estão mapeadas
- [ ] Context está tipado com TypeScript
- [ ] Hook useTheme está disponível

#### 🧪 Testes:
```bash
# Testar mudança de tema
npm run test:theme-system
```

---

### **FASE 3: Configuração Web (TailwindCSS Avançado)**
**Duração estimada:** 2-3 dias

#### 📝 Tarefas:
1. **Tailwind Config Avançado**
   - [ ] Atualizar `packages/web/tailwind.config.js`
   - [ ] Mapear tokens para classes Tailwind
   - [ ] Configurar darkMode: 'class'
   - [ ] Adicionar animações customizadas
   - [ ] Criar plugin para CSS variables

2. **CSS Variables Dinâmicas**
   - [ ] `packages/web/src/styles/design-system.css`
   - [ ] Definir variáveis CSS para temas
   - [ ] Criar componentes base (@layer components)
   - [ ] Configurar transições suaves

3. **Hook de Tema Web**
   - [ ] `packages/web/src/hooks/useTheme.ts`
   - [ ] Integrar com ThemeContext
   - [ ] Aplicar classes no HTML
   - [ ] Persistir preferência no localStorage

#### ✅ Acceptance Criteria:
- [ ] TailwindCSS está configurado com todos os tokens
- [ ] Dark mode funciona com classe `.dark`
- [ ] CSS variables mudam dinamicamente
- [ ] Animações customizadas estão disponíveis
- [ ] Componentes base (btn-primary, card, input) funcionam
- [ ] Tema persiste entre reloads da página
- [ ] Todas as cores semânticas estão mapeadas

#### 🧪 Testes:
```bash
# Testar build do web
cd packages/web && npm run build

# Testar dark mode
# 1. Abrir aplicação
# 2. Clicar no toggle de tema
# 3. Verificar se cores mudam
# 4. Recarregar página
# 5. Verificar se tema persiste
```

---

### **FASE 4: Configuração Mobile (NativeWind)**
**Duração estimada:** 2-3 dias

#### 📝 Tarefas:
1. **Instalação e Configuração**
   - [ ] Instalar NativeWind e TailwindCSS
   - [ ] Configurar `packages/mobile/tailwind.config.js`
   - [ ] Atualizar `packages/mobile/babel.config.js`
   - [ ] Configurar metro.config.js (se necessário)

2. **Hook de Tema Mobile**
   - [ ] `packages/mobile/src/hooks/useTheme.ts`
   - [ ] Integrar com useColorScheme do React Native
   - [ ] Implementar persistência com AsyncStorage

3. **Configuração de Fontes**
   - [ ] Instalar Inter font no projeto
   - [ ] Configurar fontFamily no tailwind.config.js
   - [ ] Testar renderização das fontes

#### ✅ Acceptance Criteria:
- [ ] NativeWind está instalado e configurado
- [ ] TailwindCSS funciona no React Native
- [ ] Tema detecta preferência do sistema
- [ ] Fontes customizadas estão funcionando
- [ ] Hook useTheme funciona no mobile
- [ ] Build do mobile não apresenta erros

#### 🧪 Testes:
```bash
# Testar build do mobile
cd packages/mobile && npm run ios
cd packages/mobile && npm run android

# Testar NativeWind
# 1. Aplicar classes Tailwind em componentes
# 2. Verificar se estilos são aplicados
# 3. Testar mudança de tema
```

---

### **FASE 5: Biblioteca de Componentes**
**Duração estimada:** 3-4 dias

#### 📝 Tarefas:
1. **Componentes Base**
   - [ ] `packages/shared/src/design-system/components/Button.tsx`
   - [ ] `packages/shared/src/design-system/components/Card.tsx`
   - [ ] `packages/shared/src/design-system/components/Input.tsx`
   - [ ] `packages/shared/src/design-system/components/Text.tsx`
   - [ ] `packages/shared/src/design-system/components/Icon.tsx`

2. **Implementação Web**
   - [ ] `packages/web/src/components/ui/Button.tsx`
   - [ ] `packages/web/src/components/ui/Card.tsx`
   - [ ] `packages/web/src/components/ui/Input.tsx`
   - [ ] `packages/web/src/components/ui/Text.tsx`
   - [ ] `packages/web/src/components/ui/Icon.tsx`

3. **Implementação Mobile**
   - [ ] `packages/mobile/src/components/ui/Button.tsx`
   - [ ] `packages/mobile/src/components/ui/Card.tsx`
   - [ ] `packages/mobile/src/components/ui/Input.tsx`
   - [ ] `packages/mobile/src/components/ui/Text.tsx`
   - [ ] `packages/mobile/src/components/ui/Icon.tsx`

#### ✅ Acceptance Criteria:
- [ ] Todos os componentes base estão implementados
- [ ] Componentes funcionam em Web e Mobile
- [ ] Variantes (primary, secondary, outline, ghost) funcionam
- [ ] Tamanhos (sm, md, lg) estão implementados
- [ ] Estados (disabled, loading, error) funcionam
- [ ] Componentes seguem design system
- [ ] TypeScript types estão completos
- [ ] Acessibilidade básica está implementada

#### 🧪 Testes:
```bash
# Testar componentes web
cd packages/web && npm run dev
# 1. Importar e usar cada componente
# 2. Testar todas as variantes
# 3. Testar todos os tamanhos
# 4. Testar estados especiais

# Testar componentes mobile
cd packages/mobile && npm run ios
# 1. Importar e usar cada componente
# 2. Testar todas as variantes
# 3. Testar todos os tamanhos
# 4. Testar estados especiais
```

---

### **FASE 6: Documentação e Storybook**
**Duração estimada:** 2-3 dias

#### 📝 Tarefas:
1. **Setup do Storybook**
   - [ ] Instalar e configurar Storybook
   - [ ] Configurar stories para cada componente
   - [ ] Adicionar controles interativos
   - [ ] Configurar temas no Storybook

2. **Documentação**
   - [ ] Criar documentação de cada componente
   - [ ] Adicionar exemplos de uso
   - [ ] Documentar props e variantes
   - [ ] Criar guia de design system

#### ✅ Acceptance Criteria:
- [ ] Storybook está funcionando
- [ ] Todos os componentes têm stories
- [ ] Controles interativos funcionam
- [ ] Temas funcionam no Storybook
- [ ] Documentação está completa
- [ ] Exemplos de uso estão disponíveis

#### 🧪 Testes:
```bash
# Testar Storybook
npm run storybook
# 1. Abrir http://localhost:6006
# 2. Navegar por todos os componentes
# 3. Testar controles interativos
# 4. Testar mudança de tema
```

---

### **FASE 7: Integração e Deploy**
**Duração estimada:** 1-2 dias

#### 📝 Tarefas:
1. **Scripts de Build**
   - [ ] Atualizar package.json com novos scripts
   - [ ] Configurar build do design system
   - [ ] Configurar sincronização com Figma

2. **CI/CD**
   - [ ] Configurar GitHub Actions
   - [ ] Testes automatizados
   - [ ] Deploy do Storybook

#### ✅ Acceptance Criteria:
- [ ] Scripts de build funcionam
- [ ] CI/CD está configurado
- [ ] Testes automatizados passam
- [ ] Storybook é deployado automaticamente
- [ ] Design system está integrado ao projeto

#### 🧪 Testes:
```bash
# Testar build completo
npm run build:all

# Testar CI/CD
git push origin main
# Verificar se GitHub Actions executa
```

---

## 🎨 Design Tokens Específicos

### Cores
```typescript
// Paleta principal
primary: {
  50: '#f0f9ff',
  100: '#e0f2fe',
  200: '#bae6fd',
  300: '#7dd3fc',
  400: '#38bdf8',
  500: '#0ea5e9',
  600: '#0284c7', // Cor principal
  700: '#0369a1',
  800: '#075985',
  900: '#0c4a6e',
  950: '#082f49',
}

// Cores semânticas
semantic: {
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
}
```

### Tipografia
```typescript
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}

fontSize: {
  xs: ['0.75rem', { lineHeight: '1rem' }],
  sm: ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem', { lineHeight: '1.5rem' }],
  lg: ['1.125rem', { lineHeight: '1.75rem' }],
  xl: ['1.25rem', { lineHeight: '1.75rem' }],
  '2xl': ['1.5rem', { lineHeight: '2rem' }],
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
  '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
  '5xl': ['3rem', { lineHeight: '1' }],
  '6xl': ['3.75rem', { lineHeight: '1' }],
}
```

### Espaçamentos
```typescript
spacing: {
  0: '0px',
  1: '0.25rem', // 4px
  2: '0.5rem',  // 8px
  3: '0.75rem', // 12px
  4: '1rem',    // 16px
  5: '1.25rem', // 20px
  6: '1.5rem',  // 24px
  8: '2rem',    // 32px
  10: '2.5rem', // 40px
  12: '3rem',   // 48px
  16: '4rem',   // 64px
  20: '5rem',   // 80px
  24: '6rem',   // 96px
}
```

---

## 🧪 Checklist de Testes

### Testes Gerais
- [ ] Build do projeto não apresenta erros
- [ ] TypeScript não apresenta erros
- [ ] Linting passa sem warnings
- [ ] Testes unitários passam

### Testes de Tema
- [ ] Toggle de tema funciona em Web
- [ ] Tema persiste após reload (Web)
- [ ] Tema detecta preferência do sistema (Mobile)
- [ ] Todas as cores mudam corretamente
- [ ] Transições são suaves

### Testes de Componentes
- [ ] Todos os componentes renderizam corretamente
- [ ] Variantes funcionam (primary, secondary, outline, ghost)
- [ ] Tamanhos funcionam (sm, md, lg)
- [ ] Estados especiais funcionam (disabled, loading, error)
- [ ] Acessibilidade básica funciona

### Testes Cross-Platform
- [ ] Componentes funcionam em Web
- [ ] Componentes funcionam em Mobile
- [ ] Design é consistente entre plataformas
- [ ] Performance é adequada

---

## 📊 Métricas de Sucesso

### Técnicas
- [ ] 0 erros de TypeScript
- [ ] 0 warnings de linting
- [ ] 100% dos testes passando
- [ ] Build time < 30 segundos
- [ ] Bundle size otimizado

### UX/UI
- [ ] Consistência visual entre Web e Mobile
- [ ] Temas funcionam perfeitamente
- [ ] Componentes são reutilizáveis
- [ ] Design system é escalável
- [ ] Documentação está completa

---

## 🚨 Troubleshooting

### Problemas Comuns

#### TailwindCSS não funciona no Mobile
```bash
# Verificar configuração do babel
# Verificar metro.config.js
# Limpar cache: npx expo start --clear
```

#### Tema não persiste
```bash
# Verificar localStorage (Web)
# Verificar AsyncStorage (Mobile)
# Verificar ThemeProvider
```

#### Componentes não renderizam
```bash
# Verificar imports
# Verificar TypeScript types
# Verificar build do shared package
```

---

## 📚 Recursos Adicionais

### Documentação
- [TailwindCSS](https://tailwindcss.com/docs)
- [NativeWind](https://www.nativewind.dev/)
- [Storybook](https://storybook.js.org/docs)
- [Figma API](https://www.figma.com/developers/api)

### Ferramentas
- [Figma Tokens](https://www.figma.com/community/plugin/843461159747178946/Figma-Tokens)
- [Design Tokens W3C](https://design-tokens.github.io/community-group/format/)

---

## 🎯 Próximos Passos

1. **Começar com Fase 1**: Criar estrutura de tokens
2. **Configurar Figma**: Definir tokens no Figma
3. **Implementar gradualmente**: Uma fase por vez
4. **Testar constantemente**: Usar acceptance criteria
5. **Documentar progresso**: Atualizar este documento

---

**Última atualização:** $(date)
**Versão:** 1.0.0
**Status:** Em desenvolvimento

