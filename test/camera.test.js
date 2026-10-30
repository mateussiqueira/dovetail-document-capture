import { test } from "node:test";
import assert from "node:assert/strict";
import { createCaptureSession } from "../camera.js";
const points = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];
function harness(overrides = {}) {
  const queue = new Map(),
    events = [],
    stream = {},
    image = { id: "frame" };
  let id = 0;
  const options = {
    acquire: async () => stream,
    release: (r) => events.push(["release", r]),
    prepare: async () => {},
    snapshot: async (full) => ({ ...image, full }),
    scanner: { detect: () => points, normalize: (i) => ({ ...i, normalized: true }) },
    onGuide: (p) => events.push(["guide", p]),
    onCapture: (i, current) => events.push(["capture", i, current]),
    onError: (e) => events.push(["error", e]),
    schedule: (fn) => {
      queue.set(++id, fn);
      return id;
    },
    cancel: (id) => queue.delete(id),
    ...overrides,
  };
  return {
    session: createCaptureSession(options),
    events,
    queue,
    stream,
    next: async () => {
      const [id, fn] = queue.entries().next().value;
      queue.delete(id);
      await fn();
    },
  };
}
test("stable frames capture the full image and release the camera exactly once", async () => {
  const h = harness();
  await h.session.start();
  await h.next();
  await h.next();
  const capture = h.events.find((e) => e[0] === "capture");
  assert.equal(capture[1].full, true);
  assert.equal(capture[1].normalized, true);
  assert.equal(capture[2](), true);
  assert.equal(h.events.filter((e) => e[0] === "release").length, 1);
  assert.equal(h.queue.size, 0);
  h.session.stop();
  assert.equal(capture[2](), false);
});
test("missing or moving corners restart the stability count", async () => {
  const frames = [points, null, points, points.map((p) => ({ ...p, x: p.x + 0.03 })), points, points, points];
  const h = harness({ scanner: { detect: () => frames.shift(), normalize: (i) => i } });
  await h.session.start();
  for (let i = 0; i < 5; i++) await h.next();
  assert.equal(h.events.filter((e) => e[0] === "capture").length, 0);
  await h.next();
  assert.equal(h.events.filter((e) => e[0] === "capture").length, 1);
});
test("a camera opened after cancellation is released without being prepared", async () => {
  const request = Promise.withResolvers();
  let prepared = false;
  const h = harness({
    acquire: () => request.promise,
    prepare: async () => {
      prepared = true;
    },
  });
  const pending = h.session.start();
  h.session.stop();
  request.resolve(h.stream);
  await pending;
  assert.equal(prepared, false);
  assert.equal(h.events.filter((e) => e[0] === "release").length, 1);
  assert.equal(h.queue.size, 0);
});
test("cancellation discards a late frame and prevents analysis", async () => {
  const frame = Promise.withResolvers();
  let analysed = false;
  const h = harness({
    snapshot: () => frame.promise,
    scanner: {
      detect: () => {
        analysed = true;
        return points;
      },
    },
  });
  const pending = h.session.start();
  await new Promise((r) => setImmediate(r));
  h.session.stop();
  frame.resolve({});
  await pending;
  assert.equal(analysed, false);
  assert.equal(h.queue.size, 0);
});
test("an encoder can recognize that a new selection replaced its result", async () => {
  const encoding = Promise.withResolvers();
  let current;
  const h = harness({
    onCapture: async (_image, isCurrent) => {
      current = isCurrent;
      await encoding.promise;
    },
  });
  await h.session.start();
  await h.next();
  const pending = h.next();
  await new Promise((r) => setImmediate(r));
  assert.equal(current(), true);
  h.session.stop();
  assert.equal(current(), false);
  encoding.resolve();
  await pending;
  assert.equal(h.queue.size, 0);
});
test("quality rejection keeps the camera available for a corrected capture", async () => {
  let fail = true;
  const h = harness({
    scanner: {
      detect: () => points,
      normalize: (i) => {
        if (fail) throw Error("blurred");
        return i;
      },
    },
  });
  await h.session.start();
  await h.next();
  await h.next();
  assert.equal(h.events.filter((e) => e[0] === "error").length, 1);
  assert.equal(h.events.filter((e) => e[0] === "release").length, 0);
  fail = false;
  await h.next();
  await h.next();
  await h.next();
  assert.equal(h.events.filter((e) => e[0] === "capture").length, 1);
});
test("permission and preparation failures settle without leaving a camera or timer", async () => {
  for (const options of [
    { acquire: () => Promise.reject(Error("denied")) },
    { prepare: () => Promise.reject(Error("unavailable")) },
  ]) {
    const h = harness(options);
    await h.session.start();
    assert.equal(h.events.filter((e) => e[0] === "error").length, 1);
    assert.equal(h.queue.size, 0);
    h.session.stop();
  }
});
