import React, { useMemo } from "react";
import { BaseNode } from "./BaseNode";
import type { IdentityCardNodeData, ImageInputNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";

type Props = {
  id: string;
  data: IdentityCardNodeData;
  selected?: boolean;
};

export const CompactIdentityCardNode: React.FC<Props> = ({ id, data, selected }) => {
  const roles = useNodeFlowStore((state) => state.nodeFlowContext.roles || []);
  const nodes = useNodeFlowStore((state) => state.nodes);
  const links = useNodeFlowStore((state) => state.links);
  const identity = useMemo(
    () => roles.find((role) => role.id === data.identityId),
    [data.identityId, roles]
  );
  const avatarUrl = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const link of links) {
      const connectedId = link.source === id ? link.target : link.target === id ? link.source : "";
      const node = connectedId ? nodeById.get(connectedId) : undefined;
      if (node?.type !== "imageInput") continue;
      const image = (node.data as ImageInputNodeData).image;
      if (typeof image === "string" && image) return image;
    }
    return "";
  }, [id, links, nodes]);
  const name = identity?.displayName || identity?.name || data.title || "未命名身份";
  const fallbackLetter = name.trim().slice(0, 1).toLocaleUpperCase() || "I";

  return (
    <BaseNode
      title={name}
      inputs={["multi", "image", "audio", "video", "text"]}
      outputs={["text"]}
      selected={selected}
      variant="media"
      nodeType="identity-card-compact"
    >
      <div className="compact-identity-card" aria-label={`${name} 身份卡`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={`${name} 默认头像`} draggable={false} />
        ) : (
          <div className="compact-identity-card__placeholder" aria-label="尚未连接头像图片">
            <span>{fallbackLetter}</span>
          </div>
        )}
      </div>
    </BaseNode>
  );
};
