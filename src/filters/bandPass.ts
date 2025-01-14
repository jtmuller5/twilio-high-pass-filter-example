import { highPassFilter, lowPassFilter } from "./singlePole";
import { BandPassState } from "./types";

export function bandPassFilter(
  samples: Int16Array,
  alphaHP: number,
  alphaLP: number,
  state: BandPassState
): { filtered: Int16Array; newState: BandPassState } {
  // High-pass first
  const {
    filtered: hpFiltered,
    newPrevIn,
    newPrevOut,
  } = highPassFilter(
    samples,
    alphaHP,
    state.prevSampleInHP,
    state.prevSampleOutHP
  );

  // Then low-pass
  const { filtered: lpFiltered, newPrevOut: lpOut } = lowPassFilter(
    hpFiltered,
    alphaLP,
    state.prevSampleOutLP
  );

  return {
    filtered: lpFiltered,
    newState: {
      prevSampleInHP: newPrevIn,
      prevSampleOutHP: newPrevOut,
      prevSampleOutLP: lpOut,
    },
  };
}
