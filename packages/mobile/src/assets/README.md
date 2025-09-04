# Assets Structure

Esta pasta contém todos os recursos visuais do app (imagens, ícones, etc.).

## 📁 Estrutura de Pastas

```
src/assets/
├── images/
│   ├── index.ts          # Configuração centralizada de imagens
│   ├── backgrounds/      # Imagens de fundo
│   ├── icons/           # Ícones do app
│   └── profiles/        # Imagens de perfil
├── icons/               # Ícones SVG/PNG
└── backgrounds/         # Imagens de fundo
```

## 🖼️ Como usar imagens

### 1. Imagens Online (URLs)

```typescript
import { BACKGROUND_IMAGES, PROFILE_IMAGES } from '../assets/images';

// Usar em componentes
<Image source={{ uri: BACKGROUND_IMAGES.park }} />
<ImageBackground source={{ uri: PROFILE_IMAGES.default }} />
```

### 2. Imagens Locais

```typescript
// Adicionar no index.ts
export const LOCAL_IMAGES = {
  logo: require('./logo.png'),
  background: require('./background.jpg'),
};

// Usar em componentes
<Image source={LOCAL_IMAGES.logo} />
```

## 📝 Como adicionar novas imagens

### 1. Imagens Online

Edite `src/assets/images/index.ts`:

```typescript
export const BACKGROUND_IMAGES = {
  home: 'https://exemplo.com/imagem.jpg',
  // Adicione suas imagens aqui
};
```

### 2. Imagens Locais

1. Coloque o arquivo na pasta apropriada
2. Adicione no `index.ts`:

```typescript
export const LOCAL_IMAGES = {
  minhaImagem: require('./minhaImagem.png'),
};
```

## 🎯 Categorias de Imagens

- **BACKGROUND_IMAGES**: Imagens de fundo das telas
- **PROFILE_IMAGES**: Imagens de perfil de usuários
- **APP_ICONS**: Ícones e logos do app
- **CATEGORY_IMAGES**: Imagens para categorias (tarefas, notas, etc.)
- **LOCAL_IMAGES**: Imagens locais do projeto

## 💡 Dicas

- Use URLs de alta qualidade (Unsplash, etc.)
- Para imagens locais, use formatos otimizados (PNG, JPG)
- Mantenha os nomes descritivos e organizados
- Sempre importe do `index.ts` centralizado
