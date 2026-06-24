type TokenProvider = (options?: { skipCache?: boolean }) => Promise<string | null>;

let tokenProvider: TokenProvider | null = null;

export const setApiAuthTokenProvider = (provider: TokenProvider | null) => {
  tokenProvider = provider;
};

export const buildAuthorizedJsonHeaders = async (init?: HeadersInit): Promise<HeadersInit> => {
  const headers = new Headers(init || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }
  return headers;
};
