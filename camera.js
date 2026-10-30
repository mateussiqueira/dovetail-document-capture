export function createCaptureSession(options) {
  const {
    acquire,
    release,
    prepare,
    snapshot,
    scanner,
    onGuide = () => {},
    onCapture,
    onError = () => {},
    schedule = setTimeout,
    cancel = clearTimeout,
    interval = 600,
    stableFrames = 3,
    tolerance = 0.015,
  } = options;
  const validLimits = [interval, tolerance].every((value) => Number.isFinite(value) && value >= 0);
  if (!validLimits || !Number.isInteger(stableFrames) || stableFrames < 2)
    throw new TypeError("Invalid session policy");
  let generation = 0,
    resource = null,
    timer = null,
    previous = null,
    stable = 0;
  function dispose() {
    if (timer !== null) cancel(timer);
    timer = null;
    if (resource !== null) release(resource);
    resource = null;
    previous = null;
    stable = 0;
  }
  function stop() {
    generation++;
    dispose();
  }
  async function tick(turn) {
    if (turn !== generation || resource === null) return;
    try {
      const image = await snapshot(false);
      if (turn !== generation) return;
      const points = scanner.detect(image);
      onGuide(points);
      const same =
        points &&
        previous &&
        points.length === previous.length &&
        points.every((p, i) => Math.hypot(p.x - previous[i].x, p.y - previous[i].y) <= tolerance);
      stable = points ? (same ? stable + 1 : 1) : 0;
      previous = points;
      if (stable >= stableFrames) {
        const full = await snapshot(true);
        if (turn !== generation) return;
        const result = scanner.normalize(full);
        dispose();
        await onCapture(result, () => turn === generation);
      }
    } catch (error) {
      if (turn === generation) {
        previous = null;
        stable = 0;
        onError(error);
      }
    } finally {
      if (turn === generation && resource !== null) timer = schedule(() => tick(turn), interval);
    }
  }
  async function start() {
    stop();
    const turn = generation;
    try {
      const opened = await acquire();
      if (turn !== generation) {
        release(opened);
        return;
      }
      resource = opened;
      await prepare(opened);
      if (turn === generation) await tick(turn);
    } catch (error) {
      if (turn === generation) {
        stop();
        onError(error);
      }
    }
  }
  return { start, stop };
}
