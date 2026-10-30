import { before, test } from "node:test";
import assert from "node:assert/strict";
import runtime from "@techstark/opencv-js";
import { createScanner } from "../vision.js";
let cv;
before(async () => {
  ({ cv } = await new Promise((resolve) => runtime.then((value) => resolve({ cv: value }))));
});
function fixture(kind = "perspective") {
  const image = new cv.Mat(1600, 1200, cv.CV_8UC4, new cv.Scalar(23, 23, 23, 255));
  try {
    if (kind !== "blank") {
      cv.rectangle(image, new cv.Point(160, 130), new cv.Point(1040, 1450), new cv.Scalar(240, 240, 240, 255), -1);
      for (let y = 280; y < 1300; y += 42)
        cv.putText(
          image,
          "SYNTHETIC DOCUMENT 123",
          new cv.Point(230, y),
          cv.FONT_HERSHEY_SIMPLEX,
          0.9,
          new cv.Scalar(15, 15, 15, 255),
          2,
        );
    }
    if (kind === "perspective" || kind === "clipped") {
      const from = cv.matFromArray(4, 1, cv.CV_32FC2, [160, 130, 1040, 130, 1040, 1450, 160, 1450]);
      const to = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        kind === "clipped" ? [0, 130, 1050, 180, 1000, 1450, 0, 1400] : [160, 130, 1050, 180, 1000, 1450, 120, 1400],
      );
      const matrix = cv.getPerspectiveTransform(from, to);
      try {
        cv.warpPerspective(
          image,
          image,
          matrix,
          new cv.Size(1200, 1600),
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar(23, 23, 23, 255),
        );
      } finally {
        from.delete();
        to.delete();
        matrix.delete();
      }
    }
    if (kind === "small") cv.resize(image, image, new cv.Size(600, 800));
    return { width: image.cols, height: image.rows, data: new Uint8ClampedArray(image.data) };
  } finally {
    image.delete();
  }
}
for (const kind of ["straight", "perspective"])
  test("real pixels normalize " + kind + " documents and retain detail", () => {
    const input = fixture(kind),
      result = createScanner(cv).normalize(input);
    assert.ok(result.width >= 500 && result.height >= 500);
    assert.equal(result.data.length, result.width * result.height * 4);
    let ink = 0;
    for (let i = 0; i < result.data.length; i += 4) if (result.data[i] < 80) ink++;
    assert.ok(ink > 5000);
    assert.notEqual(result.data.buffer, input.data.buffer);
  });
for (const kind of ["blank", "clipped", "small"])
  test(kind + " pixels cannot produce an approved document", () => {
    assert.throws(
      () => createScanner(cv).normalize(fixture(kind)),
      (e) => ["not-found", "too-small"].includes(e.code),
    );
  });
test("policy changes affect real normalized pixels", () => {
  assert.throws(
    () => createScanner(cv, { minContrast: 255 }).normalize(fixture("straight")),
    (e) => e.code === "contrast",
  );
});
test("a source with missing pixels is rejected before image processing", () => {
  assert.throws(
    () => createScanner(cv).normalize({ width: 1000, height: 1500, data: new Uint8ClampedArray(4) }),
    (e) => e.code === "invalid-frame",
  );
});
test("repeated rejection leaves the scanner usable for the next document", () => {
  const scanner = createScanner(cv),
    blank = fixture("blank");
  for (let i = 0; i < 15; i++) assert.throws(() => scanner.normalize(blank));
  assert.equal(scanner.detect(fixture("perspective")).length, 4);
  assert.ok(scanner.normalize(fixture("straight")).width >= 500);
});
