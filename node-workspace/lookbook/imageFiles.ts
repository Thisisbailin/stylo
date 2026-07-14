import type { LookbookImageAssetInput } from "../../utils/lookbookWorkspace";
import { pngHasTransparency } from "../../utils/pngTransparency";

export const LOOKBOOK_IMAGE_FILE_LIMIT = 12;
export const LOOKBOOK_IMAGE_BYTE_LIMIT = 20 * 1024 * 1024;
export const LOOKBOOK_IMAGE_BATCH_BYTE_LIMIT = 80 * 1024 * 1024;
export const LOOKBOOK_IMAGE_PIXEL_LIMIT = 40_000_000;
const LOOKBOOK_IMAGE_DECODE_CONCURRENCY = 3;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const mimeTypeForFile = (file: File) => {
  if (SUPPORTED_IMAGE_TYPES.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "";
};

const readFileAsDataUrl = (file: File, mimeType: string) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
  reader.onload = () => {
    if (typeof reader.result === "string") {
      const commaIndex = reader.result.indexOf(",");
      if (commaIndex > 0) {
        resolve(`data:${mimeType};base64,${reader.result.slice(commaIndex + 1)}`);
        return;
      }
    }
    reject(new Error(`${file.name} 不是可用的图片文件`));
  };
  reader.readAsDataURL(file);
});

const decodeDimensions = async (file: File, dataUrl: string) => {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`无法解码 ${file.name}`));
    image.src = dataUrl;
  });
};

export const inspectLookbookImageFile = async (file: File): Promise<LookbookImageAssetInput> => {
  const mimeType = mimeTypeForFile(file);
  if (!mimeType) throw new Error(`${file.name} 的格式不受支持，请使用 PNG、JPEG、WebP 或 GIF`);
  if (file.size <= 0) throw new Error(`${file.name} 是空文件`);
  if (file.size > LOOKBOOK_IMAGE_BYTE_LIMIT) throw new Error(`${file.name} 超过 20 MiB 限制`);

  const [dataUrl, bytes] = await Promise.all([
    readFileAsDataUrl(file, mimeType),
    mimeType === "image/png" ? file.arrayBuffer() : Promise.resolve(null),
  ]);
  const dimensions = await decodeDimensions(file, dataUrl);
  if (dimensions.width <= 0 || dimensions.height <= 0) throw new Error(`${file.name} 没有有效尺寸`);
  if (dimensions.width * dimensions.height > LOOKBOOK_IMAGE_PIXEL_LIMIT) {
    throw new Error(`${file.name} 超过 4000 万像素限制`);
  }

  return {
    name: file.name,
    dataUrl,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    hasAlpha: bytes ? pngHasTransparency(bytes) : false,
  };
};

export const inspectLookbookImageFiles = async (files: File[]) => {
  if (!files.length) return [];
  if (files.length > LOOKBOOK_IMAGE_FILE_LIMIT) {
    throw new Error(`单次最多导入 ${LOOKBOOK_IMAGE_FILE_LIMIT} 张图片`);
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > LOOKBOOK_IMAGE_BATCH_BYTE_LIMIT) {
    throw new Error("单次导入总量不能超过 80 MiB");
  }

  const results = new Array<LookbookImageAssetInput>(files.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await inspectLookbookImageFile(files[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(LOOKBOOK_IMAGE_DECODE_CONCURRENCY, files.length) }, () => worker())
  );
  return results;
};
