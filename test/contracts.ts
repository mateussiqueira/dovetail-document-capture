import { createScanner, type PixelImage } from "../vision.js";
import { createCaptureSession } from "../camera.js";

const image: PixelImage = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
const scanner = createScanner({}, { minEdge: 500 });
const session = createCaptureSession({
  acquire: async () => ({ closed: false }),
  release: (resource) => { resource.closed = true; },
  prepare: async (resource) => { resource.closed = false; },
  snapshot: (full) => { const isFull: boolean = full; return image; },
  scanner,
  onGuide: (points) => { const x: number | undefined = points?.[0].x; },
  onCapture: async (pixels, isCurrent) => {
    const current: boolean = isCurrent();
    const bytes: Uint8ClampedArray = pixels.data;
    // @ts-expect-error The guard reports a boolean, never an image.
    const invalid: PixelImage = isCurrent();
  },
});
void session.start();
session.stop();
// @ts-expect-error Pixel buffers must contain clamped RGBA bytes.
scanner.normalize({ width: 1, height: 1, data: [0, 0, 0, 255] });
// @ts-expect-error Policy thresholds must be numeric.
createScanner({}, { minEdge: "500" });

import { loadOpenCv, readPixels, encodeJpeg } from "../browser.js";
const engine: Promise<{ cv: object }> = loadOpenCv("/engine.js");
const blob: Promise<Blob> = encodeJpeg(readPixels(document.createElement("video")));
