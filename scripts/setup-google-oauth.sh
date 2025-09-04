#!/bin/bash

# 🚀 Google OAuth Setup Script for Jarvi
# Este script ajuda a configurar o Google OAuth para o projeto

set -e

echo "🔐 Configuração do Google OAuth para Jarvi"
echo "=========================================="
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

echo -e "${BLUE}📋 Passos para configurar o Google OAuth:${NC}"
echo ""
echo "1. 🌐 Acesse o Google Cloud Console:"
echo "   https://console.cloud.google.com/"
echo ""
echo "2. 📁 Crie um novo projeto ou selecione um existente"
echo ""
echo "3. 🔧 Ative as APIs necessárias:"
echo "   - Google+ API"
echo "   - Google Identity"
echo ""
echo "4. 🔑 Configure as credenciais OAuth 2.0:"
echo ""
echo "   📱 Para iOS:"
echo "   - Bundle ID: com.jarvi.app"
echo "   - Redirect URI: com.jarvi.app:/oauth2redirect"
echo ""
echo "   🤖 Para Android:"
echo "   - Package name: com.jarvi.app"
echo "   - Redirect URI: com.jarvi.app:/oauth2redirect"
echo ""
echo "   🌐 Para Web (Backend):"
echo "   - Redirect URI: http://localhost:3001/api/auth/google/callback"
echo ""

# Solicitar Google Client ID
echo -e "${YELLOW}🔑 Digite seu Google Client ID (ou pressione Enter para pular):${NC}"
read -p "Google Client ID: " GOOGLE_CLIENT_ID

if [ -n "$GOOGLE_CLIENT_ID" ]; then
    log "Configurando Google Client ID..."
    
    # Atualizar arquivo .env do mobile
    if [ -f "packages/mobile/.env" ]; then
        sed -i '' "s/GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID/" packages/mobile/.env
        log "✅ Google Client ID configurado no mobile"
    fi
    
    # Atualizar arquivo .env do backend
    if [ -f "packages/backend/.env" ]; then
        # Verificar se GOOGLE_CLIENT_ID já existe
        if grep -q "GOOGLE_CLIENT_ID" packages/backend/.env; then
            sed -i '' "s/GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID/" packages/backend/.env
        else
            echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" >> packages/backend/.env
        fi
        log "✅ Google Client ID configurado no backend"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 Google OAuth configurado com sucesso!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Próximos passos:${NC}"
    echo "1. Reinicie o servidor backend: npm run dev:backend"
    echo "2. Reinicie o app mobile: npm run dev:mobile"
    echo "3. Teste o login com Google no app"
    echo ""
else
    warn "Google Client ID não fornecido. Configure manualmente:"
    echo ""
    echo "1. Edite packages/mobile/.env"
    echo "2. Substitua 'your-google-client-id-here' pelo seu Client ID"
    echo "3. Edite packages/backend/.env"
    echo "4. Adicione: GOOGLE_CLIENT_ID=seu-client-id-aqui"
    echo ""
fi

echo -e "${BLUE}📚 Documentação completa:${NC}"
echo "📖 GOOGLE_OAUTH_SETUP.md"
echo ""
echo -e "${BLUE}🔗 Links úteis:${NC}"
echo "🌐 Google Cloud Console: https://console.cloud.google.com/"
echo "📱 Expo Auth Session: https://docs.expo.dev/versions/latest/sdk/auth-session/"
echo "" 