#!/usr/bin/env node

/**
 * Script para testar design tokens
 * 
 * Este script valida se os design tokens estão funcionando corretamente
 * e mostra estatísticas básicas.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const config = {
  tokensFile: 'dist/tokens/design-tokens-standard.json',
  sourceFile: 'src/design-system/tokens/index.ts'
};

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

/**
 * Testa se o arquivo de tokens gerado existe
 */
function testGeneratedTokens() {
  console.log('🧪 Testando tokens gerados...');
  
  if (!fs.existsSync(config.tokensFile)) {
    console.error('❌ Arquivo de tokens não encontrado:', config.tokensFile);
    console.log('💡 Execute: npm run generate:design-tokens');
    return false;
  }
  
  try {
    const tokens = JSON.parse(fs.readFileSync(config.tokensFile, 'utf8'));
    console.log('✅ Arquivo de tokens válido');
    return tokens;
  } catch (error) {
    console.error('❌ Erro ao ler tokens:', error.message);
    return false;
  }
}

/**
 * Testa se o arquivo fonte existe
 */
function testSourceTokens() {
  console.log('🧪 Testando arquivo fonte...');
  
  if (!fs.existsSync(config.sourceFile)) {
    console.error('❌ Arquivo fonte não encontrado:', config.sourceFile);
    return false;
  }
  
  console.log('✅ Arquivo fonte encontrado');
  return true;
}

/**
 * Valida estrutura dos tokens
 */
function validateTokenStructure(tokens) {
  console.log('🧪 Validando estrutura dos tokens...');
  
  const requiredCategories = ['colors', 'typography', 'spacing', 'effects', 'animation', 'zIndex'];
  const missing = requiredCategories.filter(cat => !tokens[cat]);
  
  if (missing.length > 0) {
    console.error('❌ Categorias faltando:', missing.join(', '));
    return false;
  }
  
  console.log('✅ Estrutura válida');
  return true;
}

/**
 * Conta tokens por categoria
 */
function countTokens(tokens) {
  console.log('🧪 Contando tokens...');
  
  const stats = {};
  
  function countInObject(obj, path = '') {
    let count = 0;
    
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        if (value.$type && value.$value) {
          count++;
        } else {
          count += countInObject(value, `${path}.${key}`);
        }
      }
    }
    
    return count;
  }
  
  for (const [category, categoryTokens] of Object.entries(tokens)) {
    stats[category] = countInObject(categoryTokens);
  }
  
  return stats;
}

/**
 * Testa valores específicos
 */
function testSpecificValues(tokens) {
  console.log('🧪 Testando valores específicos...');
  
  const tests = [
    {
      path: 'colors.primary.600',
      expected: '#0284c7',
      description: 'Cor primária principal'
    },
    {
      path: 'spacing.md',
      expected: '16px',
      description: 'Espaçamento médio'
    },
    {
      path: 'typography.fontSize.lg',
      expected: '18px',
      description: 'Tamanho de fonte grande'
    }
  ];
  
  let passed = 0;
  
  for (const test of tests) {
    const keys = test.path.split('.');
    let value = tokens;
    
    for (const key of keys) {
      value = value?.[key];
    }
    
    if (value?.$value === test.expected) {
      console.log(`✅ ${test.description}: ${test.expected}`);
      passed++;
    } else {
      console.log(`❌ ${test.description}: esperado ${test.expected}, obtido ${value?.$value}`);
    }
  }
  
  return passed === tests.length;
}

/**
 * Mostra estatísticas finais
 */
function showStats(stats) {
  console.log('\n📊 Estatísticas dos Tokens:');
  console.log('========================');
  
  const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
  
  for (const [category, count] of Object.entries(stats)) {
    console.log(`${category.padEnd(15)}: ${count.toString().padStart(3)} tokens`);
  }
  
  console.log('─'.repeat(30));
  console.log(`Total: ${total} tokens`);
}

// ============================================================================
// EXECUÇÃO PRINCIPAL
// ============================================================================

function main() {
  console.log('🧪 Teste do Design System');
  console.log('========================\n');
  
  let allTestsPassed = true;
  
  // Teste 1: Arquivo fonte
  if (!testSourceTokens()) {
    allTestsPassed = false;
  }
  
  // Teste 2: Tokens gerados
  const tokens = testGeneratedTokens();
  if (!tokens) {
    allTestsPassed = false;
  }
  
  if (tokens) {
    // Teste 3: Estrutura
    if (!validateTokenStructure(tokens)) {
      allTestsPassed = false;
    }
    
    // Teste 4: Valores específicos
    if (!testSpecificValues(tokens)) {
      allTestsPassed = false;
    }
    
    // Estatísticas
    const stats = countTokens(tokens);
    showStats(stats);
  }
  
  console.log('\n' + '='.repeat(30));
  
  if (allTestsPassed) {
    console.log('🎉 Todos os testes passaram!');
    console.log('✅ Design System funcionando corretamente');
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

module.exports = { testGeneratedTokens, validateTokenStructure, countTokens };
