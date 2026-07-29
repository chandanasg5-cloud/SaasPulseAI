export function computeStickiness(dau: number, mau: number): number {
  return mau === 0 ? 0 : (dau / mau) * 100;
}
