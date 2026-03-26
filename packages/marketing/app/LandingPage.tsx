'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Brain,
  ChatsTeardrop,
  CirclesFour,
  MagicWand,
  Palette,
  Sparkle,
} from '@phosphor-icons/react';
import { usePostHog } from 'posthog-js/react';
import styles from './LandingPage.module.css';
import { Button } from './components/Button';
import { CurveDivider } from './components/CurveDivider';

type FeatureKey = 'whatsapp' | 'email' | 'calendar' | 'wand' | 'cards' | 'checks';

const featureOrder: FeatureKey[] = ['whatsapp', 'email', 'calendar', 'wand', 'cards', 'checks'];

const assets = {
  screenExample: '/assets/images/screen-demo.avif',
  showcaseImage: '/assets/images/showcase-image.png',
  ctaBg: '/assets/images/cta-bg.png',
  heroBgAvif: '/assets/images/hero.avif',
  heroBgWebp: '/assets/images/hero.webp',
  logo: '/assets/icons/logo-icon.svg',
  whatsappIcon: '/assets/icons/whatsapp-icon.svg',
  bgBlob: '/assets/images/hero-blob.svg',
};

const featureImages: Record<FeatureKey, string> = {
  whatsapp: '/assets/images/whatsapp-integration.png',
  email: '/assets/images/app.png',
  calendar: '/assets/images/memory.avif',
  wand: '/assets/images/ai-mode-jarvi.gif',
  cards: '/assets/images/ai-chat-jarvi.gif',
  checks: '/assets/images/themming-demo.gif',
};

const featureCopyByFeature: Record<FeatureKey, { title: string; description: string }> = {
  whatsapp: {
    title: 'Crie tarefas pelo Whatsapp',
    description:
      'Envie textos, áudios ou documentos e a Jarvi entende o contexto e cria a tarefa para você.',
  },
  email: {
    title: 'Centralize suas tarefas',
    description:
      'Integre suas ferramentas e acompanhe tudo o que precisa fazer em um único lugar, sem perder nada.',
  },
  calendar: {
    title: 'Memória que evolui com você',
    description:
      'A Jarvi aprende com suas interações e com os dados de apps conectados para construir seu contexto.',
  },
  wand: {
    title: 'Do seu jeito, com ou sem IA',
    description:
      'Crie e edite tarefas manualmente ou com ajuda da IA. Você escolhe o que for mais prático.',
  },
  cards: {
    title: 'Organize suas ideias conversando com a Jarvi',
    description:
      'Interaja com a Jarvi para clarear prioridades e transformar pensamentos em ações.',
  },
  checks: {
    title: 'A experiência com a sua cara',
    description:
      'Customize tema e visual para deixar tudo mais leve e agradável no dia a dia.',
  },
};

export default function LandingPage() {
  const posthog = usePostHog();
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
    const targetScrollLeft =
      targetButton.offsetLeft - rail.clientWidth / 2 + targetButton.clientWidth / 2;
    rail.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
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
    const iconProps = { size, weight: 'regular' as const, 'aria-hidden': true as const };
    if (feature === 'whatsapp') {
      return <img src={assets.whatsappIcon} alt="" aria-hidden="true" width={size} height={size} />;
    }
    if (feature === 'email') return <CirclesFour {...iconProps} />;
    if (feature === 'calendar') return <Brain {...iconProps} />;
    if (feature === 'wand') return <MagicWand {...iconProps} />;
    if (feature === 'cards') return <ChatsTeardrop {...iconProps} />;
    return <Palette {...iconProps} />;
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
            <span className={styles.navGhostButton}>
              <Button href="#funcionalidades" variant="ghost" size="default">
                Funcionalidades
              </Button>
            </span>
            <Button
              href="/beta"
              variant="primary"
              size="default"
              onClick={() => posthog?.capture('cta_clicked', { location: 'navbar' })}
            >
              Solicitar Acesso
            </Button>
          </div>
        </nav>
      </div>

      {/* Hero */}
      <section className={styles.heroSection}>
        <picture className={styles.heroBgPicture}>
          <source srcSet={assets.heroBgAvif} type="image/avif" />
          <source srcSet={assets.heroBgWebp} type="image/webp" />
          <img
            src={assets.heroBgWebp}
            alt=""
            aria-hidden="true"
            className={styles.heroBgImage}
          />
        </picture>
        <div className={styles.heroBgBlur} />
        <div className={styles.heroContent}>
          <div className={`${styles.betaTag} ${styles.reveal} ${styles.revealDelay2}`}>
            <Sparkle size={16} weight="fill" aria-hidden="true" />
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
          <CurveDivider className={styles.heroBgDetail} />
        </div>
      </section>

      {/* Features */}
      <section className={styles.featuresSection} id="funcionalidades">
        <div className={styles.featuresBlob} aria-hidden="true">
          <img src={assets.bgBlob} alt="" className={styles.featuresBlobImage} />
        </div>

        <div className={styles.screenFrameReveal}>
          <div className={`${styles.screenFrame} ${styles.reveal} ${styles.revealDelay4}`}>
            <picture>
              <source srcSet={assets.screenExample} type="image/avif" />
              <img
                src="/assets/images/screen-example.png"
                alt="Preview do app Jarvi"
                className={styles.screenFrameImage}
              />
            </picture>
          </div>
        </div>

        <div className={styles.featuresContent}>
          <div className={`${styles.featuresSectionHeader} ${styles.reveal} ${styles.revealDelay5}`}>
            <div className={styles.featuresTag}>
              <span>FUNCIONALIDADES</span>
            </div>
            <h2 className={styles.featuresSectionTitle}>Um app que aprende com você</h2>
            <p className={styles.featuresSectionDescription}>
            A Jarvi cria memória a partir das suas tarefas  e quanto mais voce usa o app, mais ela aprende a ajudar você.
            </p>
          </div>

          <div className={`${styles.featurePreviewWrapper} ${styles.reveal} ${styles.revealDelay6}`}>
            <div className={styles.showcaseCard}>
              <img
                src={featureImages[activeFeature]}
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
        className={styles.ctaSection}
        id="acesso-antecipado"
      >
        <img src={assets.ctaBg} alt="" aria-hidden="true" className={styles.ctaBgImage} />
        <div className={styles.ctaBgBlur} />
        <div className={styles.ctaBgDetailTop} aria-hidden="true">
          <CurveDivider className={styles.ctaBgDetailImg} />
        </div>

        <div
          className={`${styles.ctaContent} ${isCtaInView ? `${styles.reveal} ${styles.revealDelay2}` : styles.revealHidden}`}
        >
          <h2>Garanta seu acesso antecipado</h2>
          <p>Seja um dos primeiros a testar a Jarvi e contribuir com feedbacks</p>
          <Button
            href="/beta"
            variant="primary"
            size="lg"
            onClick={() => posthog?.capture('cta_clicked', { location: 'cta_section' })}
          >
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
            <a href="/termos-de-uso" className={styles.footerTerms}>
              Termos de Uso
            </a>
            <a href="/politica-de-privacidade" className={styles.footerPrivacy}>
              Política de Privacidade
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}
