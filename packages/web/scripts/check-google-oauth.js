/**
 * Script para verificar a configuração do Google OAuth
 */

const clientId = process.env.VITE_GOOGLE_CLIENT_ID || '933867383204-ieshtq1903hud854ja1lfk0v2lkf86s9.apps.googleusercontent.com';

console.log('🔍 Verificando configuração do Google OAuth...\n');

console.log('📋 Informações:');
console.log(`Client ID: ${clientId}`);
console.log(`Domínio atual: ${process.env.NODE_ENV === 'development' ? 'localhost:3001' : 'produção'}`);

console.log('\n🔧 Para corrigir o erro "origin not allowed":');
console.log('1. Acesse: https://console.cloud.google.com/');
console.log('2. Vá para APIs & Services > Credentials');
console.log('3. Clique no Client ID acima');
console.log('4. Adicione nas "Authorized JavaScript origins":');
console.log('   - http://localhost:3000');
console.log('   - http://localhost:3001');
console.log('   - http://127.0.0.1:3000');
console.log('   - http://127.0.0.1:3001');
console.log('5. Salve e aguarde alguns minutos');

console.log('\n✅ Após configurar, reinicie o servidor e teste novamente!');

