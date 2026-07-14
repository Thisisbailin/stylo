const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

const readChunkType = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

export const pngHasTransparency = (input: ArrayBuffer | Uint8Array): boolean => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 33 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset: number = PNG_SIGNATURE.length;
  let indexedColor = false;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (nextOffset > bytes.length) return false;

    const chunkType = readChunkType(bytes, typeOffset);
    if (chunkType === "IHDR") {
      if (length < 13) return false;
      const colorType = bytes[dataOffset + 9];
      if (colorType === 4 || colorType === 6) return true;
      indexedColor = colorType === 3;
    } else if (chunkType === "tRNS") {
      return length > 0 || indexedColor;
    } else if (chunkType === "IEND") {
      return false;
    }
    offset = nextOffset;
  }

  return false;
};
