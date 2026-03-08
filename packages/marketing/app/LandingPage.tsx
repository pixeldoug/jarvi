'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDots, CardsThree, Checks, EnvelopeSimple, MagicWand } from '@phosphor-icons/react';
import styles from './LandingPage.module.css';
import { Button } from './components/Button';

type FeatureKey = 'whatsapp' | 'email' | 'calendar' | 'wand' | 'cards' | 'checks';

const featureOrder: FeatureKey[] = ['whatsapp', 'email', 'calendar', 'wand', 'cards', 'checks'];

const assets = {
  screenExample: 'https://www.figma.com/api/mcp/asset/4611e27a-5bad-4669-bcc9-ee967d0f93a1',
  showcaseImage: 'https://www.figma.com/api/mcp/asset/35ca0ab5-78dd-4c82-9755-b8f5b1e7b85a',
  ctaBg: 'https://www.figma.com/api/mcp/asset/f417955f-dd0f-4dcc-9a9e-6bec9a3e0371',
  logo: 'https://www.figma.com/api/mcp/asset/78ce3353-b208-4414-8914-10e499580044',
  betaIcon: 'https://www.figma.com/api/mcp/asset/86b96f33-193b-45cc-8ac8-0ba458594665',
  bgDetail: 'https://www.figma.com/api/mcp/asset/b9f2f6e7-4c50-49b8-8bc4-bf25ab86af68',
  bgBlob: 'https://www.figma.com/api/mcp/asset/490a7272-bfdd-400e-80bf-e6553ebdf881',
  whatsappIcon: 'https://www.figma.com/api/mcp/asset/052b1663-1dab-4ebe-a6c2-192510b7f42b',
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

export default function LandingPage() {
  const [activeFeature, setActiveFeature] = useState<FeatureKey>('whatsapp');
  const [isCtaInView, setIsCtaInView] = useState(false);
  const ctaSectionRef = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<FeatureKey, HTMLButtonElement | null>>({
    whatsapp: null,
    email: null,
    calendar: null,
    wand: null,
    cards: null,
    checks: null,
  });
  const activeCopy = featureCopyByFeature[activeFeature];

  useEffect(() => {
    const rail = railRef.current;
    const targetButton = buttonRefs.current[activeFeature];
    if (!rail || !targetButton) return;
    if (rail.scrollWidth <= rail.clientWidth) return;
    targetButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeFeature]);

  useEffect(() => {
    const section = ctaSectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsCtaInView(true);
        observer.disconnect();
      },
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const renderFeatureIcon = (feature: FeatureKey, isActive: boolean) => {
    const size = isActive ? 28 : 24;
    if (feature === 'whatsapp') {
      return (
        <img src={assets.whatsappIcon} alt="" aria-hidden="true" width={size} height={size} />
      );
    }
    const iconProps = { size, weight: 'regular' as const, 'aria-hidden': true as const };
    if (feature === 'email') return <EnvelopeSimple {...iconProps} />;
    if (feature === 'calendar') return <CalendarDots {...iconProps} />;
    if (feature === 'wand') return <MagicWand {...iconProps} />;
    if (feature === 'cards') return <CardsThree {...iconProps} />;
    return <Checks {...iconProps} />;
  };

  return (
    <main className={styles.page}>
      {/* Navbar */}
      <div className={`${styles.navWrapper} ${styles.reveal} ${styles.revealDelay1}`}>
        <nav className={styles.navBar}>
          <div className={styles.brandRow}>
            <img src={assets.logo} alt="" aria-hidden="true" width={22} height={25} />
            <span>Jarvi</span>
          </div>
          <div className={styles.navActions}>
            <Button href="#funcionalidades" variant="ghost" size="default" className={styles.navGhostButton}>
              Funcionalidades
            </Button>
            <Button href="#acesso-antecipado" variant="primary" size="default">
              Solicitar Acesso
            </Button>
          </div>
        </nav>
      </div>

      {/* Hero */}
      <section className={styles.heroSection}>
        <picture className={styles.heroBgPicture}>
          <source srcSet="/hero.avif" type="image/avif" />
          <img
            src="/hero.png"
            alt=""
            aria-hidden="true"
            className={styles.heroBgImage}
          />
        </picture>
        <div className={styles.heroBgBlur} />
        <div className={styles.heroContent}>
          <div className={`${styles.betaTag} ${styles.reveal} ${styles.revealDelay2}`}>
            <img src={assets.betaIcon} alt="" aria-hidden="true" />
            <span>VERSÃO BETA</span>
          </div>
          <div className={`${styles.heroTitleGroup} ${styles.reveal} ${styles.revealDelay3}`}>
            <h1 className={styles.heroTitle}>
              Que tal uma mãozinha para organizar suas tarefas?
            </h1>
            <p className={styles.heroDescription}>
              Jarvi é um app de tarefas com IA e memória inteligente que te ajuda a organizar
              desde pequenas tarefas até as mais complexas.
            </p>
          </div>
        </div>
        <div className={styles.heroBgDetailWrapper} aria-hidden="true">
          <img src={assets.bgDetail} alt="" className={styles.heroBgDetail} />
        </div>
      </section>

      {/* Features */}
      <section className={styles.featuresSection} id="funcionalidades">
        <div className={styles.featuresBlob} aria-hidden="true">
          <img src={assets.bgBlob} alt="" />
        </div>

        <div className={styles.screenFrameReveal}>
          <div className={`${styles.screenFrame} ${styles.reveal} ${styles.revealDelay4}`}>
            <img
              src={assets.screenExample}
              alt="Preview do app Jarvi"
              className={styles.screenFrameImage}
            />
          </div>
        </div>

        <div className={styles.featuresContent}>
          <div className={`${styles.featuresSectionHeader} ${styles.reveal} ${styles.revealDelay5}`}>
            <div className={styles.featuresTag}>
              <span>FUNCIONALIDADES</span>
            </div>
            <h2 className={styles.featuresSectionTitle}>Um app que aprende com você</h2>
            <p className={styles.featuresSectionDescription}>
              Envie textos, áudios ou documentos e a Jarvi entende o contexto e cria a tarefa para
              você.
            </p>
          </div>

          <div className={`${styles.featurePreviewWrapper} ${styles.reveal} ${styles.revealDelay6}`}>
            <div className={styles.showcaseCard}>
              <img
                src={assets.showcaseImage}
                alt=""
                aria-hidden="true"
                className={styles.showcaseImage}
              />
            </div>

            <div className={styles.featureButtonRow} ref={railRef}>
              {featureOrder.map((feature) => {
                const isActive = activeFeature === feature;
                return (
                  <button
                    key={feature}
                    ref={(el) => { buttonRefs.current[feature] = el; }}
                    type="button"
                    className={[
                      styles.featureChip,
                      styles[
                        `feature${feature[0]!.toUpperCase()}${feature.slice(1)}` as keyof typeof styles
                      ],
                      isActive ? styles.featureChipActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setActiveFeature(feature)}
                    aria-pressed={isActive}
                  >
                    <span className={styles.featureChipInner}>
                      {renderFeatureIcon(feature, isActive)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`${styles.featureCopy} ${styles.reveal} ${styles.revealDelay7}`}>
            <h3 key={`title-${activeFeature}`} className={styles.featureCopyTitleAnimated}>
              {activeCopy.title}
            </h3>
            <p key={`desc-${activeFeature}`} className={styles.featureCopyDescriptionAnimated}>
              {activeCopy.description}
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        ref={ctaSectionRef}
        className={`${styles.ctaSection} ${isCtaInView ? `${styles.reveal} ${styles.revealDelay1}` : styles.revealHidden}`}
        id="acesso-antecipado"
      >
        <img src={assets.ctaBg} alt="" aria-hidden="true" className={styles.ctaBgImage} />
        <div className={styles.ctaBgBlur} />
        <div className={styles.ctaBgDetailTop} aria-hidden="true">
          <img src={assets.bgDetail} alt="" className={styles.ctaBgDetailImg} />
        </div>

        <div
          className={`${styles.ctaContent} ${isCtaInView ? `${styles.reveal} ${styles.revealDelay2}` : styles.revealHidden}`}
        >
          <h2>Garanta seu acesso antecipado</h2>
          <p>Seja um dos primeiros a testar a Jarvi e contribuir com feedbacks</p>
          <Button href="#acesso-antecipado" variant="primary" size="lg">
            Solicitar Acesso Antecipado
          </Button>
        </div>

        <footer
          className={`${styles.footer} ${isCtaInView ? `${styles.reveal} ${styles.revealDelay3}` : styles.revealHidden}`}
        >
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
