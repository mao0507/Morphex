// sharp（libvips）寫不出 BMP 與 ICO，這兩個容器格式夠簡單，直接照規格組 bytes

const BMP_HEADER_SIZE = 14 + 40; // BITMAPFILEHEADER + BITMAPINFOHEADER

// rgb：width*height*3 的 RGB 像素（由上而下）；輸出 24-bit、無壓縮、由下而上存列的 BMP
export function encodeBmp(rgb: Buffer, width: number, height: number): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const out = Buffer.alloc(BMP_HEADER_SIZE + rowSize * height);

  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(BMP_HEADER_SIZE, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26); // planes
  out.writeUInt16LE(24, 28); // bits per pixel
  out.writeUInt32LE(rowSize * height, 34);

  for (let y = 0; y < height; y++) {
    const rowStart = BMP_HEADER_SIZE + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      const dst = rowStart + x * 3;
      out[dst] = rgb[src + 2];
      out[dst + 1] = rgb[src + 1];
      out[dst + 2] = rgb[src];
    }
  }
  return out;
}

const ICO_HEADER_SIZE = 6;
const ICO_ENTRY_SIZE = 16;

// 每張圖以 PNG 原樣嵌入（Vista 起支援），size 最大 256——目錄欄位只有 1 byte，256 寫成 0
export function encodeIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(ICO_HEADER_SIZE + ICO_ENTRY_SIZE * images.length);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const base = ICO_HEADER_SIZE + i * ICO_ENTRY_SIZE;
    header[base] = size % 256;
    header[base + 1] = size % 256;
    header.writeUInt16LE(1, base + 4); // planes
    header.writeUInt16LE(32, base + 6); // bits per pixel
    header.writeUInt32LE(png.length, base + 8);
    header.writeUInt32LE(offset, base + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...images.map((image) => image.png)]);
}
