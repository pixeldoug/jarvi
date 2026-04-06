/**
 * Detects gender from a Brazilian/Portuguese first name.
 *
 * Strategy:
 * 1. Check known feminine names list
 * 2. Check known masculine names list (catches exceptions like Luca, Joshua)
 * 3. Fallback heuristic: names ending in 'a' → female, otherwise → male
 */

const FEMININE_NAMES = new Set([
  'ana', 'maria', 'julia', 'juliana', 'fernanda', 'amanda', 'patricia',
  'gabriela', 'camila', 'mariana', 'claudia', 'luciana', 'adriana',
  'daniela', 'carolina', 'vanessa', 'natalia', 'isabela', 'isabel',
  'renata', 'leticia', 'aline', 'priscila', 'jessica', 'simone',
  'sandra', 'carla', 'tatiana', 'viviane', 'vivian', 'alice',
  'larissa', 'beatriz', 'bianca', 'bruna', 'carol', 'cintia',
  'cristiane', 'cristina', 'debora', 'denise', 'diane', 'elaine',
  'elisa', 'elizabete', 'fabiana', 'flavia', 'giovana', 'heloisa',
  'ingrid', 'jana', 'janaina', 'joyce', 'karen', 'kelly',
  'laila', 'lara', 'laura', 'leilane', 'ligia', 'luana',
  'luisa', 'luiza', 'lygia', 'manoela', 'manuela', 'marcela',
  'milena', 'monique', 'nadia', 'nathalia', 'nicole', 'noemi',
  'pamela', 'paula', 'poliana', 'rafaela', 'raquel', 'regiane',
  'sabrina', 'samara', 'samira', 'selma', 'silvana', 'silvia',
  'sonia', 'stefanie', 'stefany', 'stella', 'sueli', 'suzana',
  'talia', 'tamara', 'tania', 'thamires', 'thais', 'valentina',
  'veronica', 'vitoria', 'wanda', 'yasmin', 'yolanda',
]);

const MASCULINE_NAMES = new Set([
  'pedro', 'paulo', 'carlos', 'jose', 'joao', 'lucas', 'luca',
  'gabriel', 'rafael', 'daniel', 'marcos', 'marcelo', 'rodrigo',
  'gustavo', 'felipe', 'andre', 'leandro', 'thiago', 'diego',
  'eduardo', 'fernando', 'jorge', 'luiz', 'luis', 'leonardo',
  'alexandre', 'antonio', 'cesar', 'claudio', 'cristiano',
  'davi', 'david', 'douglas', 'edgar', 'edson', 'emerson',
  'evandro', 'fabio', 'fabricio', 'flavio', 'francisco',
  'frederico', 'gilberto', 'guilherme', 'heitor', 'henrique',
  'hudson', 'igor', 'iran', 'israel', 'ivan', 'jadson',
  'jefferson', 'jonatan', 'jonathan', 'jordan', 'jorge',
  'joshua', 'junior', 'kaique', 'kaio', 'kevin', 'kleber',
  'luan', 'lucas', 'luciano', 'luigi', 'luiz', 'manoel',
  'manuel', 'mateus', 'matheus', 'mauro', 'maxwell', 'miguel',
  'murilo', 'natan', 'nathan', 'nelson', 'nicolas', 'nilson',
  'nilton', 'odair', 'oliveira', 'omar', 'pablo', 'patrick',
  'ramon', 'renato', 'renan', 'renato', 'richard', 'roberto',
  'rogerio', 'romulo', 'ronaldo', 'rubens', 'samuel', 'sergio',
  'silvio', 'tomas', 'victor', 'vinicius', 'vitor', 'wagner',
  'walisson', 'wallace', 'wellington', 'wendel', 'wilian',
  'william', 'wilson', 'yago', 'yan', 'yuri',
]);

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getGenderFromName(fullName: string): 'female' | 'male' {
  const firstName = normalize(fullName.trim().split(/\s+/)[0]);

  if (FEMININE_NAMES.has(firstName)) return 'female';
  if (MASCULINE_NAMES.has(firstName)) return 'male';

  return firstName.endsWith('a') ? 'female' : 'male';
}
