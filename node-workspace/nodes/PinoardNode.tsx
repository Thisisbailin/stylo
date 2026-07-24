import React from "react";
import { PushPinSimple } from "@phosphor-icons/react";
import type { PinoardNodeData } from "../types";
import { BaseNode } from "./BaseNode";

type Props = {
  data: PinoardNodeData;
  selected?: boolean;
};

export const PinoardNode: React.FC<Props> = ({ data, selected }) => {
  const memberCount =
    typeof data.wrapperMemberCount === "number" ? data.wrapperMemberCount : 0;
  const isCollapsed = data.wrapperCollapsed === true;

  return (
    <BaseNode
      title={data.title || "Pinoard"}
      inputs={["multi", "text"]}
      outputs={["text"]}
      selected={selected}
      variant="text"
      nodeType="pinoard"
    >
      <div
        className={`pinoard-node ${isCollapsed ? "is-collapsed" : "is-expanded"}`}
        data-wrapper-state={isCollapsed ? "closed" : "open"}
        data-wrapper-members={memberCount}
        aria-label={`Pinoard 构思包装器，${memberCount} 条灵感，双击打开`}
      >
        <div className="pinoard-node__papers" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <PushPinSimple
          className="pinoard-node__pin"
          size={20}
          weight="fill"
          aria-hidden="true"
        />
        <div className="pinoard-node__copy">
          <strong>Pinoard</strong>
          <span>{memberCount ? `${memberCount} 条灵感` : "构思从这里开始"}</span>
        </div>
      </div>
    </BaseNode>
  );
};
