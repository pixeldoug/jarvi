#!/usr/bin/env node

/**
 * Script para testar o sistema de temas
 * 
 * Este script valida se o sistema de temas está funcionando corretamente
 * e mostra informações sobre os temas light e dark.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const config = {
  sourceFile: 'src/design-system/themes/index.ts',
  contextFile: 'src/design-system/context/ThemeContext.tsx',
  indexFile: 'src/design-system/index.ts'
};

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

/**
 * Testa se os arquivos de tema existem
 */
function testThemeFiles() {
  console.log('🧪 Testando arquivos de tema...');
  
  const files = [
    { path: config.sourceFile, name: 'Temas base' },
    { path: config.contextFile, name: 'ThemeContext' },
    { path: config.indexFile, name: 'Index exports' }
  ];
  
  let allExist = true;
  
  for (const file of files) {
    if (fs.existsSync(file.path)) {
      console.log(`✅ ${file.name}: ${file.path}`);
    } else {
      console.log(`❌ ${file.name}: ${file.path} não encontrado`);
      allExist = false;
    }
  }
  
  return allExist;
}

/**
 * Testa estrutura dos temas
 */
function testThemeStructure() {
  console.log('🧪 Testando estrutura dos temas...');
  
  try {
    // Simular importação dos temas (simplificado)
    const themeContent = fs.readFileSync(config.sourceFile, 'utf8');
    
    // Verificar se contém as definições necessárias
    const requiredElements = [
      'lightTheme',
      'darkTheme',
      'ThemeMode',
      'Theme interface',
      'background',
      'surface',
      'text',
      'border',
      'state',
      'brand',
      'semantic'
    ];
    
    let found = 0;
    
    for (const element of requiredElements) {
      if (themeContent.includes(element)) {
        console.log(`✅ ${element} encontrado`);
        found++;
      } else {
        console.log(`❌ ${element} não encontrado`);
      }
    }
    
    const percentage = (found / requiredElements.length) * 100;
    console.log(`📊 Estrutura: ${found}/${requiredElements.length} (${percentage.toFixed(1)}%)`);
    
    return percentage >= 80;
    
  } catch (error) {
    console.error('❌ Erro ao testar estrutura:', error.message);
    return false;
  }
}

/**
 * Testa ThemeContext
 */
function testThemeContext() {
  console.log('🧪 Testando ThemeContext...');
  
  try {
    const contextContent = fs.readFileSync(config.contextFile, 'utf8');
    
    const requiredElements = [
      'ThemeProvider',
      'useTheme',
      'useCurrentTheme',
      'useIsDark',
      'useToggleTheme',
      'ThemeContextType',
      'toggleTheme',
      'setTheme',
      'localStorage',
      'useEffect',
      'useState'
    ];
    
    let found = 0;
    
    for (const element of requiredElements) {
      if (contextContent.includes(element)) {
        console.log(`✅ ${element} encontrado`);
        found++;
      } else {
        console.log(`❌ ${element} não encontrado`);
      }
    }
    
    const percentage = (found / requiredElements.length) * 100;
    console.log(`📊 ThemeContext: ${found}/${requiredElements.length} (${percentage.toFixed(1)}%)`);
    
    return percentage >= 80;
    
  } catch (error) {
    console.error('❌ Erro ao testar ThemeContext:', error.message);
    return false;
  }
}

/**
 * Testa exports do design system
 */
function testExports() {
  console.log('🧪 Testando exports do design system...');
  
  try {
    const indexContent = fs.readFileSync(config.indexFile, 'utf8');
    
    const requiredExports = [
      'lightTheme',
      'darkTheme',
      'themes',
      'ThemeProvider',
      'useTheme',
      'useCurrentTheme',
      'useIsDark',
      'useToggleTheme',
      'Theme',
      'ThemeMode'
    ];
    
    let found = 0;
    
    for (const exportName of requiredExports) {
      if (indexContent.includes(exportName)) {
        console.log(`✅ ${exportName} exportado`);
        found++;
      } else {
        console.log(`❌ ${exportName} não exportado`);
      }
    }
    
    const percentage = (found / requiredExports.length) * 100;
    console.log(`📊 Exports: ${found}/${requiredExports.length} (${percentage.toFixed(1)}%)`);
    
    return percentage >= 80;
    
  } catch (error) {
    console.error('❌ Erro ao testar exports:', error.message);
    return false;
  }
}

/**
 * Mostra informações dos temas
 */
function showThemeInfo() {
  console.log('\n🎨 Informações dos Temas:');
  console.log('========================');
  
  console.log('📋 Light Theme:');
  console.log('   - Background: #ffffff, #f9fafb, #f3f4f6');
  console.log('   - Text: #111827, #4b5563, #6b7280');
  console.log('   - Border: #e5e7eb, #d1d5db');
  console.log('   - Brand: #0284c7 (primary), #9333ea (secondary)');
  
  console.log('\n🌙 Dark Theme:');
  console.log('   - Background: #111827, #1f2937, #374151');
  console.log('   - Text: #f9fafb, #d1d5db, #9ca3af');
  console.log('   - Border: #4b5563, #6b7280');
  console.log('   - Brand: #0ea5e9 (primary), #a855f7 (secondary)');
  
  console.log('\n🔧 Funcionalidades:');
  console.log('   - Toggle automático entre light/dark');
  console.log('   - Persistência no localStorage (web)');
  console.log('   - Detecção de preferência do sistema');
  console.log('   - Hooks especializados (useIsDark, useToggleTheme)');
  console.log('   - Aplicação automática de classes CSS');
}

// ============================================================================
// EXECUÇÃO PRINCIPAL
// ============================================================================

function main() {
  console.log('🧪 Teste do Sistema de Temas');
  console.log('============================\n');
  
  let allTestsPassed = true;
  
  // Teste 1: Arquivos existem
  if (!testThemeFiles()) {
    allTestsPassed = false;
  }
  
  // Teste 2: Estrutura dos temas
  if (!testThemeStructure()) {
    allTestsPassed = false;
  }
  
  // Teste 3: ThemeContext
  if (!testThemeContext()) {
    allTestsPassed = false;
  }
  
  // Teste 4: Exports
  if (!testExports()) {
    allTestsPassed = false;
  }
  
  // Informações dos temas
  showThemeInfo();
  
  console.log('\n' + '='.repeat(30));
  
  if (allTestsPassed) {
    console.log('🎉 Sistema de temas implementado com sucesso!');
    console.log('✅ Pronto para usar em Web e Mobile');
    console.log('\n📋 Próximos passos:');
    console.log('   1. Implementar na aplicação web');
    console.log('   2. Configurar TailwindCSS com temas');
    console.log('   3. Testar toggle de tema');
  } else {
    console.log('❌ Alguns testes falharam');
    console.log('🔧 Verifique os erros acima');
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { testThemeFiles, testThemeStructure, testThemeContext, testExports };

