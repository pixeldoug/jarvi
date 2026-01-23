#!/bin/bash

# =============================================================================
# Stripe Development Setup Script
# =============================================================================
# Este script ajuda a configurar o ambiente de desenvolvimento para Stripe
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "=============================================="
echo "  Stripe Development Setup"
echo "=============================================="
echo -e "${NC}"

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo -e "${YELLOW}Stripe CLI não encontrado. Instalando...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install stripe/stripe-cli/stripe
        else
            echo -e "${RED}Homebrew não encontrado. Instale manualmente:${NC}"
            echo "https://stripe.com/docs/stripe-cli#install"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo -e "${YELLOW}Instalando Stripe CLI no Linux...${NC}"
        curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
        echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
        sudo apt update
        sudo apt install stripe
    else
        echo -e "${RED}Sistema operacional não suportado. Instale manualmente:${NC}"
        echo "https://stripe.com/docs/stripe-cli#install"
        exit 1
    fi
    
    echo -e "${GREEN}Stripe CLI instalado com sucesso!${NC}"
fi

# Check Stripe CLI version
STRIPE_VERSION=$(stripe version 2>/dev/null || echo "unknown")
echo -e "${GREEN}✓ Stripe CLI instalado: ${STRIPE_VERSION}${NC}"

# Check if logged in
echo ""
echo -e "${BLUE}Verificando autenticação...${NC}"

if ! stripe config --list 2>/dev/null | grep -q "test_mode_api_key"; then
    echo -e "${YELLOW}Você não está logado no Stripe CLI.${NC}"
    echo ""
    echo -e "${BLUE}Executando 'stripe login'...${NC}"
    echo -e "${YELLOW}Uma janela do navegador será aberta para autenticação.${NC}"
    echo ""
    stripe login
fi

echo -e "${GREEN}✓ Autenticado no Stripe${NC}"

# Display helpful information
echo ""
echo -e "${BLUE}=============================================="
echo "  Configuração Completa!"
echo "==============================================${NC}"
echo ""
echo -e "${GREEN}Para iniciar o listener de webhooks:${NC}"
echo "  cd packages/backend"
echo "  npm run stripe:listen"
echo ""
echo -e "${GREEN}Ou diretamente:${NC}"
echo "  stripe listen --forward-to localhost:3001/webhooks/stripe"
echo ""
echo -e "${YELLOW}IMPORTANTE: Copie o webhook secret (whsec_...) que aparecer"
echo "e adicione no seu arquivo .env:${NC}"
echo "  STRIPE_WEBHOOK_SECRET=whsec_..."
echo ""
echo -e "${GREEN}Para testar eventos:${NC}"
echo "  npm run stripe:trigger:trial-end      # Simula fim do trial"
echo "  npm run stripe:trigger:payment-success # Simula pagamento OK"
echo "  npm run stripe:trigger:payment-failed  # Simula pagamento falhou"
echo ""
echo -e "${BLUE}=============================================="
echo "  Variáveis de ambiente necessárias (.env)"
echo "==============================================${NC}"
echo ""
echo "# Backend (packages/backend/.env)"
echo "STRIPE_SECRET_KEY=sk_test_..."
echo "STRIPE_WEBHOOK_SECRET=whsec_... (do stripe listen)"
echo "STRIPE_PRICE_ID=price_..."
echo ""
echo "# Frontend (packages/web/.env)"
echo "VITE_STRIPE_PUBLISHABLE_KEY=pk_test_..."
echo ""
