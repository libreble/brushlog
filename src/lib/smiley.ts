// App-level interpretation of the iO's live "smiley" coaching score (BLE char ff0a).
//
// ⚠️ SCALE IS UNCONFIRMED. `decodeSmiley` in the protocol layer returns the raw uint8 (getUint8(0));
// docs/PROTOCOL.md only labels ff0a a "feedback score" with no documented range.
// So we degrade gracefully with a "higher = better" assumption and normalize to a 0–1 quality:
//   • 0..5    → treated as a small ordinal grade (score / 5) — common for a few-step coaching face
//   • 6..100  → treated as a 0–100 percent (score / 100)
//   • >100    → clamped to 1 (treat as "max")
// The raw value is always shown alongside the face so the owner can read the true numbers and
// calibrate. TODO(hardware): capture real live.smiley values on the owner's iO and tighten these
// buckets (and confirm whether 0x00/0xFF mean "no data" rather than "worst").

export interface SmileyReading {
  /** The raw device byte, surfaced verbatim for calibration. */
  raw: number;
  /** Normalized 0–1 quality under the heuristic above (1 = best). */
  quality: number;
  /** Coarse bucket for the face + labelling. */
  bucket: 'great' | 'good' | 'ok' | 'poor';
  /** Short human label. */
  label: string;
  /** Tailwind text-color token for the tone (also drives the face stroke via currentColor). */
  toneClass: string;
}

/** Map a raw smiley byte to a normalized 0–1 quality using the documented heuristic. */
export function smileyQuality(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 5) return Math.min(raw / 5, 1);
  if (raw <= 100) return raw / 100;
  return 1;
}

const BUCKETS: Array<{ min: number; bucket: SmileyReading['bucket']; label: string; toneClass: string }> = [
  { min: 0.8, bucket: 'great', label: 'Great', toneClass: 'text-ok' },
  { min: 0.55, bucket: 'good', label: 'Good', toneClass: 'text-accent' },
  { min: 0.3, bucket: 'ok', label: 'Okay', toneClass: 'text-warn' },
  { min: -1, bucket: 'poor', label: 'Ease up', toneClass: 'text-danger' },
];

/** Interpret a raw smiley byte into a face bucket + label + tone. */
export function interpretSmiley(raw: number): SmileyReading {
  const quality = smileyQuality(raw);
  const b = BUCKETS.find((x) => quality >= x.min) ?? BUCKETS[BUCKETS.length - 1];
  return { raw, quality, bucket: b.bucket, label: b.label, toneClass: b.toneClass };
}
