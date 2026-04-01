import React from "react";
import { Timer, MoveRight, Table, LayoutList } from "lucide-react";
import { ShotNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { BaseNode } from "./BaseNode";

type Props = {
  id: string;
  data: ShotNodeData;
};

const DETAIL_FIELDS: Array<{ key: keyof ShotNodeData; label: string; minHeight: number }> = [
  { key: "composition", label: "机位/构图", minHeight: 68 },
  { key: "blocking", label: "调度/表演", minHeight: 68 },
  { key: "dialogue", label: "台词/OS", minHeight: 52 },
  { key: "sound", label: "声音", minHeight: 52 },
  { key: "lightingVfx", label: "光色/VFX", minHeight: 52 },
  { key: "editingNotes", label: "剪辑", minHeight: 52 },
  { key: "notes", label: "备注（氛围/情绪）", minHeight: 52 },
];

export const ShotNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData } = useNodeFlowStore();
  const isTableView = (data.viewMode || "card") === "table";

  const updateField = (key: keyof ShotNodeData, value: string) => {
    updateNodeData(id, { [key]: value });
  };

  const renderTextarea = (key: keyof ShotNodeData, label: string, minHeight: number) => (
    <div key={String(key)} className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--node-text-secondary)]">{label}</label>
      <textarea
        className="node-textarea w-full resize-none text-[11px] leading-relaxed outline-none"
        style={{ minHeight }}
        value={(data[key] as string) || ""}
        onChange={(event) => updateField(key, event.target.value)}
      />
    </div>
  );

  return (
    <BaseNode
      title={data.shotId || "S-1"}
      onTitleChange={(title) => updateNodeData(id, { shotId: title })}
      inputs={["image"]}
      outputs={["text"]}
      selected={selected}
    >
      <div className="flex flex-1 flex-col gap-4">
        {!isTableView && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="node-pill flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest">
                <Timer size={12} className="opacity-40" />
                <input
                  className="w-10 bg-transparent outline-none"
                  value={data.duration}
                  onChange={(event) => updateField("duration", event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="node-pill node-pill--accent inline-flex items-center px-3 py-1 shadow-sm">
                  <input
                    className="bg-transparent text-[9px] font-black uppercase tracking-[0.2em] text-[var(--node-accent)] outline-none"
                    value={data.shotType}
                    onChange={(event) => updateField("shotType", event.target.value)}
                    placeholder="景别"
                    style={{ width: Math.max(data.shotType.length || 2, 4) + "ch" }}
                  />
                </div>
                <div className="node-pill inline-flex items-center px-3 py-1">
                  <input
                    className="bg-transparent text-[9px] font-bold uppercase tracking-widest text-[var(--node-text-secondary)] outline-none"
                    value={data.focalLength}
                    onChange={(event) => updateField("focalLength", event.target.value)}
                    placeholder="焦段"
                    style={{ width: Math.max(data.focalLength.length || 2, 4) + "ch" }}
                  />
                </div>
                <div className="node-pill inline-flex items-center gap-1 px-3 py-1">
                  <MoveRight size={10} className="shrink-0 opacity-40 text-[var(--node-text-secondary)]" />
                  <input
                    className="bg-transparent text-[9px] font-bold uppercase tracking-widest text-[var(--node-text-secondary)] outline-none"
                    value={data.movement}
                    onChange={(event) => updateField("movement", event.target.value)}
                    placeholder="运镜"
                    style={{ width: Math.max(data.movement.length || 2, 4) + "ch" }}
                  />
                </div>
              </div>
            </div>

            <div className="node-surface rounded-2xl p-4 transition-all">
              {renderTextarea("composition", "机位/构图", 88)}
            </div>

            <div className="node-surface rounded-2xl p-4 transition-all">
              {renderTextarea("blocking", "调度/表演", 88)}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {DETAIL_FIELDS.slice(2).map((field) => renderTextarea(field.key, field.label, field.minHeight))}
            </div>
          </div>
        )}

        {isTableView && (
          <div className="node-surface space-y-3 rounded-2xl p-4 transition-all">
            <div className="grid grid-cols-[90px_1fr] items-center gap-2 text-[11px]">
              <div className="font-bold text-[var(--node-text-secondary)]">时长</div>
              <input
                className="node-control node-control--tight px-2 text-[11px] font-semibold"
                value={data.duration}
                onChange={(event) => updateField("duration", event.target.value)}
              />

              <div className="font-bold text-[var(--node-text-secondary)]">景别</div>
              <input
                className="node-control node-control--tight px-2 text-[11px] font-semibold"
                value={data.shotType}
                onChange={(event) => updateField("shotType", event.target.value)}
              />

              <div className="font-bold text-[var(--node-text-secondary)]">焦段</div>
              <input
                className="node-control node-control--tight px-2 text-[11px] font-semibold"
                value={data.focalLength}
                onChange={(event) => updateField("focalLength", event.target.value)}
              />

              <div className="font-bold text-[var(--node-text-secondary)]">运镜</div>
              <input
                className="node-control node-control--tight px-2 text-[11px] font-semibold"
                value={data.movement}
                onChange={(event) => updateField("movement", event.target.value)}
              />
            </div>

            {DETAIL_FIELDS.map((field) => renderTextarea(field.key, field.label, field.minHeight))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="node-pill node-pill--accent inline-flex items-center px-3 py-1 shadow-sm transition-all duration-200">
            <input
              className="bg-transparent text-center text-[9px] font-black uppercase tracking-[0.2em] text-[var(--node-accent)] outline-none"
              value={data.shotId}
              onChange={(event) => updateField("shotId", event.target.value)}
              placeholder="SHOT ID"
              style={{ width: Math.max(data.shotId.length || 4, 4) + "ch" }}
            />
          </div>
          <button
            className="node-pill inline-flex items-center gap-1 px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-[var(--node-text-secondary)] transition-all hover:text-[var(--node-text-primary)]"
            onClick={() => updateNodeData(id, { viewMode: isTableView ? "card" : "table" })}
          >
            {isTableView ? <LayoutList size={10} /> : <Table size={10} />}
            {isTableView ? "Card View" : "Table View"}
          </button>
        </div>
      </div>
    </BaseNode>
  );
};
