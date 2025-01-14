export interface FilterState {
    prevSampleIn?: number;
    prevSampleOut?: number;
  }
  
  export interface BandPassState {
    prevSampleInHP: number;
    prevSampleOutHP: number;
    prevSampleOutLP: number;
  }
  
  export interface BiquadFilterState {
    x1: number;  // Input delayed by 1 sample
    x2: number;  // Input delayed by 2 samples
    y1: number;  // Output delayed by 1 sample
    y2: number;  // Output delayed by 2 samples
  }
  
  export interface BiquadCoefficients {
    a0: number;  // Current input
    a1: number;  // Input delayed by 1
    a2: number;  // Input delayed by 2
    b1: number;  // Output delayed by 1
    b2: number;  // Output delayed by 2
  }