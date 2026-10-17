// Native desktop file bridge.
// Uses Tauri's dialog + fs plugins when running as a desktop app;
// falls back to browser download/file-picker in a plain web context.

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauri(): Promise<typeof import('@tauri-apps/api')> {
  return import('@tauri-apps/api');
}

export interface NativeFile {
  name: string;
  data: Uint8Array;
}

/** Show a native Open dialog and read the selected file. Returns null on cancel. */
export async function openFileNative(
  filters: { name: string; extensions: string[] }[],
): Promise<NativeFile | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readBinaryFile } = (await tauri()) as any;
    const path = await open({ filters, multiple: false });
    if (!path || typeof path !== 'string') return null;
    const data = await (window as any).__TAURI__.fs.readBinaryFile(path);
    const name = path.split(/[\\/]/).pop() ?? 'file';
    return { name, data: new Uint8Array(data) };
  }
  return null; // browser fallback handled by caller via <input type=file>
}

/** Show a native Save dialog and write bytes to disk. Returns the saved path or null. */
export async function saveFileNative(
  defaultName: string,
  filters: { name: string; extensions: string[] }[],
  data: Uint8Array,
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: defaultName, filters });
    if (!path) return null;
    await (window as any).__TAURI__.fs.writeBinaryFile(path, data);
    return path;
  }
  return null;
}

/** Open a directory of recovery files — not needed yet; reserved. */
export const hasNativeDialogs = isTauri;
