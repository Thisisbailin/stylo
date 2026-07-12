type TokenProvider = (options?: { skipCache?: boolean }) => Promise<string | null>;

let tokenProvider: TokenProvider | null = null;
let providerGeneration = 0;
let providerAbortController = new AbortController();

const createAbortError = () => new DOMException("Account scope changed", "AbortError");

export const setApiAuthTokenProvider = (provider: TokenProvider | null) => {
  providerAbortController.abort(createAbortError());
  providerAbortController = new AbortController();
  tokenProvider = provider;
  providerGeneration += 1;
};

export type ApiAuthLease = {
  generation: number;
  signal: AbortSignal;
  isCurrent: () => boolean;
  assertCurrent: () => void;
};

export const captureApiAuthLease = (): ApiAuthLease => {
  const generation = providerGeneration;
  const signal = providerAbortController.signal;
  const isCurrent = () => generation === providerGeneration && !signal.aborted;
  return {
    generation,
    signal,
    isCurrent,
    assertCurrent: () => {
      if (!isCurrent()) throw createAbortError();
    },
  };
};

export const buildAuthorizedHeaders = async (
  init?: HeadersInit,
  headerName = "authorization",
  expectedGeneration?: number
): Promise<Headers> => {
  const headers = new Headers(init || {});
  const provider = tokenProvider;
  const generation = providerGeneration;
  if (expectedGeneration !== undefined && expectedGeneration !== generation) {
    throw createAbortError();
  }
  if (provider) {
    const token = await provider();
    if (generation !== providerGeneration || provider !== tokenProvider) throw createAbortError();
    if (token) headers.set(headerName, `Bearer ${token}`);
  }
  return headers;
};

export const buildAuthorizedJsonHeaders = async (
  init?: HeadersInit,
  expectedGeneration?: number
): Promise<HeadersInit> => {
  const headers = await buildAuthorizedHeaders(init, "authorization", expectedGeneration);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
};
