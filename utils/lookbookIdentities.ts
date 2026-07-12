import type { FlowLink, ProjectData, ProjectRoleIdentity, ProjectRoleKind } from "../types";
import type { NodeFlowNode, NodeFlowNodeData } from "../node-workspace/types";
import { buildRoleMention, slugifyIdentityKey } from "./projectRoles";

export const LOOKBOOK_MEMBERSHIP_RELATION = "lookbook-membership" as const;

export type FountainIdentityCandidate = {
  name: string;
  kind: ProjectRoleKind;
};

const CHARACTER_PLACEHOLDERS = new Set(["CHARACTER", "角色", "角色名"]);
const SCENE_PLACEHOLDERS = new Set(["LOCATION", "场景", "场景名"]);

const uniqueCandidates = (items: FountainIdentityCandidate[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.name.toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parseCharacterName = (line: string) => {
  const trimmed = line.trim();
  let value = "";
  if (trimmed.startsWith("@")) value = trimmed.slice(1);
  else {
    const chinese = trimmed.match(/^【(?:角色|双人对白)】\s*(.+)$/);
    if (chinese) value = chinese[1];
  }
  return value
    .replace(/\^\s*$/, "")
    .replace(/\s+\([^)]*\)\s*$/, "")
    .trim();
};

const parseSceneName = (line: string) => {
  const trimmed = line.trim();
  const chinese = trimmed.match(/^【场景】\s*(.+)$/);
  if (chinese) {
    const slots = chinese[1].split(/[｜|]/).map((item) => item.trim()).filter(Boolean);
    return (slots.length >= 2 ? slots[1] : slots[0] || "").trim();
  }

  const normalized = trimmed.replace(/^\./, "");
  const heading = normalized.match(
    /^(?:INT\.\/EXT\.|INT\.\/EXT|INT\.|EXT\.|I\/E|内景|外景|内外景)\s+(.+?)(?:\s+-\s+[^-]+)?$/i
  );
  return heading?.[1]?.trim() || "";
};

export const parseFountainIdentityCandidates = (content: string): FountainIdentityCandidate[] =>
  uniqueCandidates(
    content.split(/\r?\n/).flatMap<FountainIdentityCandidate>((line) => {
      const characterName = parseCharacterName(line);
      if (characterName && !CHARACTER_PLACEHOLDERS.has(characterName.toUpperCase())) {
        return [{ name: characterName, kind: "person" as const }];
      }
      const sceneName = parseSceneName(line);
      if (sceneName && !SCENE_PLACEHOLDERS.has(sceneName.toUpperCase())) {
        return [{ name: sceneName, kind: "scene" as const }];
      }
      return [];
    })
  );

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const buildStableIdentityId = (candidate: FountainIdentityCandidate) =>
  `role-${candidate.kind}-${slugifyIdentityKey(candidate.name, candidate.kind)}-${stableHash(`${candidate.kind}:${candidate.name}`)}`;

const aliasesForRole = (role: ProjectRoleIdentity) =>
  [role.name, role.displayName, role.mention, `@${role.mention}`, ...(role.aliases || []).map((alias) => alias.value)]
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);

const findExactRole = (roles: ProjectRoleIdentity[], candidate: FountainIdentityCandidate) => {
  const mention = buildRoleMention(candidate.name).toLocaleLowerCase();
  const name = candidate.name.toLocaleLowerCase();
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
    type: "identityCard",
    position: { x: origin.x + (order % 2) * 760, y: origin.y + 360 + Math.floor(order / 2) * 520 },
    data: {
      title: `${role.displayName || role.name} · 身份卡`,
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
    type: "mdText",
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

export const syncLookbookIdentitiesFromFountain = (
  projectData: ProjectData,
  input: { sourceNodeId: string; content: string; now?: number }
): ProjectData => {
  const candidates = parseFountainIdentityCandidates(input.content);
  if (!candidates.length) return projectData;
  const now = input.now ?? Date.now();
  const flow = projectData.flow || { links: [] };
  const roles = [...(projectData.roles || [])];
  const nodes = [...(flow.flowNodes || [])];
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
      (node) => node.type === "identityCard" && (node.data as { identityId?: string }).identityId === role!.id
    );
    if (!identityNode) {
      identityNode = makeIdentityNode(role, sourceNode, order);
      nodes.push(identityNode);
    } else if ((identityNode.data as { lookbookIndexNodeId?: string }).lookbookIndexNodeId !== role.profileNodeId) {
      identityNode = {
        ...identityNode,
        data: {
          ...identityNode.data,
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
  const connectedIds = new Set(
    flow.links.flatMap((link) => {
      if (link.source === identityNodeId) return [link.target];
      if (link.target === identityNodeId) return [link.source];
      return [];
    })
  );
  return (flow.flowNodes || []).filter((node) => connectedIds.has(node.id) && supportedTypes.has(node.type));
};
