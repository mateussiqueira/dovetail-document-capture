import { CaptureError, capturePolicy, frameGeometry, assessQuality } from "./index.js";
export function createScanner(cv, input = {}) {
  const policy = capturePolicy(input);
  function read(image) {
    const { width, height, data } = image;
    if (![width, height].every((n) => Number.isInteger(n) && n > 0) || data?.length !== width * height * 4)
      throw new CaptureError("invalid-frame");
    if (width * height > policy.maxPixels) throw new CaptureError("image-too-large");
    return cv.matFromImageData(image);
  }
  function find(source) {
    const small = new cv.Mat(),
      gray = new cv.Mat(),
      edges = new cv.Mat(),
      contours = new cv.MatVector(),
      hierarchy = new cv.Mat();
    let best = null,
      largest = 0;
    try {
      const scale = Math.min(1, 720 / Math.max(source.cols, source.rows));
      cv.resize(source, small, new cv.Size(Math.round(source.cols * scale), Math.round(source.rows * scale)));
      cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
      cv.Canny(gray, edges, 40, 120);
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i),
          polygon = new cv.Mat();
        try {
          cv.approxPolyDP(contour, polygon, 0.02 * cv.arcLength(contour, true), true);
          const area = cv.contourArea(polygon);
          if (polygon.rows !== 4 || area <= largest) continue;
          const points = Array.from({ length: 4 }, (_, j) => ({
            x: polygon.data32S[j * 2] / small.cols,
            y: polygon.data32S[j * 2 + 1] / small.rows,
          }));
          const geometry = frameGeometry(points, { width: small.cols, height: small.rows }, { ...policy, minEdge: 1 });
          best = geometry.points.map((p) => ({ x: p.x / small.cols, y: p.y / small.rows }));
          largest = area;
        } catch (error) {
          if (!(error instanceof CaptureError)) throw error;
        } finally {
          contour.delete();
          polygon.delete();
        }
      }
      return best;
    } finally {
      small.delete();
      gray.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
    }
  }
  function metrics(source) {
    const small = new cv.Mat(),
      gray = new cv.Mat(),
      lap = new cv.Mat(),
      mean = new cv.Mat(),
      deviation = new cv.Mat();
    try {
      const scale = Math.min(1, 600 / Math.max(source.cols, source.rows));
      cv.resize(source, small, new cv.Size(Math.round(source.cols * scale), Math.round(source.rows * scale)));
      cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
      cv.meanStdDev(gray, mean, deviation);
      const light = mean.data64F[0],
        contrast = deviation.data64F[0];
      cv.Laplacian(gray, lap, cv.CV_64F);
      cv.meanStdDev(lap, mean, deviation);
      return { mean: light, contrast, sharpness: deviation.data64F[0] ** 2 };
    } finally {
      small.delete();
      gray.delete();
      lap.delete();
      mean.delete();
      deviation.delete();
    }
  }
  function detect(image) {
    const source = read(image);
    try {
      return find(source);
    } finally {
      source.delete();
    }
  }
  function normalize(image) {
    const source = read(image),
      output = new cv.Mat();
    let from, to, transform;
    try {
      const geometry = frameGeometry(find(source), image, policy);
      from = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        geometry.points.flatMap((p) => [p.x, p.y]),
      );
      to = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        geometry.width - 1,
        0,
        geometry.width - 1,
        geometry.height - 1,
        0,
        geometry.height - 1,
      ]);
      transform = cv.getPerspectiveTransform(from, to);
      cv.warpPerspective(source, output, transform, new cv.Size(geometry.width, geometry.height));
      assessQuality(metrics(output), policy);
      return { width: output.cols, height: output.rows, data: new Uint8ClampedArray(output.data) };
    } finally {
      source.delete();
      output.delete();
      from?.delete();
      to?.delete();
      transform?.delete();
    }
  }
  return { detect, normalize };
}
