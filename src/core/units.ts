// Frequency unit conversions. "Critical speed" questions mix rpm, Hz and rad/s constantly.
export const TWO_PI = 2 * Math.PI;
export const G = 9.81; // m/s^2, as used in the course

export type FreqUnit = 'Hz' | 'rad/s' | 'rpm';
export const FREQ_UNITS: FreqUnit[] = ['Hz', 'rad/s', 'rpm'];

export const hzToRad = (f: number) => f * TWO_PI;
export const radToHz = (w: number) => w / TWO_PI;
export const rpmToRad = (n: number) => (n * TWO_PI) / 60;
export const radToRpm = (w: number) => (w * 60) / TWO_PI;
export const rpmToHz = (n: number) => n / 60;
export const hzToRpm = (f: number) => f * 60;

/** Convert a frequency between Hz, rad/s and rpm. */
export function convertFreq(v: number, from: FreqUnit, to: FreqUnit): number {
  if (from === to) return v;
  const w = from === 'Hz' ? hzToRad(v) : from === 'rpm' ? rpmToRad(v) : v;
  return to === 'Hz' ? radToHz(w) : to === 'rpm' ? radToRpm(w) : w;
}

export const isFreqUnit = (u: string): u is FreqUnit => u === 'Hz' || u === 'rad/s' || u === 'rpm';
