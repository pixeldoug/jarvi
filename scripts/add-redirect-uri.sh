#!/bin/bash

# 🔗 Add Redirect URI Script
# Este script ajuda a adicionar o redirect URI no Google Cloud Console

set -e

echo "🔗 Adicionando Redirect URI no Google Cloud Console"
echo "=================================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Obter o Client ID atual
CLIENT_ID=$(grep "GOOGLE_CLIENT_ID" packages/mobile/.env | cut -d'=' -f2)

echo -e "${BLUE}📋 Passos para adicionar o Redirect URI:${NC}"
echo ""
echo "1. 🌐 Acesse o Google Cloud Console:"
echo "   https://console.cloud.google.com/"
echo ""
echo "2. 📱 Vá para 'APIs & Services' > 'Credentials'"
echo ""
echo "3. 🔍 Encontre o iOS Client ID:"
echo "   $CLIENT_ID"
echo ""
echo "4. ✏️  Clique no Client ID para editar"
echo ""
echo "5. 🔗 Adicione o Redirect URI:"
echo -e "${YELLOW}   jarvi://oauth2redirect${NC}"
echo ""
echo "6. 💾 Clique em 'Save'"
echo ""
echo -e "${BLUE}🔍 Verificando se o redirect URI está correto...${NC}"
echo ""

# Verificar se o scheme está configurado corretamente
if grep -q "scheme: 'jarvi'" packages/mobile/app.config.js; then
    log "✅ Scheme 'jarvi' configurado no app.config.js"
else
    error "❌ Scheme 'jarvi' não encontrado no app.config.js"
fi

# Verificar se o bundle identifier está correto
if grep -q "bundleIdentifier: 'com.jarvi.app'" packages/mobile/app.config.js; then
    log "✅ Bundle identifier configurado corretamente"
else
    error "❌ Bundle identifier não configurado"
fi

echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE:${NC}"
echo "• O redirect URI deve ser: ${YELLOW}jarvi://oauth2redirect${NC}"
echo "• Não use http:// ou https:// para iOS"
echo "• O formato é: {scheme}://{path}"
echo ""
echo -e "${BLUE}🔗 Links úteis:${NC}"
echo "• Google Cloud Console: https://console.cloud.google.com/"
echo "• Expo Auth Session: https://docs.expo.dev/versions/latest/sdk/auth-session/"
echo ""
echo -e "${GREEN}✅ Após adicionar o redirect URI, teste o login novamente!${NC}"
echo "" 