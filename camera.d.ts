import type { Point } from "./index.js";
import type { PixelImage, createScanner } from "./vision.js";
export interface SessionOptions<Resource> {
  acquire(): Promise<Resource>;
  release(resource: Resource): void;
  prepare(resource: Resource): void | Promise<void>;
  snapshot(full: boolean): PixelImage | Promise<PixelImage>;
  scanner: ReturnType<typeof createScanner>;
  onGuide?(points: Point[] | null): void;
  onCapture(image: PixelImage, isCurrent: () => boolean): void | Promise<void>;
  onError?(error: unknown): void;
  schedule?(next: () => void, delay: number): unknown;
  cancel?(timer: unknown): void;
  interval?: number;
  stableFrames?: number;
  tolerance?: number;
}
export function createCaptureSession<Resource>(options: SessionOptions<Resource>): {
  start(): Promise<void>;
  stop(): void;
};
