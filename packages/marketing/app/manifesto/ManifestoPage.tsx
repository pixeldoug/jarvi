'use client';

import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import styles from './ManifestoPage.module.css';
import { Button } from '../components/Button/Button';
import { CurveDivider } from '../components/CurveDivider/CurveDivider';
import { APP_URL, withAttribution } from '../lib/appLinks';
import { persistAttribution } from '../lib/attribution';
import { trackLead } from '../lib/metaPixelBootstrap';

const assets = {
  closingBg: '/assets/images/cta-bg.avif',
  logo: '/assets/icons/logo-icon.svg',
};

type ManifestoPageProps = {
  initialLoginHref?: string;
  initialSignupHref?: string;
};

export default function ManifestoPage({
  initialLoginHref = `${APP_URL}/`,
  initialSignupHref = `${APP_URL}/criar-conta`,
}: ManifestoPageProps) {
  const posthog = usePostHog();
  const [loginHref, setLoginHref] = useState(initialLoginHref);
  const [signupHref, setSignupHref] = useState(initialSignupHref);

  useEffect(() => {
    persistAttribution();
    setLoginHref(withAttribution(`${APP_URL}/`));
    setSignupHref(withAttribution(`${APP_URL}/criar-conta`));
  }, []);

  const goAttributed = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    location: 'manifesto_navbar' | 'manifesto_cta' | 'login',
  ) => {
    if (location !== 'login') {
      posthog?.capture('cta_clicked', { location }, { send_instantly: true });
      trackLead(location);
    }

    const url = withAttribution(event.currentTarget.href);
    event.currentTarget.href = url;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    window.location.assign(url);
  };

  return (
    <main className={styles.page}>
      {/* Navbar */}
      <div className={`${styles.navWrapper} ${styles.reveal} ${styles.revealDelay1}`}>
        <nav className={styles.navBar}>
          <Link href="/" className={styles.brandRow} aria-label="Jarvi – página inicial">
            <img src={assets.logo} alt="" aria-hidden="true" width={22} height={25} />
            <span>Jarvi</span>
          </Link>
          <div className={styles.navActions}>
            <Button href="/manifesto" variant="ghost" size="default" aria-current="page">
              Manifesto
            </Button>
            <Button href={loginHref} variant="ghost" size="default" onClick={(event) => goAttributed(event, 'login')}>
              Login
            </Button>
            <Button
              href={signupHref}
              variant="primary"
              size="default"
              onClick={(event) => goAttributed(event, 'manifesto_navbar')}
            >
              Criar conta
            </Button>
          </div>
        </nav>
      </div>

      {/* Manifesto */}
      <article className={`${styles.article} ${styles.reveal} ${styles.revealDelay2}`}>
        <h1 className={styles.title}>Como a Jarvi foi desenvolvida</h1>
        <p className={styles.byline}>
          <strong className={styles.bylineAuthor}>Doug Henrique</strong>
          <time dateTime="2026-10" className={styles.bylineDate}>
            Outubro de 2026
          </time>
        </p>

        <p>
          Estou construindo a Jarvi desde agosto de 2025, tendo trabalhado como designer em algumas
          das maiores empresas de tecnologia dos Estados Unidos.
        </p>
        <p>
          Por vezes, cheguei a ter até três trabalhos em tempo integral ao mesmo tempo. E sei muito
          bem que não há nada pior do que não ter controle sobre a vida pessoal além do trabalho.
        </p>
        <p>
          Equilibrar os dois não é fácil. Depois de me ver em uma situação de algemas de ouro,
          ganhando salários de seis dígitos por mês, mas preso ao trabalho, decidi retomar o controle
          da minha vida pessoal.
        </p>
        <p>
          E tudo começou junto com a Jarvi: uma tentativa de tirar as coisas pessoais da minha
          cabeça, para que elas ganhassem visibilidade e importância na minha vida. Assim, as coisas
          foram ficando mais claras.
        </p>

        <h2 lang="en" className={styles.manifestoTitle}>
          Make room for your life.
        </h2>
        <p className={styles.lead}>
          Passamos boa parte dos nossos dias cercados de ferramentas que nos ajudam a organizar o
          trabalho, cumprir prazos, acompanhar projetos e entregar resultados.
        </p>
        <p>
          Mas, quando se trata da nossa própria vida, ainda dependemos da memória, de anotações
          espalhadas por diferentes aplicativos e de lembretes que aprendemos a ignorar.
        </p>
        <p>
          Uma consulta que precisamos marcar. Um documento para renovar. Algo em casa que precisa
          ser resolvido. Os planos que continuamos adiando.
        </p>
        <p>
          Pequenas responsabilidades que se acumulam silenciosamente, até se tornarem preocupações.
        </p>
        <p>
          E, enquanto o trabalho ocupa grande parte da nossa atenção, nossa vida pessoal acaba
          ficando para depois.
        </p>
        <p>
          Não porque seja menos importante. Mas porque, muitas vezes, é ela que recebe apenas o
          tempo e a energia que sobram.
        </p>

        <p className={styles.belief}>
          <strong className={styles.beliefText}>Acredito que deveria ser diferente.</strong>
        </p>

        <p>
          Nossa vida não acontece em listas perfeitamente organizadas. Lembramos de algo no meio de
          uma reunião, recebemos uma mensagem que exige alguma ação ou pensamos em um plano
          enquanto estamos ocupados com outra coisa.
        </p>
        <p>Nem sempre podemos resolver tudo naquele momento. E nem deveríamos precisar.</p>
        <p>
          O problema é que, quando finalmente encontramos tempo para cuidar dessas coisas, muitas
          já foram esquecidas. Outras estão espalhadas entre conversas, e-mails, calendários e
          aplicativos que nem lembramos de abrir.
        </p>
        <p>E mesmo quando conseguimos reunir tudo, ainda precisamos decidir por onde começar.</p>

        <p className={styles.belief}>
          <strong className={styles.beliefText}>
            Acredito que cuidar da própria vida não deveria exigir tanto esforço para
            simplesmente lembrar do que precisa ser feito.
          </strong>
        </p>

        <p>É por isso que estou criando a Jarvi.</p>
        <p>
          Uma experiência que combina inteligência artificial e design para ajudar você a capturar
          o que passa pela sua cabeça, reunir o que está espalhado e transformar intenções em ações
          concretas.
        </p>
        <p>
          A Jarvi ajuda você a guardar aquilo que não pode resolver agora, sem precisar continuar
          pensando nisso.
        </p>
        <p>
          E, naqueles raros momentos em que você consegue parar para olhar para a própria vida,
          ajuda a entender o que merece atenção, definir prioridades e decidir por onde começar.
        </p>
        <p>
          Porque nem tudo é urgente. Nem tudo precisa ser feito hoje. E saber o que pode esperar
          também faz parte de cuidar da própria vida.
        </p>
        <p>Mas sei que nem todas as responsabilidades começam com um pensamento seu.</p>
        <p>
          Algumas chegam por mensagens. Outras aparecem em e-mails, compromissos e conversas que
          fazem parte da sua rotina.
        </p>
        <p>
          Por isso, estou construindo a Jarvi para se conectar às ferramentas que você já
          utiliza, ajudando a identificar e reunir o que importa, com você no controle do que ela
          pode acessar.
        </p>
        <p>Sem exigir que você acompanhe tudo o tempo inteiro.</p>

        <p className={styles.belief}>
          <strong className={styles.beliefText}>
            Acredito que a tecnologia deveria se adaptar à sua vida, e não o contrário.
          </strong>
        </p>

        <p>Isso também significa liberdade para escolher como e onde você quer usá-la.</p>
        <p>
          A Jarvi pode ter seu próprio espaço, mas não quero que sua vida fique presa a mais um
          aplicativo.
        </p>
        <p>
          Quero que suas responsabilidades, suas prioridades e o contexto que você constrói
          possam acompanhar você entre diferentes ferramentas e assistentes de inteligência
          artificial.
        </p>
        <p>
          As ferramentas vão mudar. Os assistentes também. Mas o contexto da sua vida deve
          continuar sendo seu.
        </p>
        <p>
          E, acima de tudo, não acredito que a resposta seja transformar a vida pessoal em mais
          uma jornada de produtividade.
        </p>
        <p>
          Não quero que você passe mais tempo organizando tarefas, acompanhando listas ou
          tentando dar conta de tudo.
        </p>
        <p>Quero justamente o contrário.</p>
        <p>
          Que você tenha menos coisas ocupando sua cabeça. Mais clareza para decidir o que importa.
          E mais liberdade para dedicar seu tempo e sua atenção àquilo que realmente quer viver.
        </p>
        <p>A Jarvi não vai viver sua vida por você. Nem decidir o que deve ser importante.</p>
        <p>
          Mas pode ajudar a garantir que as pequenas responsabilidades do dia a dia não continuem
          roubando o espaço das coisas que realmente importam.
        </p>
        <p>Porque a vida pessoal não deveria acontecer apenas no tempo que sobra.</p>

        <p lang="en" className={styles.belief}>
          <strong className={styles.beliefText}>Your life deserves attention, too.</strong>
        </p>
      </article>

      {/* Closing */}
      <section className={styles.closingSection}>
        <img src={assets.closingBg} alt="" aria-hidden="true" className={styles.closingBgImage} loading="lazy" />
        <div className={styles.closingBgBlur} />
        <div className={styles.closingBgDetailTop} aria-hidden="true">
          <CurveDivider className={styles.closingBgDetailImg} />
        </div>

        <div className={styles.closingContent}>
          <h2 className={styles.closingTitle}>Pronto para experimentar?</h2>
          <p className={styles.closingDescription}>
            Seja um dos primeiros a testar a Jarvi e contribuir com feedbacks
          </p>
          <Button
            href={signupHref}
            variant="primary"
            size="lg"
            onClick={(event) => goAttributed(event, 'manifesto_cta')}
          >
            Criar conta
          </Button>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogoBox}>
              <img src={assets.logo} alt="" aria-hidden="true" width={22} height={25} />
            </div>
            <span>Jarvi</span>
          </div>
          <div className={styles.footerLinks}>
            <p className={styles.footerLegal}>
              2026 - Uma empresa desenvolvida por{' '}
              <a href="https://strides.digital" target="_blank" rel="noreferrer">
                Strides Digital
              </a>
            </p>
            <Link href="/manifesto" className={styles.footerLink} aria-current="page">
              Manifesto
            </Link>
            <Link href="/termos-de-uso" className={styles.footerLink}>
              Termos de Uso
            </Link>
            <Link href="/politica-de-privacidade" className={styles.footerLink}>
              Política de Privacidade
            </Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
