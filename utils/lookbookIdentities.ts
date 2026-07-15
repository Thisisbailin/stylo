import type { FlowLink, ProjectData, ProjectRoleIdentity, ProjectRoleKind } from "../types";
import type { NodeFlowNode, NodeFlowNodeData } from "../node-workspace/types";
import {
  analyzeFountainLines,
  normalizeScreenplayIdentity,
  parseSceneHeading,
  resolveKnownScreenplayIdentity,
  type ScreenplayKnownIdentity,
} from "../node-workspace/screenplay/fountainEngine";
import { buildRoleMention, slugifyIdentityKey } from "./projectRoles";

export const LOOKBOOK_MEMBERSHIP_RELATION = "lookbook-membership" as const;
export const isLookbookNodeType = (type: unknown): type is "lookbook" | "identityCard" =>
  type === "lookbook" || type === "identityCard";

export type FountainIdentityCandidate = {
  name: string;
  kind: ProjectRoleKind;
};

const CHARACTER_PLACEHOLDERS = new Set(["CHARACTER", "角色", "角色名"]);
const SCENE_PLACEHOLDERS = new Set(["LOCATION", "场景", "场景名"]);

const uniqueCandidates = (items: FountainIdentityCandidate[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${normalizeScreenplayIdentity(item.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const toKnownIdentity = (role: ProjectRoleIdentity): ScreenplayKnownIdentity => ({
  id: role.id,
  name: role.displayName?.trim() || role.name,
  mention: role.mention,
  aliases: [role.name, ...(role.binding?.aliases || []), ...(role.aliases || []).map((alias) => alias.value)],
});

export const parseFountainIdentityCandidates = (
  content: string,
  existingRoles: ProjectRoleIdentity[] = []
): FountainIdentityCandidate[] => {
  const knownCharacters = existingRoles.filter((role) => role.kind === "person").map(toKnownIdentity);
  const knownScenes = existingRoles.filter((role) => role.kind === "scene").map(toKnownIdentity);
  const lines = analyzeFountainLines(content, knownCharacters);
  return uniqueCandidates(lines.flatMap<FountainIdentityCandidate>((line) => {
    if (line.kind === "character" || line.kind === "dual_dialogue") {
      const identity = resolveKnownScreenplayIdentity(line.content, knownCharacters);
      const name = identity?.name?.trim() || line.content.trim();
      if (name && !CHARACTER_PLACEHOLDERS.has(name.toUpperCase())) return [{ name, kind: "person" }];
      return [];
    }
    if (line.kind === "scene_heading") {
      const parsed = parseSceneHeading(line.raw);
      const identity = resolveKnownScreenplayIdentity(parsed.location, knownScenes);
      const name = identity?.name?.trim() || parsed.location.trim();
      if (name && !SCENE_PLACEHOLDERS.has(name.toUpperCase())) return [{ name, kind: "scene" }];
    }
    return [];
  }));
};

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const buildStableIdentityId = (candidate: FountainIdentityCandidate) =>
  `role-${candidate.kind}-${slugifyIdentityKey(candidate.name, candidate.kind)}-${stableHash(`${candidate.kind}:${normalizeScreenplayIdentity(candidate.name)}`)}`;

const aliasesForRole = (role: ProjectRoleIdentity) =>
  [role.name, role.displayName, role.mention, `@${role.mention}`, ...(role.aliases || []).map((alias) => alias.value)]
    .map(normalizeScreenplayIdentity)
    .filter(Boolean);

const findExactRole = (roles: ProjectRoleIdentity[], candidate: FountainIdentityCandidate) => {
  const mention = normalizeScreenplayIdentity(buildRoleMention(candidate.name));
  const name = normalizeScreenplayIdentity(candidate.name);
  return roles.find(
    (role) => role.kind === candidate.kind && (aliasesForRole(role).includes(name) || aliasesForRole(role).includes(mention))
  );
};

const createRole = (
  candidate: FountainIdentityCandidate,
  sourceDocumentId: string,
  now: number
): ProjectRoleIdentity => {
  const id = buildStableIdentityId(candidate);
  const mention = buildRoleMention(candidate.name);
  const profileDocumentId = `lookbook-index-${id}`;
  return {
    id,
    name: candidate.name,
    displayName: candidate.name,
    mention,
    slug: slugifyIdentityKey(mention, candidate.name),
    kind: candidate.kind,
    tone: candidate.kind === "person" ? "emerald" : "sky",
    title: candidate.name,
    summary: candidate.kind === "person" ? "人物身份" : "场景身份",
    description: "",
    status: "draft",
    aliases: [
      { id: `alias-${id}-name`, value: candidate.name, normalized: candidate.name.toLocaleLowerCase() },
      { id: `alias-${id}-mention`, value: `@${mention}`, normalized: mention.toLocaleLowerCase() },
    ],
    binding: { mention, aliases: [candidate.name, `@${mention}`] },
    portraits: [],
    profileDocumentId,
    profileNodeId: profileDocumentId,
    sourceDocumentIds: [sourceDocumentId],
    lastDerivedAt: now,
  };
};

const buildIndexMarkdown = (role: ProjectRoleIdentity) => {
  const typeLabel = role.kind === "person" ? "人物" : "场景";
  return [
    `# ${role.displayName || role.name}`,
    "",
    `- 身份类型：${typeLabel}`,
    `- 身份引用：@${role.mention}`,
    `- 状态：${role.status || "draft"}`,
    "",
    "## Lookbook 索引",
    "",
    "本页记录与该身份相连的档案、图片、音频和视频节点。连接关系以 Flow 画布为准。",
    "",
    role.kind === "person" ? "## 造型与阶段" : "## 空间与氛围",
    "",
    "尚未记录。",
    "",
    "## 设计记录",
    "",
    "尚未记录。",
  ].join("\n");
};

const makeIdentityNode = (role: ProjectRoleIdentity, sourceNode: NodeFlowNode | undefined, order: number): NodeFlowNode => {
  const origin = sourceNode?.position || { x: 120, y: 120 };
  return {
    id: `identity-${role.id}`,
    type: "lookbook",
    position: { x: origin.x + (order % 2) * 760, y: origin.y + 360 + Math.floor(order / 2) * 520 },
    style: { width: 236, height: 292 },
    data: {
      title: role.displayName || role.name,
      identityId: role.id,
      lookbookIdentityId: role.id,
      lookbookIndexNodeId: role.profileNodeId,
      avatarOverrides: {},
    },
  };
};

const makeIndexNode = (role: ProjectRoleIdentity, identityNode: NodeFlowNode): NodeFlowNode => {
  const content = buildIndexMarkdown(role);
  return {
    id: role.profileNodeId || `lookbook-index-${role.id}`,
    type: "text",
    position: { x: identityNode.position.x + 390, y: identityNode.position.y + 28 },
    data: {
      title: `${role.displayName || role.name} · Lookbook 索引`,
      documentId: role.profileDocumentId || `lookbook-index-${role.id}`,
      documentKind: "archive",
      format: "markdown",
      text: content,
      content,
      preview: `@${role.mention} 的 Lookbook 记录索引`,
      lookbookIdentityId: role.id,
      lookbookRole: "index",
    } as NodeFlowNodeData,
  };
};

const makeLookbookLink = (identityNodeId: string, memberNodeId: string): FlowLink => ({
  id: `link-${identityNodeId}-${memberNodeId}-lookbook`,
  source: identityNodeId,
  target: memberNodeId,
  sourceHandle: "text",
  targetHandle: "text",
  data: { relation: LOOKBOOK_MEMBERSHIP_RELATION },
});

export const addManualLookbookIdentity = (
  projectData: ProjectData,
  input: {
    position: { x: number; y: number };
    kind?: ProjectRoleKind;
    name?: string;
    now?: number;
  }
): { projectData: ProjectData; identityNodeId: string } => {
  const kind = input.kind || "person";
  const roles = [...(projectData.roles || [])];
  const baseName = input.name?.trim() || (kind === "scene" ? "新场景" : "新角色");
  const existingNames = new Set(
    roles
      .filter((role) => role.kind === kind)
      .flatMap((role) => [role.name, role.displayName || ""])
      .map(normalizeScreenplayIdentity)
      .filter(Boolean)
  );
  let name = baseName;
  let suffix = 2;
  while (existingNames.has(normalizeScreenplayIdentity(name))) {
    name = `${baseName} ${suffix}`;
    suffix += 1;
  }

  const now = input.now ?? Date.now();
  const role = {
    ...createRole({ name, kind }, "", now),
    sourceDocumentIds: [],
  };
  const flow = projectData.flow || { links: [] };
  const nodes = [...(flow.flowNodes || [])];
  const identityNode = {
    ...makeIdentityNode(role, undefined, 0),
    position: input.position,
  };
  const indexNode = makeIndexNode(role, identityNode);

  roles.push(role);
  nodes.push(identityNode, indexNode);

  return {
    identityNodeId: identityNode.id,
    projectData: {
      ...projectData,
      roles,
      flow: {
        ...flow,
        revision: (flow.revision || 0) + 1,
        flowNodes: nodes,
        links: [...flow.links, makeLookbookLink(identityNode.id, indexNode.id)],
      },
    },
  };
};

export const syncLookbookIdentitiesFromFountain = (
  projectData: ProjectData,
  input: { sourceNodeId: string; content: string; now?: number }
): ProjectData => {
  const existingRoles = projectData.roles || [];
  const candidates = parseFountainIdentityCandidates(input.content, existingRoles);
  const now = input.now ?? Date.now();
  const flow = projectData.flow || { links: [] };
  const roles = existingRoles.filter((role, index, source) => {
    const duplicateId = source.findIndex((item) => item.id === role.id);
    if (duplicateId !== index) return false;
    const key = `${role.kind}:${normalizeScreenplayIdentity(role.mention || role.name)}`;
    return source.findIndex((item) => `${item.kind}:${normalizeScreenplayIdentity(item.mention || item.name)}` === key) === index;
  });
  const seenNodeIds = new Set<string>();
  const nodes = (flow.flowNodes || []).filter((node) => {
    if (seenNodeIds.has(node.id)) return false;
    seenNodeIds.add(node.id);
    return true;
  });
  const repairedDuplicates = roles.length !== existingRoles.length || nodes.length !== (flow.flowNodes || []).length;
  if (!candidates.length && !repairedDuplicates) return projectData;
  const links = [...flow.links];
  const sourceNode = nodes.find((node) => node.id === input.sourceNodeId);

  candidates.forEach((candidate, order) => {
    let role = findExactRole(roles, candidate);
    if (!role) {
      role = createRole(candidate, input.sourceNodeId, now);
      roles.push(role);
    } else {
      const sourceDocumentIds = Array.from(new Set([...(role.sourceDocumentIds || []), input.sourceNodeId]));
      const profileNodeId = role.profileNodeId || `lookbook-index-${role.id}`;
      const profileDocumentId = role.profileDocumentId || profileNodeId;
      const nextRole = { ...role, sourceDocumentIds, profileNodeId, profileDocumentId, lastDerivedAt: now };
      roles[roles.indexOf(role)] = nextRole;
      role = nextRole;
    }

    let identityNode = nodes.find(
      (node) => isLookbookNodeType(node.type) && (node.data as { identityId?: string }).identityId === role!.id
    );
    if (!identityNode) {
      identityNode = makeIdentityNode(role, sourceNode, order);
      nodes.push(identityNode);
    } else {
      identityNode = {
        ...identityNode,
        type: "lookbook",
        style: { ...identityNode.style, width: 236, height: 292 },
        data: {
          ...identityNode.data,
          title: role.displayName || role.name,
          identityId: role.id,
          lookbookIdentityId: role.id,
          lookbookIndexNodeId: role.profileNodeId,
        } as NodeFlowNodeData,
      };
      nodes[nodes.findIndex((node) => node.id === identityNode!.id)] = identityNode;
    }

    let indexNode = nodes.find((node) => node.id === role!.profileNodeId);
    if (!indexNode) {
      indexNode = makeIndexNode(role, identityNode);
      nodes.push(indexNode);
    }
    const link = makeLookbookLink(identityNode.id, indexNode.id);
    if (!links.some((item) => item.id === link.id || (item.source === link.source && item.target === link.target))) {
      links.push(link);
    }
  });

  return {
    ...projectData,
    roles,
    flow: {
      ...flow,
      revision: (flow.revision || 0) + 1,
      flowNodes: nodes,
      links,
    },
  };
};

export const getLookbookMemberNodes = (projectData: ProjectData, identityNodeId: string) => {
  const flow = projectData.flow || { links: [] };
  const supportedTypes = new Set(["mdText", "text", "imageInput", "audioInput", "videoInput"]);
  const nodeById = new Map((flow.flowNodes || []).map((node) => [node.id, node]));
  const seen = new Set<string>();
  return flow.links.flatMap((link) => {
    const connectedId = link.source === identityNodeId
      ? link.target
      : link.target === identityNodeId
        ? link.source
        : "";
    const node = connectedId ? nodeById.get(connectedId) : undefined;
    if (!node || seen.has(node.id) || !supportedTypes.has(node.type)) return [];
    seen.add(node.id);
    return [node];
  });
};

export const getFirstLookbookImageNode = (projectData: ProjectData, identityNodeId: string) =>
  getLookbookMemberNodes(projectData, identityNodeId).find((node) => node.type === "imageInput");

export const getVisibleLookbookMemberNodes = (projectData: ProjectData, identityNodeId: string) =>
  getLookbookMemberNodes(projectData, identityNodeId).filter((node) => node.data?.lookbookRole !== "index");
