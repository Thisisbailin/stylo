import type { ProjectRoleIdentity } from "../../types";
import type { EntityBinding, TextNodeData } from "../types";
import { createStableId } from "../../utils/id";

export type MentionKind = "identity" | "unknown";

export type MentionTarget = {
  kind: "identity";
  name: string;
  label: string;
  search: string;
  aliasValue?: string;
  identityId: string;
  portraitId?: string;
  mention: string;
  tone: "emerald" | "sky";
  roleKind: "person" | "scene";
  summary?: string;
  detail?: string;
};

export const mentionPriority: Record<MentionKind, number> = {
  identity: 0,
  unknown: 1,
};

export const toSearch = (value: string) => value.toLowerCase().replace(/\s+/g, "");

const uniqStrings = (values: Array<string | undefined | null>) => {
  const seen = new Set<string>();
  return values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const parseMentionTokens = (text: string) => {
  const regex = /@([\w\u4e00-\u9fa5\-\/]+)/g;
  const matches: Array<{ rawText: string; name: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text || ""))) {
    const rawText = match[0];
    matches.push({
      rawText,
      name: match[1],
      start: match.index,
      end: match.index + rawText.length,
    });
  }
  return matches;
};

const buildIdentityDetail = (role: ProjectRoleIdentity) =>
  [
    `身份证：@${role.mention}`,
    role.kind === "scene" ? "身份类型：场景" : "身份类型：人物",
    `角色名：${role.name}`,
    role.summary ? `摘要：${role.summary}` : "",
    role.episodeUsage ? `区间：${role.episodeUsage}` : "",
    role.visualTags ? `视觉：${role.visualTags}` : "",
    role.description || "",
  ]
    .filter(Boolean)
    .join("\n");

export const buildMentionTargets = (roles: ProjectRoleIdentity[]) => {
  const all = roles.flatMap((role) => {
    const aliases = uniqStrings([
      role.mention,
      `@${role.mention}`,
      role.displayName,
      role.name,
      ...(role.aliases || []).map((item) => item.value),
      ...(role.binding?.aliases || []),
    ]);
    const baseTargets = aliases.map((alias, index) => ({
      kind: "identity" as const,
      name: alias.replace(/^@/, ""),
      label: role.displayName || role.name || `@${role.mention}`,
      search: toSearch(
        [
          alias,
          role.displayName,
          role.name,
          role.summary,
          role.description,
          role.visualTags,
          role.episodeUsage,
          ...(role.tags || []),
        ]
          .filter(Boolean)
          .join(" ")
      ),
      aliasValue: index === 0 ? undefined : alias,
      identityId: role.id,
      mention: role.mention,
      tone: role.tone,
      roleKind: role.kind,
      summary: role.summary,
      detail: buildIdentityDetail(role),
    }));
    const portraitTargets = (role.portraits || []).map((portrait) => ({
      kind: "identity" as const,
      name: portrait.mention,
      label: `${role.name} · ${portrait.name}`,
      search: toSearch(
        [
          portrait.mention,
          `@${portrait.mention}`,
          role.name,
          portrait.name,
          portrait.summary,
          role.summary,
          role.description,
        ]
          .filter(Boolean)
          .join(" ")
      ),
      aliasValue: portrait.name,
      identityId: role.id,
      portraitId: portrait.id,
      mention: portrait.mention,
      tone: role.tone,
      roleKind: role.kind,
      summary: portrait.summary || role.summary,
      detail: [
        buildIdentityDetail(role),
        `定妆照：${portrait.name}`,
        portrait.summary || "",
      ]
        .filter(Boolean)
        .join("\n"),
    }));
    return [...baseTargets, ...portraitTargets];
  });

  return {
    persons: all.filter((item) => item.roleKind === "person"),
    scenes: all.filter((item) => item.roleKind === "scene"),
    identities: all,
    all,
  };
};

export const buildMentionIndex = (targets: MentionTarget[]) => {
  const map = new Map<string, MentionTarget[]>();
  targets.forEach((item) => {
    const key = toSearch(item.name);
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  });
  return map;
};

export const resolveMentionTarget = (name: string, mentionIndex: Map<string, MentionTarget[]>) => {
  const list = mentionIndex.get(toSearch(name.replace(/^@/, ""))) || [];
  if (!list.length) return null;
  return list.slice().sort((a, b) => mentionPriority[a.kind] - mentionPriority[b.kind])[0];
};

export const computeMentionData = (
  text: string,
  mentionIndex: Map<string, MentionTarget[]>
): {
  atMentions: NonNullable<TextNodeData["atMentions"]>;
  entityBindings: EntityBinding[];
} => {
  const seen = new Set<string>();
  const atMentions: NonNullable<TextNodeData["atMentions"]> = [];
  const entityBindings: EntityBinding[] = [];

  parseMentionTokens(text).forEach((token) => {
    const hit = resolveMentionTarget(token.name, mentionIndex);
    const atKey = token.name.toLowerCase();
    if (!seen.has(atKey)) {
      seen.add(atKey);
      atMentions.push({
        name: token.name,
        status: hit ? "match" : "missing",
        kind: hit?.kind || "unknown",
        identityId: hit?.identityId,
        portraitId: hit?.portraitId,
        mention: hit?.mention,
        summary: hit?.summary,
        detail: hit?.detail,
        tone: hit?.tone,
        roleKind: hit?.roleKind,
      });
    }

    entityBindings.push({
      id: createStableId("binding"),
      rawText: token.rawText,
      status: hit ? "resolved" : "missing",
      entityType: hit?.kind || "unknown",
      entityId: hit?.identityId,
      identityId: hit?.identityId,
      portraitId: hit?.portraitId,
      mention: hit?.mention,
      aliasValue: hit?.aliasValue,
      summary: hit?.summary,
      detail: hit?.detail,
      tone: hit?.tone,
      roleKind: hit?.roleKind,
      start: token.start,
      end: token.end,
      resolutionSource: "auto",
      version: 1,
    });
  });

  return { atMentions, entityBindings };
};
