import { buildApiUrl, fetchAuthorized } from "../utils/api";

export type ArkModel = {
  id: string;
  object?: string;
  owned_by?: string;
  name?: string;
  description?: string;
} & Record<string, any>;

const normalizeModels = (raw: any): ArkModel[] => {
  const models =
    (Array.isArray(raw?.data) && raw.data) ||
    (Array.isArray(raw?.models) && raw.models) ||
    (Array.isArray(raw?.result) && raw.result) ||
    [];
  return models
    .map((model: any) => ({
      ...model,
      id: model.id || model.model || model.name || model?.data?.id || "",
    }))
    .filter((model: ArkModel) => model.id);
};

export const fetchArkModels = async (
  baseUrl?: string
): Promise<{ models: ArkModel[]; raw: any }> => {
  const endpoint = buildApiUrl("/api/ark-models");
  const url = new URL(endpoint, window.location.origin);
  if (baseUrl?.trim()) {
    url.searchParams.set("baseUrl", baseUrl.trim());
  }

  const res = await fetchAuthorized(url.toString(), {
    method: "GET",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ark models fetch failed (${res.status}): ${err}`);
  }

  const raw = await res.json();
  return {
    raw,
    models: normalizeModels(raw),
  };
};
