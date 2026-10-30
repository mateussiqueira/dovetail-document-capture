import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptureError, capturePolicy, frameGeometry, assessQuality } from "../index.js";
const quad = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ],
  size = { width: 1000, height: 1500 };
const rejects = (fn, code) => assert.throws(fn, (error) => error instanceof CaptureError && error.code === code);
test("shuffled corners preserve an upright rectangle without mutating the caller", () => {
  const shuffled = [quad[2], quad[0], quad[3], quad[1]],
    original = JSON.stringify(shuffled);
  const geometry = frameGeometry(shuffled, size);
  assert.equal(geometry.width, 800);
  assert.equal(geometry.height, 1200);
  assert.deepEqual(geometry.points[0], { x: 100, y: 150 });
  assert.equal(JSON.stringify(shuffled), original);
});
test("policy rejects invalid or unknown thresholds and keeps independent consumers isolated", () => {
  for (const input of [
    { margin: NaN },
    { margin: 0.5 },
    { minArea: 2 },
    { minEdge: 0 },
    { minLuma: 250, maxLuma: 200 },
    { maxLuma: 256 },
    { unknown: 1 },
  ])
    assert.throws(() => capturePolicy(input), TypeError);
  const relaxed = capturePolicy({ minEdge: 100 });
  assert.equal(relaxed.minEdge, 100);
  assert.equal(capturePolicy().minEdge, 500);
});
for (const [name, points, code] of [
  ["missing corners", null, "not-found"],
  ["duplicate corners", [quad[0], quad[0], quad[1], quad[2]], "not-found"],
  ["nonfinite corners", [...quad.slice(0, 3), { x: NaN, y: 0.5 }], "not-found"],
  ["clipped document", [{ x: 0, y: 0.1 }, ...quad.slice(1)], "outside-frame"],
  ["distant document", quad.map((p) => ({ x: p.x / 3 + 0.3, y: p.y / 3 + 0.3 })), "too-small"],
])
  test(name + " cannot produce a normalized frame", () => rejects(() => frameGeometry(points, size), code));
test("low resolution is rejected instead of being enlarged", () =>
  rejects(() => frameGeometry(quad, { width: 600, height: 600 }), "too-small"));
test("the output respects its dimension limit while preserving source corners", () => {
  const geometry = frameGeometry(quad, { width: 4000, height: 6000 });
  assert.equal(geometry.width, 1600);
  assert.equal(geometry.height, 2400);
  assert.deepEqual(geometry.points[0], { x: 400, y: 600 });
});
test("invalid dimensions and oversized sources are refused", () => {
  rejects(() => frameGeometry(quad, { width: 0, height: 100 }), "invalid-frame");
  rejects(() => frameGeometry(quad, { width: 10000, height: 10000 }), "image-too-large");
});
test("readable metrics pass and configured thresholds remain effective", () => {
  assessQuality({ mean: 180, contrast: 40, sharpness: 100 });
  assessQuality({ mean: 180, contrast: 10, sharpness: 20 }, { minContrast: 5, minSharpness: 10 });
});
for (const [name, metrics, code] of [
  ["dark", { mean: 10, contrast: 40, sharpness: 100 }, "lighting"],
  ["overexposed", { mean: 255, contrast: 40, sharpness: 100 }, "lighting"],
  ["low contrast", { mean: 180, contrast: 3, sharpness: 100 }, "contrast"],
  ["blurred", { mean: 180, contrast: 40, sharpness: 2 }, "blurred"],
  ["invalid", { mean: NaN, contrast: 40, sharpness: 100 }, "invalid-metrics"],
])
  test(name + " metrics cannot approve an image", () => rejects(() => assessQuality(metrics), code));
