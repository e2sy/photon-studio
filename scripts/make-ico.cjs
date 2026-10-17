// Builds src-tauri/icons/icon.ico from the generated PNGs (ICO container).
const fs = require('fs');
const entries = [
  { w: 32, data: fs.readFileSync('src-tauri/icons/32x32.png') },
  { w: 128, data: fs.readFileSync('src-tauri/icons/128x128.png') },
];
let offset = 6 + 16 * entries.length;
const parts = [Buffer.from([0, 0, 1, 0, entries.length, 0])];
for (const e of entries) {
  const h = Buffer.alloc(16);
  h[0] = e.w; // width (0 means 256; ours are smaller)
  h[2] = e.w; // height
  h[4] = 0; h[5] = 0; // color count / reserved
  h.writeUInt16LE(1, 4);  // planes
  h.writeUInt16LE(32, 6); // bpp
  h.writeUInt32LE(e.data.length, 8); // data size
  h.writeUInt32LE(offset, 12);       // data offset
  parts.push(h);
  offset += e.data.length;
}
for (const e of entries) parts.push(e.data);
fs.writeFileSync('src-tauri/icons/icon.ico', Buffer.concat(parts));
console.log('icon.ico written:', fs.statSync('src-tauri/icons/icon.ico').size, 'bytes');
