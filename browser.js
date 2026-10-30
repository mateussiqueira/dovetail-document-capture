import { CaptureError } from "./index.js";

const engines = new Map();
export function loadOpenCv(url) {
  if (engines.has(url)) return engines.get(url);
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer); script.remove(); engines.delete(url);
      reject(new CaptureError("engine-unavailable"));
    };
    const timer = setTimeout(fail, 20000);
    script.src = url; script.async = true; script.onerror = fail;
    script.onload = () => {
      const cv = globalThis.cv;
      const ready = () => { clearTimeout(timer); resolve({ cv }); };
      if (cv?.Mat) ready();
      else if (typeof cv?.then === "function") cv.then(ready, fail);
      else if (cv) cv.onRuntimeInitialized = ready;
      else fail();
    };
    document.head.append(script);
  });
  engines.set(url, pending);
  return pending;
}

function canvas(width, height) {
  const node = document.createElement("canvas");
  node.width = width; node.height = height;
  const context = node.getContext("2d", { willReadFrequently: true });
  if (!context) throw new CaptureError("canvas-unavailable");
  return { node, context };
}

export function readPixels(source, maxDimension = 2400) {
  const width = "videoWidth" in source ? source.videoWidth : source.naturalWidth ?? source.width;
  const height = "videoHeight" in source ? source.videoHeight : source.naturalHeight ?? source.height;
  if (![width, height, maxDimension].every((n) => Number.isFinite(n) && n > 0)) throw new CaptureError("invalid-frame");
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const { node, context } = canvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  context.fillStyle = "#fff"; context.fillRect(0, 0, node.width, node.height);
  context.drawImage(source, 0, 0, node.width, node.height);
  return context.getImageData(0, 0, node.width, node.height);
}

export function encodeJpeg(image) {
  const { node, context } = canvas(image.width, image.height);
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data); context.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) => node.toBlob(
    (blob) => blob ? resolve(blob) : reject(new CaptureError("encoding")), "image/jpeg", 0.9,
  ));
}
