#!/bin/bash

# 🔍 Google OAuth Verification Script
# Este script verifica se a configuração do Google OAuth está completa

set -e

echo "🔍 Verificação Completa do Google OAuth"
echo "======================================="
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

echo -e "${BLUE}📋 Checklist de Configuração do Google OAuth:${NC}"
echo ""
echo "1. 🌐 Google Cloud Console:"
echo "   ✅ Projeto 'Jarvi App' criado"
echo "   ✅ APIs ativadas (Google+ API, Google Identity)"
echo ""
echo "2. 📱 iOS Client ID ('iOS Jarvi'):"
echo "   ✅ Bundle ID: com.jarvi.app"
echo "   ❌ FALTANDO: Redirect URI: com.jarvi.app:/oauth2redirect"
echo ""
echo "3. 🌐 Web Application Client ID:"
echo "   ✅ Redirect URI: http://localhost:3001/api/auth/google/callback"
echo "   ❌ FALTANDO: JavaScript origins:"
echo "      - http://localhost:3000"
echo "      - http://localhost:3001"
echo ""
echo "4. 🔐 OAuth Consent Screen:"
echo "   ❌ FALTANDO: Configurar tela de consentimento"
echo ""
echo "5. 📱 Configuração do App:"
echo "   ✅ Google Client ID configurado"
echo "   ✅ Backend rodando"
echo "   ✅ Mobile/Expo rodando"
echo ""

echo -e "${YELLOW}🔧 Passos para corrigir:${NC}"
echo ""
echo "1. 📱 iOS Client ID:"
echo "   • Acesse: https://console.cloud.google.com/apis/credentials"
echo "   • Clique em 'iOS Jarvi'"
echo "   • Adicione Redirect URI: com.jarvi.app:/oauth2redirect"
echo "   • Clique em 'Save'"
echo ""
echo "2. 🌐 Web Application:"
echo "   • Clique em 'Web Application (Backend)'"
echo "   • Em 'Authorized JavaScript origins':"
echo "     + Adicione: http://localhost:3000"
echo "     + Adicione: http://localhost:3001"
echo "   • Clique em 'Save'"
echo ""
echo "3. 🔐 OAuth Consent Screen:"
echo "   • Vá para 'OAuth consent screen'"
echo "   • Configure:"
echo "     - App name: Jarvi"
echo "     - User support email: seu-email@gmail.com"
echo "     - Developer contact: seu-email@gmail.com"
echo "     - Authorized domains: localhost"
echo ""
echo "4. ⏰ Aguarde 5-10 minutos para as mudanças propagarem"
echo ""
echo "5. 🧪 Teste novamente o login no app"
echo ""

echo -e "${BLUE}🔗 Links úteis:${NC}"
echo "• Google Cloud Console: https://console.cloud.google.com/"
echo "• OAuth Consent Screen: https://console.cloud.google.com/apis/credentials/consent"
echo "• Credentials: https://console.cloud.google.com/apis/credentials"
echo ""

echo -e "${YELLOW}⚠️ Importante:${NC}"
echo "• As mudanças podem levar 5-10 minutos para propagar"
echo "• Certifique-se de que está usando o Client ID correto"
echo "• O erro 'acesso bloqueado' geralmente indica problemas na configuração"
echo ""

echo -e "${GREEN}✅ Após fazer as correções, execute:${NC}"
echo "   ./scripts/test-google-oauth.sh"
echo "" 