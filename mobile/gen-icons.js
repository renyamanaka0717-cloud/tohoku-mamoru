// Generates solid-color placeholder PNG assets for Expo.
// Run: node gen-icons.js
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t   = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function solidPNG(w, h, r, g, b) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8]=8; ihdr[9]=2; // 8-bit RGB
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { row[1+x*3]=r; row[1+x*3+1]=g; row[1+x*3+2]=b; }
  const raw = Buffer.concat(Array.from({length:h}, ()=>row));
  return Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw,{level:1})), chunk('IEND',Buffer.alloc(0))]);
}

const dir = path.join(__dirname, 'assets');
// Accent color: #D9A3B2
const [R,G,B] = [0xD9, 0xA3, 0xB2];
fs.writeFileSync(path.join(dir,'icon.png'),          solidPNG(1024,1024,R,G,B));
fs.writeFileSync(path.join(dir,'adaptive-icon.png'), solidPNG(1024,1024,R,G,B));
fs.writeFileSync(path.join(dir,'splash.png'),        solidPNG(1284,2778,R,G,B));
fs.writeFileSync(path.join(dir,'favicon.png'),       solidPNG(32,32,R,G,B));
console.log('Icons generated in assets/');
