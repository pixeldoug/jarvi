'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { useEffect } from 'react';
import styles from './page.module.css';
import { FeatureButtonRail, type FeatureKey } from '../components/FeatureButtonRail';

const assets = {
  desktopTexture: 'https://www.figma.com/api/mcp/asset/18e68fa9-57b4-4051-9838-6440491c0f7a',
  bgBlob: 'https://www.figma.com/api/mcp/asset/eafb57fe-0d65-4415-9b98-3c1ee049b156',
  betaIcon: 'https://www.figma.com/api/mcp/asset/2f870a8b-fbf5-4568-98ab-af42b2c39cc0',
  logoDark: 'https://www.figma.com/api/mcp/asset/7e6b98d7-5ccd-476d-bd04-073f0d0192d7',
  logoLight: 'https://www.figma.com/api/mcp/asset/bcf63577-79b0-40f2-a6d8-2f6e6acbc625',
};

const LOOP_MS = 5000;

const showcaseThemeByFeature: Record<
  FeatureKey,
  { surface: string; desktopCard: string; mobileCard: string }
> = {
  whatsapp: {
    surface: '#ceddc8',
    desktopCard: '#798c76',
    mobileCard: '#333c30',
  },
  email: {
    surface: '#b2d0da',
    desktopCard: '#6f96a6',
    mobileCard: '#407082',
  },
  calendar: {
    surface: '#c6bde6',
    desktopCard: '#9488bd',
    mobileCard: '#544d78',
  },
  wand: {
    surface: '#d4b9d8',
    desktopCard: '#b291ba',
    mobileCard: '#85658c',
  },
  cards: {
    surface: '#e4c4c4',
    desktopCard: '#cda7a7',
    mobileCard: '#a78383',
  },
  checks: {
    surface: '#ddd1b3',
    desktopCard: '#cbbf9d',
    mobileCard: '#a99e84',
  },
};

const featureCopyByFeature: Record<FeatureKey, { title: string; description: string }> = {
  whatsapp: {
    title: 'Crie tarefas pelo Whatsapp',
    description:
      'Envie textos, áudios ou documentos e a Jarvi entende o contexto e cria a tarefa para você.',
  },
  email: {
    title: 'Transforme e-mails em tarefas',
    description:
      'Encaminhe um e-mail e a Jarvi extrai os pontos de ação para você acompanhar tudo em um só lugar.',
  },
  calendar: {
    title: 'Integração com calendário',
    description:
      'Conecte seus compromissos e receba sugestões de tarefas alinhadas com sua agenda e prioridades.',
  },
  wand: {
    title: 'Edite com ajuda de IA',
    description:
      'Ajuste títulos, descrições e contexto das tarefas com sugestões inteligentes em poucos toques.',
  },
  cards: {
    title: 'Visualize em diferentes formatos',
    description:
      'Alterne entre visões para organizar melhor o trabalho e enxergar o que é prioridade no dia.',
  },
  checks: {
    title: 'Conclua com mais clareza',
    description:
      'Acompanhe o progresso das tarefas e mantenha o foco no que já foi finalizado e no que falta.',
  },
};

export default function FigmaMarketingPage() {
  const [activeFeature, setActiveFeature] = useState<FeatureKey>('whatsapp');
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isCtaInView, setIsCtaInView] = useState(false);
  const ctaSectionRef = useRef<HTMLElement | null>(null);
  const activeTheme = showcaseThemeByFeature[activeFeature];
  const activeCopy = featureCopyByFeature[activeFeature];
  const progress = elapsedMs / LOOP_MS;

  useEffect(() => {
    if (!isPlaying) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      setElapsedMs((previous) => (previous + delta) % LOOP_MS);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  useEffect(() => {
    const section = ctaSectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setIsCtaInView(true);
        observer.disconnect();
      },
      {
        threshold: 0.2,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const desktopOffset = Math.sin(progress * Math.PI * 2) * 8;
  const mobileOffset = Math.cos(progress * Math.PI * 2) * 10;
  const desktopScale = 1 + Math.sin(progress * Math.PI * 2) * 0.006;
  const mobileScale = 1 + Math.cos(progress * Math.PI * 2) * 0.008;

  return (
    <main className={styles.page}>
      <img src={assets.desktopTexture} alt="" aria-hidden="true" className={styles.pageTexture} />

      <section className={styles.heroWrapper}>
        <div className={styles.heroCard}>
          <img src={assets.bgBlob} alt="" aria-hidden="true" className={styles.heroBlob} />

          <header className={`${styles.navWrapper} ${styles.reveal} ${styles.revealDelay1}`}>
            <div className={styles.navBar}>
              <div className={styles.brandRow}>
                <img src={assets.logoDark} alt="" aria-hidden="true" />
                <span>Jarvi</span>
              </div>
              <div className={styles.navActions}>
                <a href="#acesso-antecipado" className={styles.navGhostButton}>
                  Solicitar Acesso
                </a>
                <a href="https://app.jarvi.life/login" className={styles.navPrimaryButton}>
                  Login
                </a>
              </div>
            </div>
          </header>

          <div className={styles.heroContent}>
            <div className={`${styles.betaTag} ${styles.reveal} ${styles.revealDelay2}`}>
              <img src={assets.betaIcon} alt="" aria-hidden="true" />
              <span>VERSÃO BETA</span>
            </div>

            <h1 className={`${styles.heroTitle} ${styles.reveal} ${styles.revealDelay3}`}>
              Que tal uma mãozinha com as suas tarefas do dia a dia?
            </h1>

            <p className={`${styles.heroDescription} ${styles.reveal} ${styles.revealDelay4}`}>
              Jarvi é um app inteligente que te ajuda a organizar tarefas complexas e também aquelas
              pequenas que são importantes
            </p>

            <div className={`${styles.featureLayout} ${styles.reveal} ${styles.revealDelay5}`}>
              <div className={styles.featureRailSlot}>
                <FeatureButtonRail
                  activeFeature={activeFeature}
                  onActiveFeatureChange={setActiveFeature}
                />
              </div>

              <div
                className={styles.showcase}
                style={
                  {
                    '--showcase-surface': activeTheme.surface,
                    '--showcase-desktop-card': activeTheme.desktopCard,
                    '--showcase-mobile-card': activeTheme.mobileCard,
                  } as CSSProperties
                }
              >
                <div
                  className={styles.showcaseDesktopCard}
                  style={{
                    transform: `translateY(${desktopOffset}px) scale(${desktopScale})`,
                  }}
                />
                <div
                  className={styles.showcaseMobileCard}
                  style={{
                    transform: `translateY(${mobileOffset}px) scale(${mobileScale})`,
                  }}
                />
                <button
                  type="button"
                  className={styles.pauseButton}
                  onClick={() => setIsPlaying((previous) => !previous)}
                  aria-label={isPlaying ? 'Pausar animação' : 'Reproduzir animação'}
                >
                  <span className={isPlaying ? styles.pauseGlyph : styles.playGlyph} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className={`${styles.featureCopy} ${styles.reveal} ${styles.revealDelay6}`}>
              <h2 key={`feature-title-${activeFeature}`} className={styles.featureCopyTitleAnimated}>
                {activeCopy.title}
              </h2>
              <p
                key={`feature-description-${activeFeature}`}
                className={styles.featureCopyDescriptionAnimated}
              >
                {activeCopy.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        ref={ctaSectionRef}
        className={`${styles.ctaSection} ${isCtaInView ? `${styles.reveal} ${styles.revealDelay7}` : styles.revealHidden}`}
        id="acesso-antecipado"
      >
        <div className={`${styles.ctaContent} ${isCtaInView ? `${styles.reveal} ${styles.revealDelay8}` : styles.revealHidden}`}>
          <h2>Garanta seu acesso antecipado</h2>
          <p>Seja um dos primeiros a testar a Jarvi e contribuir com feedbacks</p>
          <a href="#acesso-antecipado" className={styles.ctaButton}>
            Solicitar Acesso Antecipado
          </a>
          <p className={styles.ctaLoginHint}>
            Já tem acesso?{' '}
            <a href="https://app.jarvi.life/login" target="_blank" rel="noreferrer">
              Faça login
            </a>
          </p>
        </div>

        <footer className={`${styles.footer} ${isCtaInView ? `${styles.reveal} ${styles.revealDelay9}` : styles.revealHidden}`}>
          <div className={styles.footerBrand}>
            <img src={assets.logoLight} alt="" aria-hidden="true" />
            <span>Jarvi</span>
          </div>
          <div className={styles.footerLinks}>
            <p className={styles.footerLegal}>
              2026 - Uma empresa desenvolvida por{' '}
              <a href="https://strides.digital" target="_blank" rel="noreferrer">
                Strides Digital
              </a>
            </p>
            <a href="#" className={styles.footerTerms}>
              Termos de Serviço
            </a>
            <a href="#" className={styles.footerPrivacy}>
              Política de Privacidade
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}
