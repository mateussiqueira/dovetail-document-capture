import type { PixelImage } from "./vision.js";
export function loadOpenCv(url: string): Promise<{ cv: object }>;
export function readPixels(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, maxDimension?: number): PixelImage;
export function encodeJpeg(image: PixelImage): Promise<Blob>;
