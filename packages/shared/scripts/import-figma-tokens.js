#!/usr/bin/env node

/**
 * Script para importar tokens exportados do Design Tokens Manager
 * 
 * Este script importa um arquivo JSON exportado do Design Tokens Manager
 * e o converte para o formato usado no código.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const config = {
  inputFile: process.argv[2] || 'figma-export.json',
  outputFile: 'dist/tokens/design-tokens-standard.json',
  backupFile: 'dist/tokens/design-tokens-standard.backup.json'
};

// ============================================================================
// FUNÇÕES PRINCIPAIS
// ============================================================================

/**
 * Cria backup do arquivo atual
 */
function createBackup() {
  if (fs.existsSync(config.outputFile)) {
    fs.copyFileSync(config.outputFile, config.backupFile);
    console.log('✅ Backup criado:', config.backupFile);
  }
}

/**
 * Valida se o arquivo de entrada existe
 */
function validateInputFile() {
  if (!fs.existsSync(config.inputFile)) {
    console.error('❌ Arquivo de entrada não encontrado:', config.inputFile);
    console.log('💡 Uso: node scripts/import-from-figma-export.js [arquivo.json]');
    process.exit(1);
  }
}

/**
 * Importa tokens do arquivo exportado do Figma
 */
function importTokens() {
  try {
    console.log('🔄 Importando tokens do arquivo:', config.inputFile);
    
    // Ler arquivo exportado
    const exportedTokens = JSON.parse(fs.readFileSync(config.inputFile, 'utf8'));
    
    // Validar estrutura básica
    if (!exportedTokens || typeof exportedTokens !== 'object') {
      throw new Error('Arquivo JSON inválido');
    }
    
    // Salvar tokens importados
    fs.writeFileSync(config.outputFile, JSON.stringify(exportedTokens, null, 2));
    
    console.log('✅ Tokens importados com sucesso!');
    console.log('📁 Arquivo salvo em:', config.outputFile);
    
    // Mostrar estatísticas
    const stats = getTokenStats(exportedTokens);
    console.log('📊 Estatísticas:');
    console.log(`   - Categorias: ${stats.categories}`);
    console.log(`   - Total de tokens: ${stats.total}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao importar tokens:', error.message);
    return false;
  }
}

/**
 * Calcula estatísticas dos tokens
 */
function getTokenStats(tokens) {
  let categories = 0;
  let total = 0;
  
  function countTokens(obj, depth = 0) {
    if (typeof obj === 'object' && obj !== null) {
      if (depth === 0) {
        categories = Object.keys(obj).length;
      }
      
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && value.$type && value.$value) {
          total++;
        } else if (typeof value === 'object') {
          countTokens(value, depth + 1);
        }
      }
    }
  }
  
  countTokens(tokens);
  return { categories, total };
}

/**
 * Restaura backup em caso de erro
 */
function restoreBackup() {
  if (fs.existsSync(config.backupFile)) {
    fs.copyFileSync(config.backupFile, config.outputFile);
    console.log('🔄 Backup restaurado');
  }
}

// ============================================================================
// EXECUÇÃO PRINCIPAL
// ============================================================================

function main() {
  console.log('🎨 Importador de Tokens do Figma');
  console.log('================================');
  
  // Validar arquivo de entrada
  validateInputFile();
  
  // Criar backup
  createBackup();
  
  // Importar tokens
  const success = importTokens();
  
  if (!success) {
    restoreBackup();
    process.exit(1);
  }
  
  console.log('🎉 Importação concluída com sucesso!');
  console.log('');
  console.log('📋 Próximos passos:');
  console.log('   1. Execute: npm run build');
  console.log('   2. Teste os tokens no projeto');
  console.log('   3. Se tudo estiver ok, delete o backup:', config.backupFile);
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { importTokens, getTokenStats };
