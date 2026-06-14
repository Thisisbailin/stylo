import type {
  BaseNodeData,
  IdentityCardNodeData,
  NodeFlowContextSnapshot,
  NodeFlowNode,
  ScriptBoardNodeData,
} from "../types";
import { buildProjectIdentities } from "../../utils/identityCards";

const trimString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const buildEpisodeLabel = (episodeId?: number, context?: NodeFlowContextSnapshot) => {
  if (!episodeId) return undefined;
  const episode = context?.episodes?.find((item) => item.id === episodeId);
  const explicit = trimString(episode?.title);
  if (explicit && /^第\s*\d+\s*集$/.test(explicit)) return explicit;
  return `第${episodeId}集`;
};

const buildSceneLabel = (
  episodeId: number | undefined,
  sceneId: string | undefined,
  context?: NodeFlowContextSnapshot
) => {
  const rawSceneId = trimString(sceneId);
  if (!rawSceneId) return undefined;
  const episode = episodeId ? context?.episodes?.find((item) => item.id === episodeId) : undefined;
  const scene = episode?.scenes?.find((item) => item.id === rawSceneId);
  return trimString(scene?.title) || rawSceneId;
};

const resolveScriptBoardTitle = (data: ScriptBoardNodeData, context?: NodeFlowContextSnapshot) => {
  const explicit = trimString(data.title);
  if (explicit && explicit !== "剧本面板节点") return explicit;
  const episodeLabel = buildEpisodeLabel(data.episodeId, context);
  const sceneLabel = buildSceneLabel(data.episodeId, data.sceneId, context);
  if (episodeLabel && sceneLabel) return `${episodeLabel} ${sceneLabel}剧本`;
  if (episodeLabel) return `${episodeLabel}剧本`;
  return "剧本";
};

const resolveIdentityCardTitle = (data: IdentityCardNodeData, context?: NodeFlowContextSnapshot) => {
  const explicit = trimString(data.title);
  if (explicit && explicit !== "身份卡片节点") return explicit;
  const identities = buildProjectIdentities(context?.roles || [], context?.designAssets || []);
  const activeIdentity = data.identityId ? identities.find((item) => item.id === data.identityId) : identities[0];
  const identityName = trimString(activeIdentity?.name || activeIdentity?.displayName);
  if (identityName) return `${identityName}身份卡`;
  if (trimString(data.identityId)) return `${trimString(data.identityId)}身份卡`;
  return "身份卡";
};

const resolveGenericNodeTitle = (node: NodeFlowNode) => {
  const data = (node.data || {}) as BaseNodeData & Record<string, unknown>;
  return (
    trimString(data.title) ||
    trimString(data.label) ||
    trimString(data.filename) ||
    node.id
  );
};

export const resolveNodeFlowNodeTitle = (
  node: NodeFlowNode,
  context?: NodeFlowContextSnapshot
) => {
  switch (node.type) {
    case "scriptBoard":
      return resolveScriptBoardTitle(node.data as ScriptBoardNodeData, context);
    case "identityCard":
      return resolveIdentityCardTitle(node.data as IdentityCardNodeData, context);
    default:
      return resolveGenericNodeTitle(node);
  }
};

export const resolveNodeFlowNodeStatus = (node: NodeFlowNode) => {
  const data = (node.data || {}) as Record<string, unknown>;
  return trimString(data.status) || null;
};

export const resolveScriptBoardNodeTitle = (
  data: ScriptBoardNodeData,
  context?: NodeFlowContextSnapshot
) => resolveScriptBoardTitle(data, context);

export const resolveIdentityCardNodeTitle = (
  data: IdentityCardNodeData,
  context?: NodeFlowContextSnapshot
) => resolveIdentityCardTitle(data, context);
