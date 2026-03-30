import type { ProjectRoleIdentity } from "../types";
import { getPrimaryPortrait } from "./projectRoles";

export const getRoleMentionLabel = (role?: ProjectRoleIdentity | null) => role?.mention || "";

export const getRoleMentionValue = (role?: ProjectRoleIdentity | null) =>
  role?.mention ? `@${role.mention}` : "";

export const getRoleDisplayLabel = (role?: ProjectRoleIdentity | null) => {
  if (!role) return "";
  return `${role.name || role.displayName} · ${role.summary}`;
};

export const getRoleToneLabel = (role?: ProjectRoleIdentity | null) =>
  role?.kind === "scene" ? "场景身份" : "人物身份";

export const getCharacterMentionLabel = getRoleMentionValue;

export const getCharacterMentionAliases = (role?: ProjectRoleIdentity | null) =>
  [
    role?.displayName,
    role?.name,
    role?.mention ? `@${role.mention}` : "",
    ...((role?.portraits || []).map((portrait) => `@${portrait.mention}`)),
    ...((role?.aliases || []).map((item) => item.value)),
  ].filter((item): item is string => !!item);

export const getPrimaryRolePortrait = (role?: ProjectRoleIdentity | null) => getPrimaryPortrait(role);

export const getDefaultCharacterForm = (role?: ProjectRoleIdentity | null) => getPrimaryPortrait(role);
