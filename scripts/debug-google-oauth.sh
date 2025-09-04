#!/bin/bash

# 🔍 Google OAuth Debug Script
# Este script ajuda a identificar problemas específicos do Google OAuth

set -e

echo "🔍 Debug do Google OAuth"
echo "======================="
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

echo -e "${BLUE}🔍 Verificando configuração do Google OAuth...${NC}"
echo ""

# Verificar Google Client ID
log "1. Verificando Google Client ID..."
MOBILE_CLIENT_ID=$(grep "GOOGLE_CLIENT_ID" packages/mobile/.env | cut -d'=' -f2)
BACKEND_CLIENT_ID=$(grep "GOOGLE_CLIENT_ID" packages/backend/.env | cut -d'=' -f2)

echo "   Mobile: $MOBILE_CLIENT_ID"
echo "   Backend: $BACKEND_CLIENT_ID"

if [[ "$MOBILE_CLIENT_ID" == "$BACKEND_CLIENT_ID" ]]; then
    log "   ✅ Client IDs são iguais"
else
    error "   ❌ Client IDs são diferentes!"
fi

# Verificar se o Client ID é válido
if [[ "$MOBILE_CLIENT_ID" == *"apps.googleusercontent.com"* ]]; then
    log "   ✅ Formato do Client ID é válido"
else
    error "   ❌ Formato do Client ID é inválido"
fi

echo ""

# Verificar configuração do Expo
log "2. Verificando configuração do Expo..."
if grep -q "googleClientId" packages/mobile/app.config.js; then
    log "   ✅ googleClientId configurado no app.config.js"
else
    error "   ❌ googleClientId não encontrado no app.config.js"
fi

if grep -q "bundleIdentifier: 'com.jarvi.app'" packages/mobile/app.config.js; then
    log "   ✅ Bundle identifier configurado corretamente"
else
    error "   ❌ Bundle identifier não configurado"
fi

echo ""

# Verificar se os serviços estão rodando
log "3. Verificando serviços..."
if curl -s http://localhost:3001/health > /dev/null; then
    log "   ✅ Backend rodando na porta 3001"
else
    error "   ❌ Backend não está rodando na porta 3001"
fi

if curl -s http://localhost:8081 > /dev/null; then
    log "   ✅ Expo rodando na porta 8081"
else
    error "   ❌ Expo não está rodando na porta 8081"
fi

echo ""

# Verificar configuração do OAuth Consent Screen
log "4. Checklist do OAuth Consent Screen:"
echo "   • ✅ App domain configurado com jarvi.life"
echo "   • ✅ Authorized domain: jarvi.life"
echo "   • ✅ Developer contact configurado"
echo ""

# Verificar configuração do iOS Client ID
log "5. Checklist do iOS Client ID:"
echo "   • ✅ Bundle ID: com.jarvi.app"
echo "   • ⚠️  Verificar se não há redirect URIs configurados (iOS não usa)"
echo ""

echo -e "${YELLOW}🔧 Possíveis soluções para o erro 400: invalid_request:${NC}"
echo ""
echo "1. ⏰ Aguarde mais tempo:"
echo "   • As mudanças podem levar até 1 hora para propagar"
echo "   • Tente novamente em 30 minutos"
echo ""
echo "2. 🔄 Reinicie completamente:"
echo "   • Pare todos os serviços"
echo "   • Reinicie o backend: npm run dev:backend"
echo "   • Reinicie o mobile: npm run dev:mobile"
echo ""
echo "3. 🧪 Teste com um Client ID diferente:"
echo "   • Crie um novo iOS Client ID no Google Cloud Console"
echo "   • Use o novo Client ID no app"
echo ""
echo "4. 📱 Verifique o dispositivo:"
echo "   • Teste em um dispositivo físico (não simulador)"
echo "   • Verifique se o Google Play Services está atualizado"
echo ""
echo "5. 🔍 Verifique os logs:"
echo "   • Abra o console do Expo para ver os logs de debug"
echo "   • Procure por mensagens de erro específicas"
echo ""

echo -e "${BLUE}🔗 Links úteis:${NC}"
echo "• Google Cloud Console: https://console.cloud.google.com/"
echo "• Expo Auth Session: https://docs.expo.dev/versions/latest/sdk/auth-session/"
echo "• Google OAuth iOS: https://developers.google.com/identity/sign-in/ios"
echo "" 