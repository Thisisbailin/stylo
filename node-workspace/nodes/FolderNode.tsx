import React from "react";
import { Folder } from "lucide-react";
import { BaseNode } from "./BaseNode";
import type { FolderNodeData } from "../types";

type Props = {
  id: string;
  data: FolderNodeData;
  selected?: boolean;
};

export const FolderNode: React.FC<Props> = ({ data, selected }) => {
  const title = data.title || "文件夹";

  return (
    <BaseNode
      title={title}
      selected={selected}
      variant="default"
      nodeType="folder"
      inputs={["text"]}
      outputs={["text"]}
    >
      <div className="folder-node-body">
        <div className="folder-node-icon" aria-hidden="true">
          <Folder size={28} strokeWidth={1.75} />
        </div>
        <div className="folder-node-copy">
          <span>Folder</span>
          <strong>{title}</strong>
        </div>
      </div>
    </BaseNode>
  );
};
