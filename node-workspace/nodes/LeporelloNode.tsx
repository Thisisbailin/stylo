import React, { useMemo } from "react";
import { BaseNode } from "./BaseNode";
import type { ImageInputNodeData, LeporelloNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { sanitizeLeporelloBook } from "../../utils/leporelloWorkspace";

type Props = {
  id: string;
  data: LeporelloNodeData;
  selected?: boolean;
};

export const LeporelloNode: React.FC<Props> = ({ data, selected }) => {
  const nodes = useNodeFlowStore((state) => state.nodes);
  const book = useMemo(() => sanitizeLeporelloBook(data.leporelloBook), [data.leporelloBook]);
  const imageById = useMemo(() => new Map(
    nodes
      .filter((node) => node.type === "imageInput")
      .map((node) => [node.id, (node.data as ImageInputNodeData).image || ""])
  ), [nodes]);
  const isCollapsed = data.wrapperCollapsed === true;
  const visiblePages = book.pages.slice(0, isCollapsed ? 2 : 3);

  return (
    <BaseNode
      title={data.title || "Leporello"}
      inputs={["multi", "image"]}
      outputs={["text"]}
      selected={selected}
      variant="media"
      nodeType="leporello-cover"
    >
      <div
        className={`leporello-node ${isCollapsed ? "is-folded" : "is-unfolded"}`}
        data-wrapper-state={isCollapsed ? "closed" : "open"}
        data-wrapper-members={typeof data.wrapperMemberCount === "number" ? data.wrapperMemberCount : 0}
        aria-label={`${data.title || "Leporello"}，${isCollapsed ? "已折叠" : "已展开"}，双击打开故事板`}
      >
        <div className="leporello-node__strip" aria-hidden="true">
          {visiblePages.map((page, index) => {
            const image = page.imageNodeId ? imageById.get(page.imageNodeId) : "";
            return (
              <span
                key={page.id}
                className={`leporello-node__panel is-${page.kind} is-${page.face}`}
                style={{ "--leporello-index": index } as React.CSSProperties}
              >
                {image ? <img src={image} alt="" draggable={false} /> : null}
                {page.kind === "cover" ? <b>{data.title || "LEPORELLO"}</b> : null}
                {page.kind === "back" ? <b>FIN</b> : null}
              </span>
            );
          })}
        </div>
        <div className="leporello-node__meta">
          <span>LEPORELLO / 21:9</span>
          <strong>{book.pages.length} FOLDS</strong>
        </div>
      </div>
    </BaseNode>
  );
};
