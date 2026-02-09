/**
 * Traduções PT-BR para feedback do zxcvbn
 */

// Mapeamento de warnings comuns
const warningTranslations: Record<string, string> = {
  // Padrões comuns
  'Straight rows of keys are easy to guess': 'Sequências de teclas são fáceis de adivinhar',
  'Short keyboard patterns are easy to guess': 'Padrões curtos de teclado são fáceis de adivinhar',
  'Use a longer keyboard pattern with more turns': 'Use um padrão de teclado mais longo',
  
  // Repetições
  'Repeats like "aaa" are easy to guess': 'Repetições como "aaa" são fáceis de adivinhar',
  'Repeats like "abcabcabc" are only slightly harder to guess than "abc"': 'Repetições como "abcabcabc" são apenas um pouco mais difíceis de adivinhar',
  'Avoid repeated words and characters': 'Evite palavras e caracteres repetidos',
  
  // Sequências
  'Sequences like "abc" or "6543" are easy to guess': 'Sequências como "abc" ou "6543" são fáceis de adivinhar',
  'Avoid sequences': 'Evite sequências',
  
  // Datas
  'Recent years are easy to guess': 'Anos recentes são fáceis de adivinhar',
  'Dates are often easy to guess': 'Datas são frequentemente fáceis de adivinhar',
  'Avoid recent years': 'Evite anos recentes',
  'Avoid years that are associated with you': 'Evite anos associados a você',
  'Avoid dates and years that are associated with you': 'Evite datas e anos associados a você',
  
  // Nomes comuns
  'Common names and surnames are easy to guess': 'Nomes e sobrenomes comuns são fáceis de adivinhar',
  'Names and surnames by themselves are easy to guess': 'Nomes e sobrenomes sozinhos são fáceis de adivinhar',
  
  // Palavras comuns
  'This is a top-10 common password': 'Esta é uma das 10 senhas mais comuns',
  'This is a top-100 common password': 'Esta é uma das 100 senhas mais comuns',
  'This is a very common password': 'Esta é uma senha muito comum',
  'This is similar to a commonly used password': 'Esta senha é similar a uma senha comum',
  'A word by itself is easy to guess': 'Uma palavra sozinha é fácil de adivinhar',
  
  // Capitalizações
  'Capitalization doesn\'t help very much': 'Capitalização não ajuda muito',
  'All-uppercase is almost as easy to guess as all-lowercase': 'Tudo em maiúsculas é quase tão fácil quanto tudo em minúsculas',
  'Reversed words aren\'t much harder to guess': 'Palavras invertidas não são muito mais difíceis',
  'Predictable substitutions like "@" instead of "a" don\'t help very much': 'Substituições previsíveis como "@" no lugar de "a" não ajudam muito',
};

// Mapeamento de sugestões comuns
const suggestionTranslations: Record<string, string> = {
  // Adicionar caracteres/palavras
  'Add another word or two. Uncommon words are better.': 'Adicione mais uma ou duas palavras. Palavras incomuns são melhores.',
  'Use a few words, avoid common phrases': 'Use algumas palavras, evite frases comuns',
  'No need for symbols, digits, or uppercase letters': 'Não é necessário símbolos, números ou letras maiúsculas',
  'Use a longer keyboard pattern with more turns': 'Use um padrão de teclado mais longo com mais variações',
  
  // Evitar padrões
  'Avoid repeated words and characters': 'Evite palavras e caracteres repetidos',
  'Avoid sequences': 'Evite sequências',
  'Avoid recent years': 'Evite anos recentes',
  'Avoid years that are associated with you': 'Evite anos associados a você',
  'Avoid dates and years that are associated with you': 'Evite datas e anos associados a você',
  
  // Capitalização
  'Capitalization doesn\'t help very much': 'Capitalização não ajuda muito',
  'All-uppercase is almost as easy to guess as all-lowercase': 'Tudo em maiúsculas é quase tão fácil quanto tudo em minúsculas',
  'Reversed words aren\'t much harder to guess': 'Palavras invertidas não são muito mais difíceis',
  'Predictable substitutions like \'@\' instead of \'a\' don\'t help very much': 'Substituições previsíveis como "@" no lugar de "a" não ajudam muito',
};

/**
 * Traduz um warning do zxcvbn para PT-BR
 */
export const translateWarning = (warning: string | undefined): string | undefined => {
  if (!warning) return undefined;
  return warningTranslations[warning] || warning;
};

/**
 * Traduz sugestões do zxcvbn para PT-BR
 */
export const translateSuggestions = (suggestions: string[]): string[] => {
  return suggestions.map(suggestion => 
    suggestionTranslations[suggestion] || suggestion
  );
};
