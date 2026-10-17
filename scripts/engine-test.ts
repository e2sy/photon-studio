// Engine smoke test — runs the core editor engine headlessly in Node by
// stubbing the minimal browser canvas APIs used by the pure-pixel code paths.

// ---- minimal canvas / ImageData stubs ----
class FakeImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(w: number, h: number, data?: Uint8ClampedArray) {
    this.width = w;
    this.height = h;
    this.data = data ?? new Uint8ClampedArray(w * h * 4);
  }
}

// ImageData stub supporting both spec orders: (data, w, h) and (w, h).
(global as any).ImageData = function (this: any, a: any, b: any, c?: any) {
  if (typeof a === 'number') {
    // (w, h)
    this.width = a;
    this.height = b;
    this.data = new Uint8ClampedArray(a * b * 4);
  } else {
    // (data, w, h)
    this.data = a;
    this.width = b;
    this.height = c;
  }
} as any;

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}`); }
}

async function main() {
  // ---- blend + compositing ----
  const { compositeTile } = await import('../src/editor/blend');

  {
    // normal blend: red 50% alpha over opaque blue
    const dst = new Uint8ClampedArray([0, 0, 255, 255]);
    const src = new Uint8ClampedArray([255, 0, 0, 128]);
    compositeTile(dst, src, 'normal', 1, 4);
    check('blend normal alpha-over', Math.abs(dst[0] - 128) < 2 && dst[3] === 255);
  }
  {
    // multiply: 0.5 gray * 0.5 gray = 0.25 => 64
    const dst = new Uint8ClampedArray([128, 128, 128, 255]);
    const src = new Uint8ClampedArray([128, 128, 128, 255]);
    compositeTile(dst, src, 'multiply', 1, 4);
    check('blend multiply 128*128=64', Math.abs(dst[0] - 64) < 2);
  }
  {
    // screen: 128,128 => 1-(1-.502)^2 = .751 => ~191
    const dst = new Uint8ClampedArray([128, 128, 128, 255]);
    const src = new Uint8ClampedArray([128, 128, 128, 255]);
    compositeTile(dst, src, 'screen', 1, 4);
    check('blend screen ~191', Math.abs(dst[0] - 191) < 3);
  }

  // ---- document + layers ----
  const { createDocument, hexToRgb } = await import('../src/editor/document');
  const doc = createDocument(64, 64, 'test', '#ff0000');
  check('document created 64x64', doc.width === 64 && doc.height === 64);
  check('background layer filled red', doc.layers[0].data.data[0] === 255 && doc.layers[0].data.data[1] === 0);
  check('hex parse', hexToRgb('#1e1e1e').r === 0x1e);

  // ---- painting ----
  const { paintStamp, paintStroke } = await import('../src/editor/painting');
  const layer = doc.layers[0];
  paintStamp(layer.data, 32, 32, 10, 1, 1, { r: 0, g: 0, b: 255 });
  const i = (32 * 64 + 32) * 4;
  check('paint stamp sets pixel blue', layer.data.data[i] === 0 && layer.data.data[i + 2] === 255);
  paintStroke(layer.data, [{ x: 0, y: 0 }, { x: 40, y: 0 }], 4, 1, 1, '#00ff00');
  check('paint stroke interpolates', layer.data.data[2] === 0 && layer.data.data[1] === 255);

  // ---- history (undo/redo) ----
  const { History } = await import('../src/editor/history');
  const h = new History(10);
  const b = h.begin().captureBefore(doc, 'Test Stroke', [layer.id]);
  paintStamp(layer.data, 10, 10, 8, 1, 1, { r: 255, g: 255, b: 255 });
  b.captureAfter(doc, [layer.id]).commit();
  const px = (10 * 64 + 10) * 4;
  check('stroke applied', layer.data.data[px] === 255);
  // undo restores pixel data
  h.undo(doc);
  check('undo restores pixel data to red background', layer.data.data[px] === 255 && layer.data.data[px + 1] === 0);
  check('undo preserves earlier blue stamp', layer.data.data[i] === 0 && layer.data.data[i + 2] === 255);
  h.redo(doc);
  check('redo re-applies pixel data', layer.data.data[px] === 255);

  // ---- imaging filters ----
  const { grayscaleImage, invertImage, pixelate, edgeDetect, gaussianBlur, sepia } = await import('../src/editor/imaging');
  const img = new (global as any).ImageData(16, 16);
  for (let p = 0; p < 16 * 16; p++) {
    img.data[p * 4] = 200; img.data[p * 4 + 1] = 100; img.data[p * 4 + 2] = 50; img.data[p * 4 + 3] = 255;
  }
  const gray = grayscaleImage(img as any);
  const lum = Math.round(0.2126 * 200 + 0.7152 * 100 + 0.0722 * 50);
  check('grayscale luminance', Math.abs(gray.data[0] - lum) < 2);
  const inv = invertImage(img as any);
  check('invert', inv.data[0] === 55 && inv.data[1] === 155);
  const gblur = gaussianBlur(img as any, 2);
  check('gaussian blur preserves center', gblur.data[0] === 200);
  const pixelated = pixelate(img as any, 4);
  check('pixelate keeps color', pixelated.data[0] === 200);
  const sep = sepia(img as any);
  check('sepia warms image (r>g>b)', sep.data[0] > sep.data[1] && sep.data[1] > sep.data[2] && sep.data[0] > 150);

  // ---- serializer round-trip ----
  const { serializeDocument, deserializeDocument } = await import('../src/editor/serializer');
  doc.layers.push({
    id: 'text-1', name: 'Caption', type: 'text', text: 'Hello', fontFamily: 'Inter',
    fontSize: 32, fontWeight: 400, italic: false, align: 'left', color: '#000000',
    lineHeight: 1.2, letterSpacing: 0, visible: true, opacity: 1, blendMode: 'normal',
    locked: false, x: 5, y: 5, width: 100, height: 40, mask: null, parentId: null,
  } as any);
  doc.layers[0].opacity = 0.5;
  const json = serializeDocument(doc);
  const restored = deserializeDocument(json);
  check('serialize/deserialize layer count', restored.layers.length === doc.layers.length);
  check('text layer survives round-trip', (restored.layers[1] as any).text === 'Hello');
  check('opacity survives round-trip', restored.layers[0].opacity === 0.5);
  check('pixel data survives round-trip', Math.abs(restored.layers[0].data.data[i] - doc.layers[0].data.data[i]) < 1);

  // ---- malformed project rejection ----
  let threw = false;
  try { deserializeDocument('{"version":999,"document":{},"layers":[]}'); } catch { threw = true; }
  check('rejects wrong version', threw);
  threw = false;
  try { deserializeDocument('not json at all'); } catch { threw = true; }
  check('rejects corrupt json', threw);

  // ---- adjustment engine ----
  const { applyAdjustment } = await import('../src/editor/renderer');
  const adjImg = new (global as any).ImageData(4, 4);
  for (let p = 0; p < 16; p++) {
    adjImg.data[p * 4] = 100; adjImg.data[p * 4 + 1] = 100; adjImg.data[p * 4 + 2] = 100; adjImg.data[p * 4 + 3] = 255;
  }
  const brightened = applyAdjustment(adjImg as any, {
    kind: 'brightness-contrast', brightness: 50, contrast: 0, hue: 0, saturation: 0,
    lightness: 0, invert: false, grayscale: false, blackPoint: 0, whitePoint: 255,
  } as any);
  check('brightness +50', Math.abs(brightened.data[0] - 227) < 3);

  // ---- shape drawing ----
  const { drawLine, drawRect, drawEllipse, applyGradient, hexToRgba } = await import('../src/editor/imaging');
  const shapeImg = new (global as any).ImageData(32, 32);
  drawLine(shapeImg as any, 0, 16, 31, 16, 3, '#ff0000');
  check('line drawn at center', shapeImg.data[(16 * 32 + 16) * 4] === 255 && shapeImg.data[(16 * 32 + 16) * 4 + 1] === 0);
  check('line thickness covers above', shapeImg.data[(15 * 32 + 16) * 4] === 255);

  const rectImg = new (global as any).ImageData(32, 32);
  drawRect(rectImg as any, 4, 4, 20, 20, true, 2, '#00ff00');
  check('filled rect interior', rectImg.data[(10 * 32 + 10) * 4 + 1] === 255);
  const rectOutline = new (global as any).ImageData(32, 32);
  drawRect(rectOutline as any, 4, 4, 20, 20, false, 2, '#00ff00');
  check('rect outline hollow center', rectOutline.data[(12 * 32 + 12) * 4 + 1] === 0 && rectOutline.data[(4 * 32 + 12) * 4 + 1] === 255);

  const ellImg = new (global as any).ImageData(32, 32);
  drawEllipse(ellImg as any, 4, 4, 26, 26, true, '#0000ff');
  check('filled ellipse center', ellImg.data[(15 * 32 + 15) * 4 + 2] === 255);
  check('ellipse outside empty', ellImg.data[(1 * 32 + 1) * 4 + 2] === 0);

  // ---- gradient ----
  const gradImg = new (global as any).ImageData(16, 4);
  applyGradient(gradImg as any, 0, 0, 15, 0, '#000000', '#ffffff', 'linear');
  check('gradient left black', gradImg.data[0] < 20);
  check('gradient right white', gradImg.data[(3 * 16 + 15) * 4] > 235);
  const mid = gradImg.data[(3 * 16 + 8) * 4];
  check('gradient mid ~128', mid > 100 && mid < 155);

  // gradient honors selection mask
  const selImg = new (global as any).ImageData(16, 4);
  const selMask = new (global as any).ImageData(16, 4);
  for (let x = 0; x < 8; x++) selMask.data[(2 * 16 + x) * 4] = 255;
  for (let p = 0; p < 16 * 4; p++) selImg.data[p * 4 + 3] = 255; // opaque base
  applyGradient(selImg as any, 0, 0, 15, 0, '#ff0000', '#ff0000', 'linear', selMask as any);
  check('gradient restricted to selection', selImg.data[(2 * 16 + 12) * 4] === 0 && selImg.data[(2 * 16 + 4) * 4] === 255);

  // ---- add/undo/redo layer round trip ----
  const docB = createDocument(16, 16, 'b', '#000000');
  const hB = new History(10);
  const newLayer = {
    id: 'extra-layer', name: 'Extra', type: 'raster', visible: true, opacity: 1,
    blendMode: 'normal', locked: false, x: 0, y: 0, width: 16, height: 16,
    data: new (global as any).ImageData(16, 16), mask: null, parentId: null,
  } as any;
  docB.layers.push(newLayer);
  hB.begin().captureBefore(docB, 'Add Layer', []).markAdded(newLayer).captureAfter(docB, ['extra-layer']).commit();
  check('layer present after add', docB.layers.length === 2);
  hB.undo(docB);
  check('undo removes added layer', docB.layers.length === 1);
  hB.redo(docB);
  check('redo re-adds layer object', docB.layers.length === 2 && docB.layers[1].id === 'extra-layer');

  // ---- undo delete layer restores it ----
  const hC = new History(10);
  const victim = docB.layers[1];
  hC.begin().captureBefore(docB, 'Delete Layer', [victim.id]).markRemoved(victim).captureAfter(docB, []).commit();
  docB.layers = docB.layers.filter((l) => l.id !== victim.id);
  check('layer deleted', docB.layers.length === 1);
  hC.undo(docB);
  check('undo restores deleted layer', docB.layers.length === 2);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log('FAILURES:', failures.join(', ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
