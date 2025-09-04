#!/bin/bash

# 🚀 Jarvi Development Setup Script
# Este script configura automaticamente o ambiente de desenvolvimento

set -e

echo "🎯 Iniciando setup do ambiente Jarvi..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log colorido
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar se Node.js está instalado
check_node() {
    if ! command -v node &> /dev/null; then
        error "Node.js não encontrado. Por favor, instale Node.js 18+ primeiro."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js 18+ é necessário. Versão atual: $(node -v)"
        exit 1
    fi
    
    log "✅ Node.js $(node -v) encontrado"
}

# Verificar se npm está instalado
check_npm() {
    if ! command -v npm &> /dev/null; then
        error "npm não encontrado. Por favor, instale npm primeiro."
        exit 1
    fi
    
    log "✅ npm $(npm -v) encontrado"
}

# Limpar instalações anteriores
clean_previous() {
    log "🧹 Limpando instalações anteriores..."
    rm -rf node_modules
    rm -rf packages/*/node_modules
    rm -rf packages/*/dist
    rm -rf packages/*/.expo
    rm -rf packages/*/coverage
    npm cache clean --force
}

# Instalar dependências
install_dependencies() {
    log "📦 Instalando dependências..."
    npm install
    
    log "📦 Instalando dependências dos workspaces..."
    npm install --workspaces
}

# Configurar ambiente
setup_environment() {
    log "⚙️ Configurando variáveis de ambiente..."
    
    # Backend
    if [ ! -f packages/backend/.env ]; then
        cp env.example packages/backend/.env
        log "✅ Arquivo .env criado para backend"
    fi
    
    # Web
    if [ ! -f packages/web/.env ]; then
        echo "VITE_API_URL=http://localhost:3001/api" > packages/web/.env
        log "✅ Arquivo .env criado para web"
    fi
    
    # Mobile
    if [ ! -f packages/mobile/.env ]; then
        cp packages/mobile/env.example packages/mobile/.env
        log "✅ Arquivo .env criado para mobile"
    fi
}

# Build do shared package
build_shared() {
    log "🔨 Build do pacote shared..."
    cd packages/shared
    npm run build
    cd ../..
}

# Verificar estrutura
check_structure() {
    log "🔍 Verificando estrutura do projeto..."
    
    # Verificar se todos os pacotes existem
    for package in backend web mobile shared; do
        if [ ! -d "packages/$package" ]; then
            error "Pacote $package não encontrado"
            exit 1
        fi
    done
    
    log "✅ Estrutura do projeto verificada"
}

# Configurar Git hooks
setup_git_hooks() {
    log "🔧 Configurando Git hooks..."
    
    if [ -d ".git" ]; then
        npx husky install
        log "✅ Husky configurado"
    else
        warn "Diretório .git não encontrado. Pulando configuração do Husky."
    fi
}

# Verificar portas
check_ports() {
    log "🔌 Verificando portas disponíveis..."
    
    local ports=(3000 3001 8081)
    local available_ports=()
    
    for port in "${ports[@]}"; do
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            available_ports+=($port)
        else
            warn "Porta $port está em uso"
        fi
    done
    
    if [ ${#available_ports[@]} -eq ${#ports[@]} ]; then
        log "✅ Todas as portas necessárias estão disponíveis"
    else
        warn "Algumas portas estão em uso. Execute 'npm run clean:ports' para liberar."
    fi
}

# Mostrar próximos passos
show_next_steps() {
    echo ""
    echo -e "${BLUE}🎉 Setup concluído com sucesso!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Próximos passos:${NC}"
    echo "1. Configure as variáveis de ambiente nos arquivos .env"
    echo "2. Execute 'npm run dev:backend' para iniciar o servidor"
    echo "3. Execute 'npm run dev:web' para iniciar a aplicação web"
    echo "4. Execute 'npm run dev:mobile' para iniciar o app mobile"
    echo ""
    echo -e "${YELLOW}🚀 Comandos úteis:${NC}"
    echo "• npm run dev:all          - Iniciar todos os serviços"
    echo "• npm run test             - Executar testes"
    echo "• npm run lint             - Verificar código"
    echo "• npm run format           - Formatar código"
    echo "• npm run clean            - Limpar build artifacts"
    echo ""
    echo -e "${YELLOW}📚 Documentação:${NC}"
    echo "• README.md                - Documentação principal"
    echo "• ARCHITECTURE.md          - Documentação da arquitetura"
    echo "• GOOGLE_OAUTH_SETUP.md    - Configuração OAuth"
    echo ""
}

# Função principal
main() {
    echo -e "${BLUE}🚀 Jarvi Development Setup${NC}"
    echo "================================"
    echo ""
    
    check_node
    check_npm
    check_structure
    clean_previous
    install_dependencies
    setup_environment
    build_shared
    setup_git_hooks
    check_ports
    show_next_steps
}

# Executar função principal
main "$@" 