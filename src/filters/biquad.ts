import { BiquadFilterState, BiquadCoefficients } from "./types";

export function createBiquadBandpassFilter(
  frequency: number,
  Q: number,
  sampleRate: number
): BiquadCoefficients {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Q);
  const cos_w0 = Math.cos(w0);

  const norm = 1 / (1 + alpha);

  return {
    a0: alpha * norm,
    a1: 0,
    a2: -alpha * norm,
    b1: -2 * cos_w0 * norm,
    b2: (1 - alpha) * norm,
  };
}

export function biquadFilter(
  samples: Int16Array,
  coeffs: BiquadCoefficients,
  state: BiquadFilterState
): { filtered: Int16Array; newState: BiquadFilterState } {
  const filtered = new Int16Array(samples.length);
  let { x1, x2, y1, y2 } = state;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];

    // Direct Form II implementation
    const y0 =
      coeffs.a0 * x0 +
      coeffs.a1 * x1 +
      coeffs.a2 * x2 -
      coeffs.b1 * y1 -
      coeffs.b2 * y2;

    filtered[i] = Math.round(y0); // Convert to Int16

    // Shift delay line
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return {
    filtered,
    newState: { x1, x2, y1, y2 },
  };
}
