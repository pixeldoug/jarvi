import { Chip } from '../../../ui';
import type { ChatMode } from '../../../../hooks/useChatStream';
import styles from './AIChatPanel.module.css';

const TASK_SKILLS = [
  'Detalhar tarefa',
  'Dividir em subtarefas',
  'Melhorar descrição',
  'Revisar ortografia',
  'Sugerir categoria',
];

const GENERAL_SKILLS = [
  'Planejar meu dia',
  'O que fazer agora?',
  'Capturar ideia',
  'Estou atrasado?',
  'Resumir minha semana',
];

const NOTE_SKILLS = [
  'Criar tarefas dos próximos passos',
  'Quais foram as decisões?',
  'Resumir em 3 tópicos',
  'O que ficou em aberto?',
];

const SKILLS_BY_MODE: Record<ChatMode, string[]> = {
  task: TASK_SKILLS,
  general: GENERAL_SKILLS,
  note: NOTE_SKILLS,
};

interface SkillChipsProps {
  mode: ChatMode;
  onSelect: (skill: string) => void;
}

export function SkillChips({ mode, onSelect }: SkillChipsProps) {
  const skills = SKILLS_BY_MODE[mode];

  return (
    <div className={styles.skillChips}>
      {skills.map((skill) => (
        <Chip
          key={skill}
          label={skill}
          size="medium"
          interactive
          onClick={() => onSelect(skill)}
        />
      ))}
    </div>
  );
}
