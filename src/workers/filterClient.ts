// Client for the filter worker: promise-based, supports cancellation by
// ignoring stale results via request ids.

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (img: ImageData) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./filterWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { id, data, width, height } = e.data;
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p.resolve(new ImageData(new Uint8ClampedArray(data), width, height));
      }
    };
    worker.onerror = (e) => {
      // fail all pending on worker crash
      for (const [, p] of pending) p.reject(new Error(e.message || 'Filter worker error'));
      pending.clear();
    };
  }
  return worker;
}

export function runFilterAsync(
  img: ImageData,
  filter: string,
  params: Record<string, number>,
): Promise<ImageData> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<ImageData>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(
      {
        id,
        imageData: { data: img.data, width: img.width, height: img.height },
        filter,
        params,
      },
      // structured clone is fine; avoid transferring since caller keeps original
    );
  });
}

export function runAdjustmentAsync(img: ImageData, adjustment: unknown): Promise<ImageData> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<ImageData>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({
      id,
      imageData: { data: img.data, width: img.width, height: img.height },
      filter: 'none',
      params: {},
      adjustment,
    });
  });
}
