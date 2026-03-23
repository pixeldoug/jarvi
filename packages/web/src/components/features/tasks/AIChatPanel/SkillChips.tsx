import { Chip } from '../../../ui';
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

interface SkillChipsProps {
  mode: 'task' | 'general';
  onSelect: (skill: string) => void;
}

export function SkillChips({ mode, onSelect }: SkillChipsProps) {
  const skills = mode === 'task' ? TASK_SKILLS : GENERAL_SKILLS;

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
