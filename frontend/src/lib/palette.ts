/** Protect's series palette (its `lib/chartStyle.ts`): one colour per tracker on the map. */
export const PALETTE = ["#52735E", "#D9825F", "#5C7FA3", "#B39A4A", "#8A6BA3", "#B86B5C", "#3E8E7E", "#8A7A4F"];

export function colourFor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
