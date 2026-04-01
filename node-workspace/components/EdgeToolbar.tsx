import React from "react";
import { useNodeFlowStore } from "../store/nodeFlowStore";

type Props = {
  linkId: string;
};

export const EdgeToolbar: React.FC<Props> = ({ linkId }) => {
  const { links, revision, removeLink, toggleLinkPause } = useNodeFlowStore();
  const edge = links.find((e) => e.id === linkId);
  if (!edge) return null;

  return (
    <div className="flex items-center gap-2 app-panel px-2 py-1 rounded">
      <button
        onClick={() => toggleLinkPause(linkId, { expectedRevision: revision })}
        className={`px-2 py-1 text-xs rounded ${edge.data?.hasPause ? "bg-amber-600 text-white" : "bg-[var(--app-panel-muted)] text-[var(--app-text-primary)]"}`}
      >
        {edge.data?.hasPause ? "Unpause" : "Pause"}
      </button>
      <button onClick={() => removeLink(linkId, { expectedRevision: revision })} className="px-2 py-1 text-xs bg-red-600 text-white rounded">
        Delete
      </button>
    </div>
  );
};
