'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, Sparkle } from '@phosphor-icons/react';
import { usePostHog } from 'posthog-js/react';
import styles from './LandingPage.module.css';
import { Button } from '../components/Button/Button';
import { CurveDivider } from '../components/CurveDivider/CurveDivider';

type FeatureKey = 'whatsapp' | 'email' | 'calendar' | 'wand' | 'cards' | 'checks';

const featureOrder: FeatureKey[] = ['whatsapp', 'email', 'calendar', 'wand', 'cards', 'checks'];

// Auto-play duration per slide, in milliseconds (Apple-style fixed timer).
const SLIDE_DURATION = 6000;

const assets = {
  screenExample: '/assets/images/screen-demo.avif',
  ctaBg: '/assets/images/cta-bg.avif',
  heroBgAvif: '/assets/images/hero.avif',
  heroBgWebp: '/assets/images/hero.webp',
  logo: '/assets/icons/logo-icon.svg',
  whatsappIcon: '/assets/icons/whatsapp-icon.svg',
  bgBlob: '/assets/images/hero-blob.svg',
};

const featureImages: Partial<Record<FeatureKey, string>> = {
  whatsapp: '/assets/images/whatsapp-integration.avif',
  email: '/assets/images/app.avif',
  calendar: '/assets/images/memory.avif',
};

const featureVideos: Partial<Record<FeatureKey, { webm: string; mp4: string }>> = {
  wand: {
    webm: '/assets/videos/ai-mode-jarvi.webm',
    mp4: '/assets/videos/ai-mode-jarvi.mp4',
  },
  cards: {
    webm: '/assets/videos/ai-chat-jarvi.webm',
    mp4: '/assets/videos/ai-chat-jarvi.mp4',
  },
  checks: {
    webm: '/assets/videos/themming-demo.webm',
    mp4: '/assets/videos/themming-demo.mp4',
  },
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
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isCtaInView, setIsCtaInView] = useState(false);

  const ctaSectionRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Partial<Record<FeatureKey, HTMLDivElement | null>>>({});
  const videoRefs = useRef<Partial<Record<FeatureKey, HTMLVideoElement | null>>>({});
  const programmaticScrollRef = useRef(false);
  const activeFeatureRef = useRef<FeatureKey>(activeFeature);
  activeFeatureRef.current = activeFeature;
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const activeIndex = featureOrder.indexOf(activeFeature);
  const activeCopy = featureCopyByFeature[activeFeature];

  const goToFeature = (feature: FeatureKey) => {
    setActiveFeature(feature);
    setProgress(0);
    setIsEnded(false);
  };

  // Play/pause/replay button handler.
  const handlePlaybackToggle = () => {
    if (isEnded) {
      setActiveFeature(featureOrder[0]);
      setProgress(0);
      setIsEnded(false);
      setIsPaused(false);
      return;
    }
    setIsPaused((prev) => !prev);
  };

  // Respect the user's reduced-motion preference.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Track the mobile breakpoint (matches the 680px CSS breakpoint).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Auto-play loop: fills the progress bar and advances on a fixed timer.
  useEffect(() => {
    if (isPaused || reducedMotion || isInteracting || isEnded) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      // Resume from the current progress so leaving hover doesn't reset the bar.
      if (start === null) start = now - progressRef.current * SLIDE_DURATION;
      const pct = Math.min((now - start) / SLIDE_DURATION, 1);
      setProgress(pct);
      if (pct >= 1) {
        const i = featureOrder.indexOf(activeFeatureRef.current);
        if (i >= featureOrder.length - 1) {
          // Reached the last slide: stop and surface the replay button.
          setProgress(1);
          setIsEnded(true);
          return;
        }
        setActiveFeature(featureOrder[i + 1]);
        setProgress(0);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeFeature, isPaused, reducedMotion, isInteracting, isEnded]);

  // Play only the active video; pause the rest to save resources.
  useEffect(() => {
    featureOrder.forEach((feature) => {
      const video = videoRefs.current[feature];
      if (!video) return;
      if (feature === activeFeature) {
        video.currentTime = 0;
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [activeFeature]);

  // Mobile: keep the scroll position in sync when the active feature changes.
  useEffect(() => {
    if (!isMobile) return;
    const viewport = viewportRef.current;
    const slide = slideRefs.current[activeFeature];
    if (!viewport || !slide) return;
    programmaticScrollRef.current = true;
    viewport.scrollTo({
      left: slide.offsetLeft - (viewport.clientWidth - slide.clientWidth) / 2,
      behavior: 'smooth',
    });
    const timeout = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [activeFeature, isMobile]);

  // Mobile: update the active feature as the user swipes (with anti-loop guard).
  useEffect(() => {
    if (!isMobile) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    let raf = 0;
    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const center = viewport.scrollLeft + viewport.clientWidth / 2;
        let nearest: FeatureKey = featureOrder[0];
        let min = Infinity;
        featureOrder.forEach((feature) => {
          const slide = slideRefs.current[feature];
          if (!slide) return;
          const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
          const distance = Math.abs(slideCenter - center);
          if (distance < min) {
            min = distance;
            nearest = feature;
          }
        });
        if (nearest !== activeFeatureRef.current) {
          setActiveFeature(nearest);
          setProgress(0);
          setIsEnded(false);
        }
      });
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [isMobile]);

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
              <Button href="https://app.jarvi.life/" variant="ghost" size="default">
                Login
              </Button>
            </span>
            <Button
              href="https://app.jarvi.life/criar-conta"
              variant="primary"
              size="default"
              onClick={() => posthog?.capture('cta_clicked', { location: 'navbar' })}
            >
              Criar conta
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
            fetchPriority="high"
            loading="eager"
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
              Seu assistente de tarefas com IA que funciona no WhatsApp
            </h1>
            <p className={styles.heroDescription}>
              Jarvi é um assistente de IA que te ajuda a anotar, organizar e lembrar o que importa. Aprende com você, no WhatsApp e em outros apps.
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
            <img
              src={assets.screenExample}
              alt="Preview do app Jarvi"
              className={styles.screenFrameImage}
              loading="lazy"
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
            A Jarvi cria memória a partir das suas tarefas  e quanto mais voce usa o app, mais ela aprende a ajudar você.
            </p>
          </div>

          <div className={`${styles.featurePreviewWrapper} ${styles.reveal} ${styles.revealDelay6}`}>
            <div
              className={styles.showcaseViewport}
              ref={viewportRef}
              onPointerDown={() => setIsInteracting(true)}
              onPointerUp={() => setIsInteracting(false)}
              onPointerCancel={() => setIsInteracting(false)}
            >
              <div
                className={styles.slidesTrack}
                style={{ '--active-index': activeIndex } as React.CSSProperties}
              >
                {featureOrder.map((feature) => {
                  const video = featureVideos[feature];
                  const isActive = activeFeature === feature;
                  return (
                    <div
                      key={feature}
                      className={styles.slide}
                      ref={(el) => {
                        slideRefs.current[feature] = el;
                      }}
                      aria-hidden={isActive ? undefined : true}
                    >
                      <div className={styles.showcaseCard}>
                        {video ? (
                          <video
                            ref={(el) => {
                              videoRefs.current[feature] = el;
                            }}
                            loop
                            muted
                            playsInline
                            preload="metadata"
                            aria-hidden="true"
                            className={styles.showcaseImage}
                          >
                            <source src={video.webm} type="video/webm" />
                            <source src={video.mp4} type="video/mp4" />
                          </video>
                        ) : (
                          <img
                            src={featureImages[feature]}
                            alt=""
                            aria-hidden="true"
                            className={styles.showcaseImage}
                            loading="lazy"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.carouselControls}>
              <div className={styles.progressTrack} role="tablist" aria-label="Funcionalidades">
                {featureOrder.map((feature) => {
                  const isActive = activeFeature === feature;
                  return (
                    <button
                      key={feature}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={featureCopyByFeature[feature].title}
                      className={isActive ? `${styles.dot} ${styles.dotActive}` : styles.dot}
                      onClick={() => goToFeature(feature)}
                    >
                      {isActive && (
                        <span
                          className={styles.progressFill}
                          style={{ width: `${progress * 100}%` }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className={styles.pauseButton}
                onClick={handlePlaybackToggle}
                aria-label={
                  isEnded
                    ? 'Reiniciar apresentação'
                    : isPaused
                      ? 'Reproduzir apresentação'
                      : 'Pausar apresentação'
                }
              >
                {isEnded ? (
                  <ArrowClockwise size={22} weight="bold" color="#1d1d1f" aria-hidden="true" />
                ) : (
                  <span
                    className={isPaused ? styles.playGlyph : styles.pauseGlyph}
                    aria-hidden="true"
                  />
                )}
              </button>
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
        id="cta"
      >
        <img src={assets.ctaBg} alt="" aria-hidden="true" className={styles.ctaBgImage} loading="lazy" />
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
            href="https://app.jarvi.life/criar-conta"
            variant="primary"
            size="lg"
            onClick={() => posthog?.capture('cta_clicked', { location: 'cta_section' })}
          >
            Criar conta grátis
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
            <a href="/termos-de-uso" className={styles.footerLink}>
              Termos de Uso
            </a>
            <a href="/politica-de-privacidade" className={styles.footerLink}>
              Política de Privacidade
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}
