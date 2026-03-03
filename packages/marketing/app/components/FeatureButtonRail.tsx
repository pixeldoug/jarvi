'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './FeatureButtonRail.module.css';
import {
  CalendarDots,
  CardsThree,
  Checks,
  EnvelopeSimple,
  MagicWand,
} from '@phosphor-icons/react';

const assets = {
  arrowLabel: 'https://www.figma.com/api/mcp/asset/28adc815-5bc5-4f2b-8c20-70dd5b6fbd96',
  whatsappActive: 'https://www.figma.com/api/mcp/asset/6894f67f-c92c-4c0d-b15b-8f734de07994',
  whatsappDefault: 'https://www.figma.com/api/mcp/asset/acf9c96a-b173-498c-9796-141f6bc6e027',
};

type FeatureKey = 'calendar' | 'whatsapp' | 'email' | 'wand' | 'cards' | 'checks';

const featureOrder: FeatureKey[] = ['whatsapp', 'email', 'calendar', 'wand', 'cards', 'checks'];

type FeatureButtonRailProps = {
  activeFeature?: FeatureKey;
  onActiveFeatureChange?: (feature: FeatureKey) => void;
};

export function FeatureButtonRail({ activeFeature, onActiveFeatureChange }: FeatureButtonRailProps) {
  const [internalActiveFeature, setInternalActiveFeature] = useState<FeatureKey>('whatsapp');
  const [hoveredFeature, setHoveredFeature] = useState<FeatureKey | null>(null);
  const selectedFeature = activeFeature ?? internalActiveFeature;
  const railRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Record<FeatureKey, HTMLButtonElement | null>>({
    calendar: null,
    whatsapp: null,
    email: null,
    wand: null,
    cards: null,
    checks: null,
  });

  useEffect(() => {
    const rail = railRef.current;
    const targetButton = buttonRefs.current[selectedFeature];

    if (!rail || !targetButton) return;
    if (rail.scrollWidth <= rail.clientWidth) return;

    targetButton.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [selectedFeature]);

  const renderIcon = (feature: FeatureKey, isActive: boolean) => {
    if (feature === 'whatsapp') {
      return isActive ? (
        <img src={assets.whatsappActive} alt="" aria-hidden="true" className={styles.activeWhatsapp} />
      ) : (
        <img src={assets.whatsappDefault} alt="" aria-hidden="true" className={styles.featureIcon24} />
      );
    }

    const iconSize = isActive ? 28 : 24;
    const iconClass = isActive ? styles.featureIcon28 : styles.featureIcon24;

    if (feature === 'email') {
      return (
        <EnvelopeSimple
          size={iconSize}
          weight="regular"
          aria-hidden="true"
          className={iconClass}
        />
      );
    }

    if (feature === 'calendar') {
      return (
        <CalendarDots size={iconSize} weight="regular" aria-hidden="true" className={iconClass} />
      );
    }

    if (feature === 'wand') {
      return <MagicWand size={iconSize} weight="regular" aria-hidden="true" className={iconClass} />;
    }

    if (feature === 'cards') {
      return <CardsThree size={iconSize} weight="regular" aria-hidden="true" className={iconClass} />;
    }

    return <Checks size={iconSize} weight="regular" aria-hidden="true" className={iconClass} />;
  };

  return (
    <aside className={styles.featureRail} ref={railRef}>
      <img src={assets.arrowLabel} alt="" aria-hidden="true" className={styles.featureRailArrow} />
      {featureOrder.map((feature) => {
        const isActive = selectedFeature === feature;
        const isHovered = hoveredFeature === feature && !isActive;

        return (
          <button
            key={feature}
            ref={(element) => {
              buttonRefs.current[feature] = element;
            }}
            type="button"
            className={[
              styles.featureChip,
              styles[`feature${feature[0].toUpperCase()}${feature.slice(1)}` as keyof typeof styles],
              isActive ? styles.featureChipActive : '',
              isHovered ? styles.featureChipHover : '',
            ].join(' ')}
            onClick={() => {
              onActiveFeatureChange?.(feature);
              if (!onActiveFeatureChange) {
                setInternalActiveFeature(feature);
              }
            }}
            onMouseEnter={() => setHoveredFeature(feature)}
            onMouseLeave={() => setHoveredFeature(null)}
            onFocus={() => setHoveredFeature(feature)}
            onBlur={() => setHoveredFeature(null)}
            aria-pressed={isActive}
          >
            <span className={styles.featureChipInner}>{renderIcon(feature, isActive)}</span>
          </button>
        );
      })}
    </aside>
  );
}

export type { FeatureKey };
