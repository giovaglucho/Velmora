import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

/** Raw straight-alpha RGBA8 image. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array; // length = width * height * 4
}

export function createRgba(width: number, height: number): Rgba {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/**
 * Encode as PNG with fixed zlib parameters and no metadata, so identical pixels give identical bytes
 * on the same Node/zlib build (the manifest sha256 is only comparable across runs of the same build).
 */
export function encodePng(img: Rgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
    deflateStrategy: 3,
    filterType: 4,
  });
}

export function decodePng(buf: Uint8Array): Rgba {
  const png = PNG.sync.read(Buffer.from(buf));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}
