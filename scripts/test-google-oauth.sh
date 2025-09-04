#!/bin/bash

# 🧪 Test Script for Google OAuth Configuration
# Este script testa se a configuração do Google OAuth está correta

set -e

echo "🧪 Testando Configuração do Google OAuth"
echo "========================================"
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

# Testar se o backend está rodando
test_backend() {
    log "Testando backend..."
    if curl -s http://localhost:3001/health > /dev/null; then
        log "✅ Backend está rodando na porta 3001"
    else
        error "❌ Backend não está rodando na porta 3001"
        return 1
    fi
}

# Testar se o mobile está rodando
test_mobile() {
    log "Testando mobile/Expo..."
    if curl -s http://localhost:8081 > /dev/null; then
        log "✅ Mobile/Expo está rodando na porta 8081"
    else
        error "❌ Mobile/Expo não está rodando na porta 8081"
        return 1
    fi
}

# Verificar configuração do Google Client ID
check_google_config() {
    log "Verificando configuração do Google Client ID..."
    
    # Verificar mobile
    MOBILE_CLIENT_ID=$(grep "GOOGLE_CLIENT_ID" packages/mobile/.env | cut -d'=' -f2)
    if [[ "$MOBILE_CLIENT_ID" != "your-google-client-id-here" && -n "$MOBILE_CLIENT_ID" ]]; then
        log "✅ Google Client ID configurado no mobile: ${MOBILE_CLIENT_ID:0:20}..."
    else
        error "❌ Google Client ID não configurado no mobile"
        return 1
    fi
    
    # Verificar backend
    BACKEND_CLIENT_ID=$(grep "GOOGLE_CLIENT_ID" packages/backend/.env | cut -d'=' -f2)
    if [[ "$BACKEND_CLIENT_ID" != "your-google-client-id-here" && -n "$BACKEND_CLIENT_ID" ]]; then
        log "✅ Google Client ID configurado no backend: ${BACKEND_CLIENT_ID:0:20}..."
    else
        error "❌ Google Client ID não configurado no backend"
        return 1
    fi
    
    # Verificar se são iguais
    if [[ "$MOBILE_CLIENT_ID" == "$BACKEND_CLIENT_ID" ]]; then
        log "✅ Google Client IDs são iguais em mobile e backend"
    else
        warn "⚠️ Google Client IDs são diferentes entre mobile e backend"
    fi
}

# Testar rota de autenticação
test_auth_route() {
    log "Testando rota de autenticação Google..."
    
    RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/google \
        -H "Content-Type: application/json" \
        -d '{"idToken":"test"}' 2>/dev/null)
    
    if [[ "$RESPONSE" == *"error"* ]]; then
        log "✅ Rota de autenticação Google está funcionando (retornou erro esperado para token inválido)"
    else
        error "❌ Rota de autenticação Google não está respondendo corretamente"
        return 1
    fi
}

# Verificar configuração do Expo
check_expo_config() {
    log "Verificando configuração do Expo..."
    
    if [[ -f "packages/mobile/app.config.js" ]]; then
        log "✅ app.config.js encontrado"
        
        # Verificar scheme
        if grep -q "scheme: 'jarvi'" packages/mobile/app.config.js; then
            log "✅ Scheme 'jarvi' configurado"
        else
            warn "⚠️ Scheme 'jarvi' não encontrado no app.config.js"
        fi
        
        # Verificar bundle identifier
        if grep -q "bundleIdentifier: 'com.jarvi.app'" packages/mobile/app.config.js; then
            log "✅ Bundle identifier 'com.jarvi.app' configurado"
        else
            warn "⚠️ Bundle identifier 'com.jarvi.app' não encontrado"
        fi
    else
        error "❌ app.config.js não encontrado"
        return 1
    fi
}

# Função principal
main() {
    echo -e "${BLUE}🔍 Iniciando testes...${NC}"
    echo ""
    
    local all_tests_passed=true
    
    # Executar testes
    test_backend || all_tests_passed=false
    test_mobile || all_tests_passed=false
    check_google_config || all_tests_passed=false
    test_auth_route || all_tests_passed=false
    check_expo_config || all_tests_passed=false
    
    echo ""
    echo "========================================"
    
    if [[ "$all_tests_passed" == true ]]; then
        echo -e "${GREEN}🎉 Todos os testes passaram!${NC}"
        echo ""
        echo -e "${YELLOW}📱 Agora você pode testar o login no app mobile:${NC}"
        echo "1. Abra o app Jarvi no seu dispositivo"
        echo "2. Clique em 'Entrar com Google'"
        echo "3. Faça login com sua conta Google"
        echo "4. O app deve redirecionar para a tela principal"
        echo ""
        echo -e "${BLUE}🔗 URLs de teste:${NC}"
        echo "• Backend Health: http://localhost:3001/health"
        echo "• Expo DevTools: http://localhost:8081"
        echo ""
    else
        echo -e "${RED}❌ Alguns testes falharam. Verifique a configuração.${NC}"
        echo ""
        echo -e "${YELLOW}📋 Checklist:${NC}"
        echo "1. Google Client ID configurado em packages/mobile/.env"
        echo "2. Google Client ID configurado em packages/backend/.env"
        echo "3. Backend rodando: npm run dev:backend"
        echo "4. Mobile rodando: npm run dev:mobile"
        echo "5. Google Cloud Console configurado corretamente"
        echo ""
    fi
}

# Executar função principal
main "$@" 