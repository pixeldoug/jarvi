/**
 * Task completion celebration: the sound plus a small confetti burst around
 * the checkbox.
 *
 * The burst lives on document.body at the checkbox's position, not inside the
 * checkbox: a completed task is reordered (or leaves its list) right away, and
 * the burst has to outlive that.
 */

import completeSoundUrl from '../../../../assets/sounds/task-complete.mp3';

const SOUND_VOLUME = 0.45;

const CONFETTI_COLORS = [
  'var(--semantic-content-info)',
  'var(--color-brand-primary-300)',
  'var(--color-system-yellow-400)',
  'var(--color-system-green-400)',
  'var(--color-system-blue-400)',
  'var(--color-system-red-400)',
];

const PARTICLE_COUNT = 14;

let sound: HTMLAudioElement | null = null;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Loads the sound ahead of the first completion, so the first one isn't late */
export function preloadCompletionSound(): void {
  if (sound || typeof Audio === 'undefined') return;
  sound = new Audio(completeSoundUrl);
  sound.preload = 'auto';
  sound.volume = SOUND_VOLUME;
}

export function playCompletionSound(): void {
  preloadCompletionSound();
  if (!sound) return;
  // Completing tasks back to back restarts the sound instead of skipping it
  sound.currentTime = 0;
  void sound.play().catch(() => undefined);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function spawnRing(layer: HTMLElement, size: number): void {
  const ring = document.createElement('span');
  Object.assign(ring.style, {
    position: 'absolute',
    left: `${-size / 2}px`,
    top: `${-size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    border: '2px solid var(--semantic-content-info)',
  });
  layer.appendChild(ring);
  ring.animate(
    [
      { transform: 'scale(0.7)', opacity: 0.55 },
      { transform: 'scale(1.9)', opacity: 0 },
    ],
    { duration: 480, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
  );
}

function spawnParticle(layer: HTMLElement, index: number, reach: number): Animation {
  const particle = document.createElement('span');
  const isStrip = index % 3 === 0;
  const width = isStrip ? 3 : randomBetween(4, 6);
  const height = isStrip ? 8 : width;

  Object.assign(particle.style, {
    position: 'absolute',
    left: `${-width / 2}px`,
    top: `${-height / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: isStrip ? '2px' : '50%',
    background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  });
  layer.appendChild(particle);

  // Evenly around the box with some jitter, so it never clumps on one side
  const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + randomBetween(-0.25, 0.25);
  const distance = reach * randomBetween(0.75, 1.15);
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const spin = randomBetween(-200, 200);

  return particle.animate(
    [
      { transform: 'translate(0, 0) rotate(0deg) scale(0.3)', opacity: 1 },
      {
        transform: `translate(${dx}px, ${dy}px) rotate(${spin * 0.7}deg) scale(1)`,
        opacity: 1,
        offset: 0.55,
      },
      // A little gravity on the way out
      {
        transform: `translate(${dx * 1.12}px, ${dy * 1.12 + 10}px) rotate(${spin}deg) scale(0.5)`,
        opacity: 0,
      },
    ],
    {
      duration: randomBetween(620, 820),
      delay: randomBetween(0, 40),
      easing: 'cubic-bezier(0.15, 0.75, 0.35, 1)',
      fill: 'forwards',
    },
  );
}

/** Confetti bursting out of `target` (the checkbox). Skipped for reduced motion. */
export function burstConfetti(target: HTMLElement): void {
  if (prefersReducedMotion() || typeof document === 'undefined') return;
  const rect = target.getBoundingClientRect();
  if (!rect.width) return;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed',
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top + rect.height / 2}px`,
    width: '0',
    height: '0',
    pointerEvents: 'none',
    zIndex: '9999',
  });
  document.body.appendChild(layer);

  spawnRing(layer, rect.width);
  const reach = rect.width * 1.3;
  const animations = Array.from({ length: PARTICLE_COUNT }, (_, i) => spawnParticle(layer, i, reach));

  void Promise.allSettled(animations.map((animation) => animation.finished))
    .then(() => layer.remove());
}

export function celebrateCompletion(target: HTMLElement): void {
  playCompletionSound();
  burstConfetti(target);
}
