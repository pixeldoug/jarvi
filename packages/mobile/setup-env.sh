#!/bin/bash

# Script para configurar o arquivo .env do mobile

echo "🚀 Configurando variáveis de ambiente para o mobile..."

# Verificar se o arquivo .env já existe
if [ -f ".env" ]; then
    echo "⚠️  Arquivo .env já existe. Fazendo backup..."
    cp .env .env.backup
fi

# Criar arquivo .env
cat > .env << EOF
# Mobile App Environment Variables

# API Configuration
EXPO_PUBLIC_API_URL=http://localhost:3001/api

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id-here

# Development Configuration
EXPO_PUBLIC_APP_NAME=Jarvi
EOF

echo "✅ Arquivo .env criado com sucesso!"
echo ""
echo "📝 Próximos passos:"
echo "1. Configure o GOOGLE_CLIENT_ID com seu ID do Google OAuth"
echo "2. Se necessário, altere a URL da API para produção"
echo "3. Execute 'npm start' para iniciar o app"
echo ""
echo "🔗 Para configurar o Google OAuth, consulte: GOOGLE_OAUTH_SETUP.md" 