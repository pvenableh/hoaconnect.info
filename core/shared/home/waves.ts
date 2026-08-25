// The geometry behind the home's ambient wave field.
//
// Pure, and in `shared/` rather than inside the component, because the thing
// that makes this effect work is an INVARIANT rather than a look, and an
// invariant deserves a test:
//
//   Every harmonic multiplier is a WHOLE number.
//
// A band is the sum of a few sines over a base period. If every multiplier is
// an integer, the sum still repeats exactly every base period — so translating
// the band by one period lands the seam on an identical crest and the loop is
// invisible, forever, from a single linear tween with no re-draw. A fractional
// multiplier looks fine standing still and jumps visibly on every wrap. The
// test in tests/shared/home-waves.test.ts asserts both halves of that: integer
// multipliers, and y(x) === y(x + period) for sampled x.
//
// A single sine is unmistakably mechanical — every crest identical, evenly
// spaced. Summing harmonics gives crests of differing height and width, which
// is what reads as water rather than as a waveform.

/** Drawing space. The SVG is stretched to the viewport, so these are layout units. */
export const VB_W = 1200;
export const VB_H = 400;

export interface Harmonic {
  /** MUST be a whole number — see the file header. */
  mult: number;
  weight: number;
  phase: number;
}

export interface WaveSpec {
  key: string;
  period: number;
  amp: number;
  mid: number;
  /** Seconds for one full period of travel. */
  dur: number;
  /** Vertical bob amplitude. */
  bob: number;
  /** 1 drifts right, -1 drifts left. Mixing the two stops the field reading as a conveyor. */
  dir: 1 | -1;
  /** A complete CSS colour (the app's tokens are colours, not HSL triplets). */
  color: string;
  /**
   * Peak stop opacity, tuned SEPARATELY per theme rather than as one value with
   * an opacity multiplier over the top. The two grounds are not the same
   * problem: over #0b1015 a low alpha simply disappears, and over #f6f8fb the
   * same alpha that reads as light in dark mode goes muddy. Dialling one
   * number for both always loses one of them.
   */
  alphaLight: number;
  alphaDark: number;
  harmonics: Harmonic[];
}

export const WAVE_BANDS: WaveSpec[] = [
  {
    key: "a",
    period: 420,
    amp: 30,
    mid: 128,
    dur: 21,
    bob: 11,
    dir: -1,
    color: "var(--theme-accent-primary)",
    alphaLight: 0.1,
    alphaDark: 0.2,
    harmonics: [
      { mult: 1, weight: 1, phase: 0 },
      { mult: 2, weight: 0.42, phase: 1.15 },
      { mult: 3, weight: 0.22, phase: 2.6 },
    ],
  },
  {
    key: "b",
    period: 330,
    amp: 22,
    mid: 182,
    dur: 27,
    bob: 8,
    dir: 1,
    color: "var(--chart-2)",
    alphaLight: 0.09,
    alphaDark: 0.17,
    harmonics: [
      { mult: 1, weight: 1, phase: 2.1 },
      { mult: 3, weight: 0.34, phase: 0.4 },
    ],
  },
  {
    key: "c",
    period: 510,
    amp: 38,
    mid: 238,
    dur: 35,
    bob: 13,
    dir: -1,
    color: "var(--chart-4)",
    alphaLight: 0.075,
    alphaDark: 0.15,
    harmonics: [
      { mult: 1, weight: 1, phase: 0.8 },
      { mult: 2, weight: 0.55, phase: 3.0 },
      { mult: 5, weight: 0.16, phase: 1.7 },
    ],
  },
  {
    key: "d",
    period: 290,
    amp: 18,
    mid: 286,
    dur: 44,
    bob: 6,
    dir: 1,
    color: "var(--chart-1)",
    alphaLight: 0.07,
    alphaDark: 0.13,
    harmonics: [
      { mult: 1, weight: 1, phase: 1.4 },
      { mult: 2, weight: 0.3, phase: 2.2 },
      { mult: 4, weight: 0.18, phase: 0.2 },
    ],
  },
  {
    key: "e",
    period: 640,
    amp: 44,
    mid: 330,
    dur: 56,
    bob: 15,
    dir: -1,
    color: "var(--theme-accent-primary)",
    alphaLight: 0.055,
    alphaDark: 0.11,
    harmonics: [
      { mult: 1, weight: 1, phase: 2.7 },
      { mult: 2, weight: 0.48, phase: 0.9 },
      { mult: 3, weight: 0.26, phase: 1.9 },
    ],
  },
];

/** The band's surface height at x, in viewBox units. */
export function waveY(spec: WaveSpec, x: number): number {
  const k = (2 * Math.PI) / spec.period;
  const norm = spec.harmonics.reduce((s, h) => s + h.weight, 0);
  let v = 0;
  for (const h of spec.harmonics) v += h.weight * Math.sin(h.mult * k * x + h.phase);
  return spec.mid + (spec.amp * v) / norm;
}

/** Samples per period. 48 resolves the higher harmonics without visible faceting. */
const STEPS_PER_PERIOD = 48;

/**
 * One band as a filled path. It spans a whole number of periods AND carries a
 * full period of slack on the left, so the band stays covered whichever way it
 * drifts.
 */
export function wavePath(spec: WaveSpec): string {
  const repeats = Math.ceil(VB_W / spec.period) + 2;
  const startX = -spec.period;
  const endX = startX + spec.period * repeats;
  const step = spec.period / STEPS_PER_PERIOD;

  let d = `M${startX.toFixed(2)},${waveY(spec, startX).toFixed(2)}`;
  for (let x = startX + step; x <= endX + 0.01; x += step) {
    d += ` L${x.toFixed(2)},${waveY(spec, x).toFixed(2)}`;
  }
  d += ` L${endX.toFixed(2)},${VB_H} L${startX.toFixed(2)},${VB_H} Z`;
  return d;
}

/**
 * Deterministic per-orb drift — no Math.random, so SSR and a replay stay
 * identical and the field never "re-rolls" on a refresh.
 */
export const ORB_DRIFT = [
  { x: 18, y: -12, scale: 1.18, dur: 26, rotation: 28 },
  { x: -15, y: 16, scale: 0.84, dur: 34, rotation: -28 },
  { x: 13, y: -18, scale: 1.14, dur: 40, rotation: 28 },
  { x: -17, y: 11, scale: 1.08, dur: 46, rotation: -28 },
] as const;
