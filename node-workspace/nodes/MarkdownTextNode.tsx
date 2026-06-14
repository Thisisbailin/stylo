import React, { useCallback } from "react";
import { BaseNode } from "./BaseNode";
import { useNodeFlowStore } from "../store/nodeFlowStore";

type Props = {
  id: string;
  data: {
    documentId?: string;
    title?: string;
    content?: string;
  };
  selected?: boolean;
};

export const MarkdownTextNode: React.FC<Props> = ({ id, data, selected }) => {
  const updateNodeData = useNodeFlowStore((state) => state.updateNodeData);

  const updateTitle = useCallback(
    (title: string) => {
      updateNodeData(id, { title, text: data.content || "", content: data.content || "" } as any);
    },
    [data.content, id, updateNodeData]
  );

  const updateContent = useCallback(
    (content: string) => {
      updateNodeData(id, { title: data.title || "档案文档", text: content, content } as any);
    },
    [data.title, id, updateNodeData]
  );

  return (
    <BaseNode
      title={data.title || "档案文档"}
      onTitleChange={updateTitle}
      inputs={["image", "text"]}
      outputs={["text"]}
      selected={selected}
      variant="text"
      nodeType="text"
    >
      <div className="text-node-shell script-md-node-shell relative flex-1">
        <textarea
          className="text-node-editor script-md-node-editor nodrag"
          value={data.content || ""}
          placeholder="Markdown"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => updateContent(event.target.value)}
        />
      </div>
    </BaseNode>
  );
};
