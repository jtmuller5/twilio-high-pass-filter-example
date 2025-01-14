export interface FIRFilterState {
  buffer: number[]; // Circular buffer for input history
  position: number; // Current position in circular buffer
}

/**
 * Creates coefficients for a windowed-sinc FIR low-pass filter
 */
export function createFIRLowPassCoefficients(
  cutoffFreq: number,
  sampleRate: number,
  numTaps: number
): number[] {
  const coefficients = new Array(numTaps);
  const omega = (2 * Math.PI * cutoffFreq) / sampleRate;
  const middle = (numTaps - 1) / 2;

  for (let i = 0; i < numTaps; i++) {
    if (i === middle) {
      // Handle the center point separately to avoid division by zero
      coefficients[i] = omega / Math.PI;
    } else {
      // Windowed-sinc formula
      const idx = i - middle;
      // Sinc function
      const sinc = Math.sin(omega * idx) / (Math.PI * idx);
      // Hamming window
      const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (numTaps - 1));
      coefficients[i] = sinc * window;
    }
  }

  // Normalize coefficients to ensure unity gain at DC
  const sum = coefficients.reduce((acc, val) => acc + val, 0);
  return coefficients.map((c) => c / sum);
}

/**
 * FIR filter implementation using circular buffer
 */
export function firFilter(
  samples: Int16Array,
  coefficients: number[],
  state: FIRFilterState
): { filtered: Int16Array; newState: FIRFilterState } {
  const filtered = new Int16Array(samples.length);
  const { buffer, position } = state;
  let pos = position;

  // Process each sample
  for (let i = 0; i < samples.length; i++) {
    // Store new sample in circular buffer
    buffer[pos] = samples[i];

    // Compute filtered sample
    let sum = 0;
    for (let j = 0; j < coefficients.length; j++) {
      // Calculate correct index in circular buffer
      const idx = (pos - j + buffer.length) % buffer.length;
      sum += buffer[idx] * coefficients[j];
    }

    // Store result
    filtered[i] = Math.round(sum);

    // Update position
    pos = (pos + 1) % buffer.length;
  }

  return {
    filtered,
    newState: { buffer, position: pos },
  };
}

export function createFIRFilterState(numTaps: number): FIRFilterState {
  return {
    buffer: new Array(numTaps).fill(0),
    position: 0,
  };
}
