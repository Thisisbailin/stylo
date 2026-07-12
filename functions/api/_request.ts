import { jsonResponse } from "./_auth";

const concatChunks = (chunks: Uint8Array[], byteLength: number) => {
  const result = new Uint8Array(byteLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return result;
};

export const readJsonRequest = async <T>(request: Request, maxBytes: number): Promise<T> => {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw jsonResponse({ error: "Request body is too large" }, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw jsonResponse({ error: "JSON request body is required" }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel("request body limit exceeded");
        throw jsonResponse({ error: "Request body is too large" }, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(new TextDecoder().decode(concatChunks(chunks, byteLength))) as T;
  } catch {
    throw jsonResponse({ error: "Malformed JSON request body" }, { status: 400 });
  }
};
