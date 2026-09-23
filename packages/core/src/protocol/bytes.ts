/** Big-endian readers over a payload. Null when the bytes run out, never a guess. */

export type Bytes = readonly number[];

/** IEEE 754 single at `offset`. */
export function float32At (bytes: Bytes, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  const view = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < 4; i++) view.setUint8(i, bytes[offset + i] ?? 0);
  return view.getFloat32(0);
}

export function uint16At (bytes: Bytes, offset: number): number | null {
  const hi = bytes[offset], lo = bytes[offset + 1];
  if (hi === undefined || lo === undefined) return null;
  return (hi << 8) | lo;
}

export function int16At (bytes: Bytes, offset: number): number | null {
  const u = uint16At(bytes, offset);
  return u === null ? null : (u & 0x8000 ? u - 0x10000 : u);
}

export function uint32At (bytes: Bytes, offset: number): number | null {
  const hi = uint16At(bytes, offset), lo = uint16At(bytes, offset + 2);
  if (hi === null || lo === null) return null;
  return hi * 0x10000 + lo;
}
