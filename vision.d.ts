import type { Point, Policy } from "./index.js";
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export function createScanner(
  cv: object,
  policy?: Policy,
): { detect(image: PixelImage): Point[] | null; normalize(image: PixelImage): PixelImage };
