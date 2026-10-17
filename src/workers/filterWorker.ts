// Filter worker: runs heavy image filters off the main thread.
// Receives { imageData, filter, params } — replies with { data, width, height, id }.

import { gaussianBlur, boxBlur, sharpen, pixelate, addNoise, edgeDetect, sepia, invertImage, grayscaleImage, applyAdjustment } from '../editor/imaging';

interface FilterRequest {
  id: number;
  imageData: { data: Uint8ClampedArray; width: number; height: number };
  filter: string;
  params: Record<string, number>;
  adjustment?: unknown;
}

self.onmessage = (e: MessageEvent<FilterRequest>) => {
  const { id, imageData, filter, params, adjustment } = e.data;
  const img = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  let out: ImageData;
  if (adjustment) {
    out = applyAdjustment(img, adjustment as Parameters<typeof applyAdjustment>[1]);
  } else {
    switch (filter) {
      case 'gaussian-blur': out = gaussianBlur(img, params.radius ?? 5); break;
      case 'box-blur': out = boxBlur(img, params.radius ?? 5); break;
      case 'sharpen': out = sharpen(img, params.amount ?? 1); break;
      case 'pixelate': out = pixelate(img, params.size ?? 10); break;
      case 'noise': out = addNoise(img, params.amount ?? 30); break;
      case 'edge-detect': out = edgeDetect(img); break;
      case 'sepia': out = sepia(img); break;
      case 'invert': out = invertImage(img); break;
      case 'grayscale': out = grayscaleImage(img); break;
      default: out = img;
    }
  }
  (self as unknown as Worker).postMessage({
    id,
    data: out.data,
    width: out.width,
    height: out.height,
  });
};
