import React from "react";
import type { KnowledgeAnchor, KnowledgeNode } from "../types";
import { useKnowledgeStore } from "../../store/knowledgeStore";

type Props = {
  anchor: KnowledgeAnchor | null;
  latestActiveDerivedNode: KnowledgeNode | null;
};

export const KnowledgeMutationLab: React.FC<Props> = ({
  anchor,
  latestActiveDerivedNode,
}) => {
  const [debugActionNote, setDebugActionNote] = React.useState("");
  const createDerivedNodeForAnchor = useKnowledgeStore((state) => state.createDerivedNodeForAnchor);
  const supersedeDerivedNodeForAnchor = useKnowledgeStore((state) => state.supersedeDerivedNodeForAnchor);

  const handleCreateDerivedForAnchor = React.useCallback(() => {
    if (!anchor) return;
    const created = createDerivedNodeForAnchor({
      anchorType: anchor.type,
      anchorRef: anchor.ref,
      anchorSpan: anchor.span,
      kind: "derived.note",
      title: `${anchor.type}:${anchor.ref} note`,
      status: "working",
      content: {
        note: "Debug seeded derived knowledge node.",
        anchor: `${anchor.type}:${anchor.ref}`,
      },
    });
    setDebugActionNote(`Created derived node ${created.ref}`);
  }, [anchor, createDerivedNodeForAnchor]);

  const handleSupersedeDerivedForAnchor = React.useCallback(() => {
    if (!anchor || !latestActiveDerivedNode) return;
    const created = supersedeDerivedNodeForAnchor({
      anchorType: anchor.type,
      anchorRef: anchor.ref,
      anchorSpan: anchor.span,
      nodeId: latestActiveDerivedNode.id,
      title: `${latestActiveDerivedNode.package.title} revision`,
      content: {
        ...latestActiveDerivedNode.content,
        note: "Debug superseded revision.",
        revisedFrom: latestActiveDerivedNode.ref,
      },
      status: "working",
    });
    setDebugActionNote(`Superseded ${latestActiveDerivedNode.ref} with ${created.ref}`);
  }, [anchor, latestActiveDerivedNode, supersedeDerivedNodeForAnchor]);

  return (
    <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
        Mutation Lab
      </div>
      <div className="mt-2 text-[11px] leading-6 text-[var(--app-text-secondary)]">
        这里是独立的开发实验区，只用于验证 derived knowledge 的写入与 supersede 修正链。
        正式的 Knowledge Surface 仍以只读观测为先。
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCreateDerivedForAnchor}
          disabled={!anchor}
          className="rounded-full border border-[var(--app-border-strong)] bg-[var(--app-panel)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--app-text-primary)] transition hover:bg-[var(--app-panel-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create Derived
        </button>
        <button
          type="button"
          onClick={handleSupersedeDerivedForAnchor}
          disabled={!latestActiveDerivedNode}
          className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--app-text-primary)] transition hover:bg-[var(--app-panel-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Supersede Latest Derived
        </button>
      </div>
      {debugActionNote ? (
        <div className="mt-2 text-[10px] text-[var(--app-text-secondary)]">{debugActionNote}</div>
      ) : null}
    </div>
  );
};
