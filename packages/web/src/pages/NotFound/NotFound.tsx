import { Link } from 'react-router-dom';
import { Logo } from '../../components/ui/Logo';
import { useAuth } from '../../contexts/AuthContext';
import styles from './NotFound.module.css';

export function NotFound() {
  const { user } = useAuth();
  const homeHref = user ? '/tasks' : '/login';

  return (
    <div className={styles.container}>
      <Logo className={styles.logo} />
      <h1 className={styles.title}>Página não encontrada</h1>
      <p className={styles.description}>
        Esse endereço não existe ou foi movido. Volte para a Jarvi e continue de onde parou.
      </p>
      <Link to={homeHref} className={styles.homeLink}>
        {user ? 'Ir para tarefas' : 'Ir para o login'}
      </Link>
    </div>
  );
}

export default NotFound;
