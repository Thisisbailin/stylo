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
      nodeType="lookbook-cover"
    >
      <div className="lookbook-node-cover" aria-label={`${name} Lookbook`}>
        <strong className="lookbook-node-cover__title">{name}</strong>
        <div className="lookbook-node-cover__visual">
          {avatarUrl ? (
            <img src={avatarUrl} alt={`${name} Lookbook 封面`} draggable={false} />
          ) : (
            <div className="lookbook-node-cover__placeholder" aria-label="尚未连接封面图片">
              <span>{fallbackLetter}</span>
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
};
