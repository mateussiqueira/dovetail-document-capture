export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Policy {
  margin?: number;
  minArea?: number;
  minEdge?: number;
  maxDimension?: number;
  maxPixels?: number;
  minLuma?: number;
  maxLuma?: number;
  minContrast?: number;
  minSharpness?: number;
}
export class CaptureError extends Error {
  code: string;
  constructor(code: string);
}
export const defaults: Readonly<Required<Policy>>;
export function capturePolicy(policy?: Policy): Readonly<Required<Policy>>;
export function frameGeometry(points: Point[], size: Size, policy?: Policy): Size & { points: Point[] };
export function assessQuality(metrics: { mean: number; contrast: number; sharpness: number }, policy?: Policy): void;
