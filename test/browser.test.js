import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadOpenCv, readPixels, encodeJpeg } from "../browser.js";

afterEach(() => { delete globalThis.document; delete globalThis.cv; });
test("concurrent engine requests share initialization without assimilating the runtime", async () => {
  let script, count = 0;
  globalThis.document = { createElement: () => ({}), head: { append: (s) => { script = s; count++; } } };
  const first = loadOpenCv("/engine.js"), second = loadOpenCv("/engine.js");
  assert.equal(first, second); assert.equal(count, 1);
  const cv = { then: (ready) => ready() }; globalThis.cv = cv; script.onload();
  assert.equal((await first).cv, cv);
});
test("a failed engine request can retry without retaining its script", async () => {
  let script, removed = 0;
  globalThis.document = { createElement: () => ({ remove: () => removed++ }), head: { append: (s) => { script = s; } } };
  const first = loadOpenCv("/retry.js"); script.onerror();
  await assert.rejects(first, { code: "engine-unavailable" }); assert.equal(removed, 1);
  const next = loadOpenCv("/retry.js"); globalThis.cv = { Mat: class {} }; script.onload();
  assert.equal((await next).cv, globalThis.cv);
});
test("pixel snapshots preserve aspect ratio and flatten transparency before drawing", () => {
  const calls = [], canvas = { getContext: () => context };
  const context = { fillRect: (...a) => calls.push(["fill", ...a]), drawImage: (...a) => calls.push(["draw", ...a]),
    getImageData: (x, y, width, height) => ({ width, height, data: new Uint8ClampedArray(4) }) };
  globalThis.document = { createElement: () => canvas };
  const source = { videoWidth: 4800, videoHeight: 3200 };
  assert.deepEqual(readPixels(source), { width: 2400, height: 1600, data: new Uint8ClampedArray(4) });
  assert.equal(context.fillStyle, "#fff"); assert.deepEqual(calls.map(c => c[0]), ["fill", "draw"]);
  assert.deepEqual(calls[1].slice(2), [0, 0, 2400, 1600]);
  assert.throws(() => readPixels({ videoWidth: 0, videoHeight: 0 }), { code: "invalid-frame" });
});
test("JPEG encoding copies corrected pixels and rejects an unavailable encoder", async () => {
  let written, mime, quality, succeeds = true;
  const bytes = new Uint8ClampedArray([30, 40, 50, 255]);
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: (pixels) => { written = pixels.data; },
  }), toBlob: (done, type, q) => { mime = type; quality = q; done(succeeds ? new Blob([bytes], { type }) : null); } }) };
  const image = { width: 1, height: 1, data: bytes }, blob = await encodeJpeg(image);
  assert.equal(blob.type, "image/jpeg"); assert.equal(mime, "image/jpeg"); assert.equal(quality, 0.9);
  assert.deepEqual(written, bytes); assert.notEqual(written, bytes);
  succeeds = false; await assert.rejects(encodeJpeg(image), { code: "encoding" });
});
test("engine initialization times out and permits a fresh request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let script;
  globalThis.document = { createElement: () => ({ remove() {} }), head: { append: (s) => { script = s; } } };
  const failed = loadOpenCv("/slow.js"), rejected = assert.rejects(failed, { code: "engine-unavailable" });
  t.mock.timers.tick(20000); await rejected;
  const next = loadOpenCv("/slow.js"); globalThis.cv = { Mat: class {} }; script.onload();
  assert.equal((await next).cv, globalThis.cv);
});
