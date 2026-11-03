/**
 * RecapCelebration — the ribbon and confetti artwork on the "Tudo revisado!"
 * screen (transparent WebP, drawn for the accent background).
 */

import celebration from '../../../../assets/recap/celebration.webp';

export function RecapCelebration({ className }: { className?: string }) {
  return <img className={className} src={celebration} alt="" draggable={false} />;
}
