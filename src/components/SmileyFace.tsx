import type { SmileyReading } from '../lib/smiley.ts';

/**
 * A reactive SVG face for the live coaching score. The mouth curves from a frown (quality 0) to a
 * smile (quality 1) and takes the reading's tone color (via currentColor), so it reads at a glance
 * from arm's length. Crisp at any size and theme-aware (stroke inherits the tone token). A subtle
 * scale "pop" plays when the bucket changes — gated behind `motion-safe:` so it's suppressed under
 * prefers-reduced-motion.
 */
export function SmileyFace({ reading, size = 48 }: { reading: SmileyReading; size?: number }) {
  // Mouth control-point Y in the 0–100 viewBox: quality 1 → 40 (big smile), 0 → 84 (frown).
  const mouthCy = 62 + (0.5 - reading.quality) * 44;

  return (
    <svg
      key={reading.bucket}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`Coaching: ${reading.label}`}
      className={`${reading.toneClass} shrink-0 transition-colors motion-safe:animate-[smiley-pop_.3s_ease-out]`}
    >
      <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="5" />
      <circle cx="36" cy="42" r="5.5" fill="currentColor" />
      <circle cx="64" cy="42" r="5.5" fill="currentColor" />
      <path
        d={`M32 62 Q50 ${mouthCy.toFixed(1)} 68 62`}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
