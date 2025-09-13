/**
 * Script para verificar qual projeto do Google Cloud tem o Client ID
 */

const clientId = '933867383204-ieshtq1903hud854ja1lfk0v2lkf86s9.apps.googleusercontent.com';

console.log('🔍 Verificando projetos do Google Cloud...\n');

console.log('📋 Seus Projetos:');
console.log('1. Jarvi App Production (ID: jarvi-app-production) - ✅ Selecionado');
console.log('2. Jarvi App (ID: jarvi-app)');

console.log(`\n🔑 Client ID em uso: ${clientId}`);

console.log('\n🔧 Para resolver:');
console.log('1. Verifique em QUAL projeto está o Client ID acima');
console.log('2. Se estiver no "Jarvi App" (não production):');
console.log('   - Mude para o projeto "Jarvi App"');
console.log('   - Configure as URIs autorizadas lá');
console.log('3. Se estiver no "Jarvi App Production":');
console.log('   - Configure as URIs autorizadas no projeto atual');
console.log('   - OU mude o Client ID para o do projeto de desenvolvimento');

console.log('\n💡 Dica: Para desenvolvimento, use o Client ID do projeto "Jarvi App"');
console.log('   Para produção, use o Client ID do projeto "Jarvi App Production"');

console.log('\n📝 Como verificar:');
console.log('1. Vá para APIs & Services > Credentials');
console.log('2. Procure pelo Client ID acima');
console.log('3. Se não encontrar, mude de projeto e procure novamente');

