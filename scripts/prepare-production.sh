#!/bin/bash

echo "🚀 Preparando Jarvi para Produção..."
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 CHECKLIST DE PRODUÇÃO${NC}"
echo ""

# Verificar se todas as dependências estão instaladas
echo -e "${YELLOW}1. Verificando dependências...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm não encontrado${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js e npm encontrados${NC}"

# Verificar se o projeto builda
echo -e "${YELLOW}2. Testando builds...${NC}"

echo "   - Testando build do backend..."
cd packages/backend
if npm run build &> /dev/null; then
    echo -e "${GREEN}   ✅ Backend build OK${NC}"
else
    echo -e "${RED}   ❌ Backend build falhou${NC}"
    exit 1
fi

echo "   - Testando build do web..."
cd ../web
if npm run build &> /dev/null; then
    echo -e "${GREEN}   ✅ Web build OK${NC}"
else
    echo -e "${RED}   ❌ Web build falhou${NC}"
    exit 1
fi

cd ../..

# Verificar arquivos de ambiente
echo -e "${YELLOW}3. Verificando configurações...${NC}"

if [ -f "packages/backend/.env" ]; then
    echo -e "${GREEN}   ✅ Backend .env existe${NC}"
else
    echo -e "${RED}   ❌ Backend .env não encontrado${NC}"
fi

if [ -f "packages/web/.env.local" ]; then
    echo -e "${GREEN}   ✅ Web .env.local existe${NC}"
else
    echo -e "${RED}   ❌ Web .env.local não encontrado${NC}"
fi

if [ -f "packages/mobile/.env" ]; then
    echo -e "${GREEN}   ✅ Mobile .env existe${NC}"
else
    echo -e "${RED}   ❌ Mobile .env não encontrado${NC}"
fi

echo ""
echo -e "${BLUE}📝 PRÓXIMOS PASSOS PARA PRODUÇÃO:${NC}"
echo ""
echo -e "${YELLOW}FASE 1 - Google Cloud Console:${NC}"
echo "1. Acesse: https://console.cloud.google.com/"
echo "2. Crie projeto 'Jarvi Production'"
echo "3. Configure OAuth Consent Screen"
echo "4. Crie Client IDs para Web, iOS e Android"
echo ""

echo -e "${YELLOW}FASE 2 - Deploy Backend (Railway):${NC}"
echo "1. Acesse: https://railway.app/"
echo "2. Conecte seu repositório GitHub"
echo "3. Configure variáveis de ambiente"
echo "4. Deploy automático"
echo ""

echo -e "${YELLOW}FASE 3 - Deploy Web (Vercel):${NC}"
echo "1. Acesse: https://vercel.com/new"
echo "2. Conecte GitHub repo"
echo "3. Root directory: packages/web"
echo "4. Configure variáveis de ambiente"
echo ""

echo -e "${YELLOW}FASE 4 - Deploy Mobile (Expo):${NC}"
echo "1. npm install -g @expo/cli eas-cli"
echo "2. eas login"
echo "3. eas build:configure"
echo "4. eas build --platform all"
echo ""

echo -e "${GREEN}🎉 Projeto pronto para produção!${NC}"
echo -e "${BLUE}📚 Consulte README.md para detalhes completos${NC}"






