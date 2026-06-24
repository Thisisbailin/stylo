import type {
  GlobalAssetHistoryItem,
  NodeFlowFile,
  NodeFlowLink,
  NodeFlowNode,
  NodeFlowNodeData,
} from "../types";
import { getFoundationAxisDefinition, isFoundationAxis } from "../foundation/axes";

type ZipEntryInput = {
  path: string;
  data: Uint8Array;
  mimeType?: string;
};

type ZipEntry = {
  path: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  dataOffset: number;
  data: Uint8Array;
};

type PackageResourceKind = "document" | "media";

type PackageResource = {
  path: string;
  kind: PackageResourceKind;
  mimeType?: string;
  originalValue?: string;
};

type PackageNodeData = NodeFlowNodeData & {
  qalamPackageResources?: Record<string, PackageResource>;
};

type QalamPackageManifest = {
  format: "qalam-project-package";
  version: 1;
  createdAt: string;
  packageRoot: string;
  nodeFlowPath: string;
  assetCount: number;
  unresolvedAssetCount: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const QALAM_PACKAGE_NODEFLOW_PATH = ".qalam/nodeflow.json";
const QALAM_PACKAGE_MANIFEST_PATH = ".qalam/manifest.json";
const QALAM_RESOURCE_FIELD = "qalamPackageResources";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
const writeUint32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value >>> 0, true);
const readUint16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const readUint32 = (view: DataView, offset: number) => view.getUint32(offset, true);

const concatBytes = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const toDosDateTime = (date: Date) => {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
};

const createZip = (entries: ZipEntryInput[]) => {
  const now = new Date();
  const { dosTime, dosDate } = toDosDateTime(now);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.path);
    const data = entry.data;
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, dosTime);
    writeUint16(localView, 12, dosDate);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, data.length);
    writeUint32(localView, 22, data.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, dosTime);
    writeUint16(centralView, 14, dosDate);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, data.length);
    writeUint32(centralView, 24, data.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, entry.path.endsWith("/") ? 0x10 : 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  return new Blob([...localParts, centralDirectory, end], { type: "application/zip" });
};

const findEndOfCentralDirectory = (bytes: Uint8Array) => {
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
};

const inflateRaw = async (data: Uint8Array) => {
  const DecompressionStreamCtor = (globalThis as { DecompressionStream?: new (format: string) => TransformStream }).DecompressionStream;
  if (!DecompressionStreamCtor) {
    throw new Error("当前浏览器不支持读取压缩 zip，请使用 Qalam 导出的项目包或无压缩 zip。");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readZip = async (file: File | Blob) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) throw new Error("不是有效的 zip 文件。");
  const entryCount = readUint16(view, endOffset + 10);
  const centralOffset = readUint32(view, endOffset + 16);
  const entries = new Map<string, ZipEntry>();
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, cursor) !== 0x02014b50) throw new Error("zip 中央目录损坏。");
    const method = readUint16(view, cursor + 10);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const nameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const path = textDecoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataOffset, dataOffset + compressedSize);
    if (!path.endsWith("/")) {
      entries.set(path, { path, method, compressedSize, uncompressedSize, localHeaderOffset, dataOffset, data });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const readZipEntry = async (entries: Map<string, ZipEntry>, path: string, packageRoot = "") => {
  const prefixedPath = packageRoot ? `${packageRoot.replace(/\/$/, "")}/${path}` : path;
  const entry = entries.get(path) || entries.get(prefixedPath);
  if (!entry) throw new Error(`项目包缺少文件：${path}`);
  if (entry.method === 0) return entry.data;
  if (entry.method === 8) {
    const inflated = await inflateRaw(entry.data);
    if (inflated.length !== entry.uncompressedSize) {
      throw new Error(`项目包文件大小不匹配：${path}`);
    }
    return inflated;
  }
  throw new Error(`不支持的 zip 压缩方式：${entry.method}`);
};

const sanitizePathSegment = (value: string, fallback: string) => {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
};

const splitFilename = (name: string) => {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return { stem: name, extension: "" };
  return { stem: name.slice(0, dot), extension: name.slice(dot) };
};

const createUniquePath = (path: string, occupiedPaths: Set<string>) => {
  const normalized = path.toLocaleLowerCase();
  if (!occupiedPaths.has(normalized)) {
    occupiedPaths.add(normalized);
    return path;
  }
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? `${path.slice(0, slash + 1)}` : "";
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const { stem, extension } = splitFilename(filename);
  let index = 1;
  while (true) {
    const suffix = index === 1 ? " 副本" : ` 副本 ${index}`;
    const candidate = `${directory}${stem}${suffix}${extension}`;
    const candidateKey = candidate.toLocaleLowerCase();
    if (!occupiedPaths.has(candidateKey)) {
      occupiedPaths.add(candidateKey);
      return candidate;
    }
    index += 1;
  }
};

const getNodeTitle = (node: NodeFlowNode) => {
  const data = node.data as { filename?: string | null; title?: string; label?: string };
  return data.filename?.trim() || data.title?.trim() || data.label?.trim() || node.id;
};

const getExtensionForDocumentNode = (node: NodeFlowNode) => {
  const format = (node.data as { format?: string }).format;
  if (format === "fountain" || node.type === "scriptPage") return ".fountain";
  if (format === "plain") return ".txt";
  return ".md";
};

const ensureFilenameExtension = (name: string, extension: string) => {
  const trimmed = name.trim();
  if (/\.[^/.]+$/.test(trimmed)) return trimmed;
  return `${trimmed}${extension}`;
};

const getMimeFromPath = (path: string, fallback = "application/octet-stream") => {
  const ext = path.split(".").pop()?.toLocaleLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  if (ext === "md") return "text/markdown;charset=utf-8";
  if (ext === "fountain" || ext === "txt") return "text/plain;charset=utf-8";
  return fallback;
};

const dataUrlToBytes = (value: string) => {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  if (!isBase64) return { bytes: textEncoder.encode(decodeURIComponent(payload)), mimeType };
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
};

const bytesToDataUrl = (bytes: Uint8Array, mimeType: string) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
  }
  return `data:${mimeType || "application/octet-stream"};base64,${btoa(binary)}`;
};

const resolveMediaBytes = async (value: string, fallbackMimeType: string) => {
  const dataUrl = dataUrlToBytes(value);
  if (dataUrl) return dataUrl;
  if (!/^https?:\/\//i.test(value) && !value.startsWith("blob:")) return null;
  try {
    const response = await fetch(value);
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type")?.split(";")[0] || fallbackMimeType;
    return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType };
  } catch {
    return null;
  }
};

const createPathResolver = (nodeFlow: NodeFlowFile) => {
  const nodeById = new Map(nodeFlow.nodes.map((node) => [node.id, node]));
  const blockDocumentParent = new Map<string, string>();
  for (const link of nodeFlow.links || []) {
    const source = nodeById.get(link.source);
    const target = nodeById.get(link.target);
    if (source?.data?.foundationRole === "block-folder" && target?.data?.foundationRole === "block-document") {
      blockDocumentParent.set(target.id, source.id);
    }
  }

  const getBlockPath = (blockId?: string | null) => {
    const block = blockId ? nodeById.get(blockId) : null;
    const axis = block?.data?.foundationAxis;
    const axisLabel = isFoundationAxis(axis) ? getFoundationAxisDefinition(axis).label : "项目文件夹";
    const blockTitle = block ? sanitizePathSegment(getNodeTitle(block), "未命名区块") : "";
    return block ? `${sanitizePathSegment(axisLabel, "轴")}/${blockTitle}` : "项目文件夹";
  };

  return (node: NodeFlowNode) => {
    const role = node.data?.foundationRole;
    if (role === "project-index") return "";
    if (role === "block-document") return getBlockPath(blockDocumentParent.get(node.id));
    return getBlockPath((node.data as { foundationContainerId?: string }).foundationContainerId);
  };
};

const addResource = (
  node: NodeFlowNode,
  field: string,
  resource: PackageResource
) => {
  const data = node.data as PackageNodeData;
  node.data = {
    ...data,
    [QALAM_RESOURCE_FIELD]: {
      ...(data[QALAM_RESOURCE_FIELD] || {}),
      [field]: resource,
    },
  } as NodeFlowNodeData;
};

const clearPackedField = (node: NodeFlowNode, field: string, fallbackValue: unknown) => {
  node.data = {
    ...node.data,
    [field]: fallbackValue,
  } as NodeFlowNodeData;
};

const cloneNodeFlow = (nodeFlow: NodeFlowFile): NodeFlowFile => JSON.parse(JSON.stringify(nodeFlow)) as NodeFlowFile;

const collectDirectoryEntries = (paths: string[]) => {
  const directories = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/");
    let current = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      current += `${parts[i]}/`;
      directories.add(current);
    }
  }
  return Array.from(directories)
    .sort()
    .map((path) => ({ path, data: new Uint8Array() }));
};

const packDocumentNode = (
  node: NodeFlowNode,
  folderPath: string,
  occupiedPaths: Set<string>
): ZipEntryInput | null => {
  if (node.type !== "scriptPage" && node.type !== "mdText" && node.type !== "text") return null;
  const data = node.data as { text?: string; content?: string; title?: string };
  const content = typeof data.content === "string" ? data.content : data.text || "";
  const title = node.data?.foundationRole === "project-index" ? "项目索引.md" : getNodeTitle(node);
  const filename = ensureFilenameExtension(sanitizePathSegment(title, "未命名文档"), getExtensionForDocumentNode(node));
  const path = createUniquePath(folderPath ? `${folderPath}/${filename}` : filename, occupiedPaths);
  addResource(node, "text", { path, kind: "document", mimeType: getMimeFromPath(path, "text/plain;charset=utf-8") });
  clearPackedField(node, "text", "");
  if ("content" in data) clearPackedField(node, "content", "");
  return { path, data: textEncoder.encode(content), mimeType: getMimeFromPath(path, "text/plain;charset=utf-8") };
};

const MEDIA_FIELDS_BY_NODE_TYPE: Record<string, string[]> = {
  imageInput: ["image"],
  audioInput: ["audio"],
  videoInput: ["video"],
  annotation: ["sourceImage", "outputImage"],
};

const packMediaFields = async (
  node: NodeFlowNode,
  folderPath: string,
  occupiedPaths: Set<string>
) => {
  const fields = MEDIA_FIELDS_BY_NODE_TYPE[node.type] || [];
  const entries: ZipEntryInput[] = [];
  for (const field of fields) {
    const value = (node.data as Record<string, unknown>)[field];
    if (typeof value !== "string" || !value) continue;
    const fallbackName = getNodeTitle(node);
    const filename = sanitizePathSegment(
      field === "video" || field === "audio" || field === "image"
        ? ((node.data as { filename?: string | null }).filename || fallbackName)
        : `${fallbackName}-${field}`,
      `${node.id}-${field}`
    );
    const fallbackMimeType =
      (node.data as { mimeType?: string | null }).mimeType || getMimeFromPath(filename, "application/octet-stream");
    const resolved = await resolveMediaBytes(value, fallbackMimeType);
    if (!resolved) {
      addResource(node, field, {
        path: "",
        kind: "media",
        mimeType: fallbackMimeType,
        originalValue: value,
      });
      continue;
    }
    const path = createUniquePath(`${folderPath || "项目文件夹"}/${filename}`, occupiedPaths);
    entries.push({ path, data: resolved.bytes, mimeType: resolved.mimeType });
    addResource(node, field, { path, kind: "media", mimeType: resolved.mimeType, originalValue: value });
    clearPackedField(node, field, null);
  }
  return entries;
};

const packGlobalAssetHistory = async (
  nodeFlow: NodeFlowFile,
  occupiedPaths: Set<string>
) => {
  const history = nodeFlow.globalAssetHistory;
  if (!Array.isArray(history)) return [];
  const entries: ZipEntryInput[] = [];
  const nextHistory: GlobalAssetHistoryItem[] = [];
  for (const item of history) {
    const src = item.src;
    if (typeof src !== "string" || !src) {
      nextHistory.push(item);
      continue;
    }
    const fallbackMimeType = item.type === "image" ? "image/png" : item.type === "audio" ? "audio/mpeg" : "video/mp4";
    const resolved = await resolveMediaBytes(src, fallbackMimeType);
    if (!resolved) {
      nextHistory.push(item);
      continue;
    }
    const extension = resolved.mimeType.split("/")[1]?.replace("mpeg", "mp3") || item.type;
    const path = createUniquePath(`资源历史/${sanitizePathSegment(item.id || item.type, "asset")}.${extension}`, occupiedPaths);
    entries.push({ path, data: resolved.bytes, mimeType: resolved.mimeType });
    nextHistory.push({
      ...item,
      src: `qalam-package://${path}`,
    });
  }
  nodeFlow.globalAssetHistory = nextHistory;
  return entries;
};

export const buildNodeFlowPackageBlob = async (nodeFlow: NodeFlowFile) => {
  const packageFlow = cloneNodeFlow(nodeFlow);
  const packageRoot = sanitizePathSegment(packageFlow.name || "Qalam Project", "Qalam Project");
  const occupiedPaths = new Set<string>();
  const resolveFolderPath = createPathResolver(packageFlow);
  const entries: ZipEntryInput[] = [];
  let unresolvedAssetCount = 0;

  for (const node of packageFlow.nodes) {
    const role = node.data?.foundationRole;
    if (role === "project-root" || role === "axis-folder" || role === "block-folder") continue;
    const folderPath = resolveFolderPath(node);
    const documentEntry = packDocumentNode(node, folderPath, occupiedPaths);
    if (documentEntry) entries.push(documentEntry);
    const mediaEntries = await packMediaFields(node, folderPath, occupiedPaths);
    unresolvedAssetCount += Object.values(((node.data as PackageNodeData)[QALAM_RESOURCE_FIELD] || {}))
      .filter((resource) => resource.kind === "media" && !resource.path && resource.originalValue)
      .length;
    entries.push(...mediaEntries);
  }

  entries.push(...(await packGlobalAssetHistory(packageFlow, occupiedPaths)));

  const manifest: QalamPackageManifest = {
    format: "qalam-project-package",
    version: 1,
    createdAt: new Date().toISOString(),
    packageRoot,
    nodeFlowPath: `${packageRoot}/${QALAM_PACKAGE_NODEFLOW_PATH}`,
    assetCount: entries.filter((entry) => !entry.path.startsWith(".qalam/")).length,
    unresolvedAssetCount,
  };
  const jsonEntries: ZipEntryInput[] = [
    {
      path: QALAM_PACKAGE_NODEFLOW_PATH,
      data: textEncoder.encode(JSON.stringify(packageFlow, null, 2)),
      mimeType: "application/json",
    },
    {
      path: QALAM_PACKAGE_MANIFEST_PATH,
      data: textEncoder.encode(JSON.stringify(manifest, null, 2)),
      mimeType: "application/json",
    },
  ];
  const allFileEntries = [...jsonEntries, ...entries];
  const rootedFileEntries = allFileEntries.map((entry) => ({
    ...entry,
    path: `${packageRoot}/${entry.path}`,
  }));
  return createZip([
    { path: `${packageRoot}/`, data: new Uint8Array() },
    ...collectDirectoryEntries(rootedFileEntries.map((entry) => entry.path)),
    ...rootedFileEntries,
  ]);
};

export const downloadNodeFlowPackage = async (nodeFlow: NodeFlowFile) => {
  const blob = await buildNodeFlowPackageBlob(nodeFlow);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizePathSegment(nodeFlow.name || "qalam-project", "qalam-project")}.qalam.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const hydratePackageResources = async (nodeFlow: NodeFlowFile, entries: Map<string, ZipEntry>, packageRoot = "") => {
  const nodes: NodeFlowNode[] = [];
  for (const node of nodeFlow.nodes || []) {
    const resources = (node.data as PackageNodeData)?.[QALAM_RESOURCE_FIELD];
    if (!resources) {
      nodes.push(node);
      continue;
    }
    const nextData = { ...node.data } as PackageNodeData;
    for (const [field, resource] of Object.entries(resources)) {
      if (!resource.path && resource.originalValue) {
        (nextData as Record<string, unknown>)[field] = resource.originalValue;
        continue;
      }
      if (!resource.path) continue;
      const bytes = await readZipEntry(entries, resource.path, packageRoot);
      if (resource.kind === "document") {
        const text = textDecoder.decode(bytes);
        (nextData as Record<string, unknown>)[field] = text;
        if (field === "text" && "content" in nextData) nextData.content = text;
      } else {
        (nextData as Record<string, unknown>)[field] = bytesToDataUrl(
          bytes,
          resource.mimeType || getMimeFromPath(resource.path)
        );
      }
    }
    delete nextData[QALAM_RESOURCE_FIELD];
    nodes.push({ ...node, data: nextData });
  }
  nodeFlow.nodes = nodes;

  if (Array.isArray(nodeFlow.globalAssetHistory)) {
    nodeFlow.globalAssetHistory = await Promise.all(
      nodeFlow.globalAssetHistory.map(async (item) => {
        if (!item.src?.startsWith("qalam-package://")) return item;
        const path = item.src.replace("qalam-package://", "");
        const bytes = await readZipEntry(entries, path, packageRoot);
        return { ...item, src: bytesToDataUrl(bytes, getMimeFromPath(path)) };
      })
    );
  }
  return nodeFlow;
};

export const readNodeFlowImportFile = async (file: File): Promise<NodeFlowFile> => {
  const isZip =
    file.name.toLocaleLowerCase().endsWith(".zip") ||
    file.name.toLocaleLowerCase().endsWith(".qalam") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";
  if (!isZip) {
    return JSON.parse(await file.text()) as NodeFlowFile;
  }
  const entries = await readZip(file);
  const manifestEntry =
    entries.get(QALAM_PACKAGE_MANIFEST_PATH) ||
    Array.from(entries.values()).find((entry) => entry.path.endsWith(`/${QALAM_PACKAGE_MANIFEST_PATH}`));
  const manifest = manifestEntry
    ? JSON.parse(textDecoder.decode(await readZipEntry(entries, manifestEntry.path))) as Partial<QalamPackageManifest>
    : null;
  const packageRoot =
    manifestEntry?.path.endsWith(`/${QALAM_PACKAGE_MANIFEST_PATH}`)
      ? manifestEntry.path.slice(0, -QALAM_PACKAGE_MANIFEST_PATH.length - 1)
      : manifest?.packageRoot || "";
  const nodeFlowEntry =
    (manifest?.nodeFlowPath ? entries.get(manifest.nodeFlowPath) : undefined) ||
    entries.get(QALAM_PACKAGE_NODEFLOW_PATH) ||
    entries.get("nodeflow.json") ||
    Array.from(entries.values()).find((entry) => entry.path.endsWith(`/${QALAM_PACKAGE_NODEFLOW_PATH}`));
  if (!nodeFlowEntry) throw new Error("项目包缺少 .qalam/nodeflow.json。");
  const nodeFlow = JSON.parse(textDecoder.decode(await readZipEntry(entries, nodeFlowEntry.path))) as NodeFlowFile;
  return hydratePackageResources(nodeFlow, entries, packageRoot);
};
