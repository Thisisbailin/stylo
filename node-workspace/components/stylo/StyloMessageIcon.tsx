import React, { memo } from "react";
import {
  ArrowsOutCardinal,
  Binoculars,
  BookBookmark,
  BookOpenText,
  Brain,
  ChatCircleDots,
  FileMagnifyingGlass,
  FilePlus,
  FlowArrow,
  FolderOpen,
  GithubLogo,
  GlobeHemisphereWest,
  NotePencil,
  PenNib,
  PlayCircle,
  PlugsConnected,
  Prohibit,
  Pulse,
  ShieldCheck,
  Stack,
  TerminalWindow,
  TreeStructure,
  UserCircle,
  Wrench,
  type Icon,
} from "@phosphor-icons/react";
import type { ToolDisplayOutcome } from "./toolDisplayOutcome";
import type { StyloMessageIconKey, StyloMessageVisual } from "./messageVisualPolicy";

const ICON_COMPONENTS: Record<StyloMessageIconKey, Icon> = {
  user: UserCircle,
  assistant: PenNib,
  thinking: Brain,
  response: ChatCircleDots,
  work: TerminalWindow,
  approval: ShieldCheck,
  tool_generic: Wrench,
  health: Pulse,
  document_find: FileMagnifyingGlass,
  document_read: BookOpenText,
  document_create: FilePlus,
  document_update: NotePencil,
  flow_connect: PlugsConnected,
  flow_move: ArrowsOutCardinal,
  foundation_operate: TreeStructure,
  resources_list: FolderOpen,
  resource_read: Stack,
  resource_search: Binoculars,
  runtime_manual: BookBookmark,
  github_read: GithubLogo,
  web_search: GlobeHemisphereWest,
  resource_operate: FlowArrow,
  generation_prepare: PlayCircle,
  generation_cancel: Prohibit,
};

type Props = {
  visual: StyloMessageVisual;
  status?: ToolDisplayOutcome | "idle";
  active?: boolean;
  compact?: boolean;
  className?: string;
};

export const StyloMessageIcon = memo(function StyloMessageIcon({
  visual,
  status = "idle",
  active = false,
  compact = false,
  className = "",
}: Props) {
  const IconComponent = ICON_COMPONENTS[visual.icon];
  return (
    <span
      className={`stylo-message-icon ${compact ? "stylo-message-icon--compact" : ""} ${active ? "is-active" : ""} ${className}`}
      data-tone={visual.tone}
      data-status={status}
      aria-hidden="true"
    >
      <IconComponent size={compact ? 13 : 15} weight="duotone" />
    </span>
  );
});

