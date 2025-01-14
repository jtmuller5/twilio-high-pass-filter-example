export function computeAlpha(cutoff: number, sampleRate: number): number {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  return rc / (rc + dt);
}
export function computeAlphaLowPass(
  cutoff: number,
  sampleRate: number
): number {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoff);
  return dt / (rc + dt);
}

export function highPassFilter(
  samples: Int16Array,
  alpha: number,
  prevSampleIn: number,
  prevSampleOut: number
): { filtered: Int16Array; newPrevIn: number; newPrevOut: number } {
  const filtered = new Int16Array(samples.length);
  let pIn = prevSampleIn;
  let pOut = prevSampleOut;

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = alpha * (pOut + x - pIn);
    filtered[i] = y;
    pIn = x;
    pOut = y;
  }

  return { filtered, newPrevIn: pIn, newPrevOut: pOut };
}

export function lowPassFilter(
  samples: Int16Array,
  alpha: number,
  prevSampleOut: number
): { filtered: Int16Array; newPrevOut: number } {
  const filtered = new Int16Array(samples.length);
  let pOut = prevSampleOut;

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = pOut + alpha * (x - pOut);
    filtered[i] = y;
    pOut = y;
  }

  return { filtered, newPrevOut: pOut };
}
