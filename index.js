export class CaptureError extends Error {
  constructor(code) {
    super(code);
    this.name = "CaptureError";
    this.code = code;
  }
}
export const defaults = Object.freeze({
  margin: 0.02,
  minArea: 0.15,
  minEdge: 500,
  maxDimension: 2400,
  maxPixels: 40000000,
  minLuma: 45,
  maxLuma: 248,
  minContrast: 15,
  minSharpness: 50,
});
export function capturePolicy(input = {}) {
  const p = { ...defaults, ...input };
  if (
    Object.keys(p).some((key) => !Object.hasOwn(defaults, key) || !Number.isFinite(p[key]) || p[key] < 0) ||
    p.margin >= 0.5 ||
    p.minArea > 1 ||
    p.minEdge < 1 ||
    p.maxDimension < p.minEdge ||
    p.maxPixels < 1 ||
    p.minLuma >= p.maxLuma ||
    p.maxLuma > 255
  )
    throw new TypeError("Invalid capture policy");
  return Object.freeze(p);
}
export function frameGeometry(points, size, input = {}) {
  const p = capturePolicy(input),
    { width, height } = size;
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) throw new CaptureError("invalid-frame");
  if (width * height > p.maxPixels) throw new CaptureError("image-too-large");
  if (points?.length !== 4 || points.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y)))
    throw new CaptureError("not-found");
  if (points.some((v) => v.x < p.margin || v.y < p.margin || v.x > 1 - p.margin || v.y > 1 - p.margin))
    throw new CaptureError("outside-frame");
  const center = { x: points.reduce((n, v) => n + v.x, 0) / 4, y: points.reduce((n, v) => n + v.y, 0) / 4 };
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x),
  );
  const first = sorted.reduce((best, v, i) => (v.x + v.y < sorted[best].x + sorted[best].y ? i : best), 0);
  const ordered = [...sorted.slice(first), ...sorted.slice(0, first)];
  const turns = ordered.map((a, i) => {
    const b = ordered[(i + 1) % 4],
      c = ordered[(i + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  if (!turns.every((n) => n > 0)) throw new CaptureError("not-found");
  const area =
    Math.abs(
      ordered.reduce((n, a, i) => {
        const b = ordered[(i + 1) % 4];
        return n + a.x * b.y - b.x * a.y;
      }, 0),
    ) / 2;
  if (area < p.minArea) throw new CaptureError("too-small");
  const pixels = ordered.map((v) => ({ x: v.x * width, y: v.y * height }));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = Math.round((distance(pixels[0], pixels[1]) + distance(pixels[3], pixels[2])) / 2);
  const h = Math.round((distance(pixels[0], pixels[3]) + distance(pixels[1], pixels[2])) / 2);
  const scale = Math.min(1, p.maxDimension / Math.max(w, h));
  const output = { width: Math.round(w * scale), height: Math.round(h * scale), points: pixels };
  if (Math.min(output.width, output.height) < p.minEdge) throw new CaptureError("too-small");
  return output;
}
export function assessQuality(metrics, input = {}) {
  const p = capturePolicy(input),
    { mean, contrast, sharpness } = metrics;
  if (![mean, contrast, sharpness].every(Number.isFinite) || mean < 0 || mean > 255 || contrast < 0 || sharpness < 0)
    throw new CaptureError("invalid-metrics");
  if (mean < p.minLuma || mean > p.maxLuma) throw new CaptureError("lighting");
  if (contrast < p.minContrast) throw new CaptureError("contrast");
  if (sharpness < p.minSharpness) throw new CaptureError("blurred");
}
