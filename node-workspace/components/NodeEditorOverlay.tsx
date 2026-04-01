import React, { useState } from "react";
import { X, Type } from "lucide-react";
import { useNodeFlowStore } from "../store/nodeFlowStore";

type Props = {
    nodeId: string;
    position: { x: number; y: number };
    onClose: () => void;
};

export const NodeEditorOverlay: React.FC<Props> = ({ nodeId, position, onClose }) => {
    const { nodes, updateNodeData } = useNodeFlowStore();
    const node = nodes.find((n) => n.id === nodeId);

    if (!node) return null;

    const data = node.data as any;
    const [title, setTitle] = useState(data.title || "");
    const [text, setText] = useState(data.text || "");

    const handleSave = () => {
        const updates: any = {};
        if ('title' in data) updates.title = title;
        if ('text' in data) updates.text = text;

        updateNodeData(nodeId, updates);
        onClose();
    };

    return (
        <div
            className="fixed z-50 w-72 p-1 rounded-2xl app-panel animate-in zoom-in-95 duration-200"
            style={{
                left: position.x,
                top: position.y - 120, // Appear above the card
                transform: 'translateX(-50%)'
            }}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest app-text-muted">Quick Edit</span>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--app-panel-muted)] rounded-lg transition-colors">
                        <X size={14} className="text-[var(--app-text-secondary)]" />
                    </button>
                </div>

                {'title' in data && (
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-bold app-text-muted uppercase flex items-center gap-1.5">
                            <Type size={10} /> Title
                        </label>
                        <input
                            className="w-full bg-[var(--app-panel-muted)] text-[var(--app-text-primary)] text-[13px] font-bold px-3 py-2 rounded-xl outline-none focus:ring-1 focus:ring-[var(--app-accent-soft)] transition-all"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Node Title"
                        />
                    </div>
                )}

                {'text' in data && (
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-bold app-text-muted uppercase flex items-center gap-1.5">
                            Content
                        </label>
                        <textarea
                            className="w-full min-h-[100px] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)] text-[12px] leading-relaxed px-3 py-2 rounded-xl outline-none focus:ring-1 focus:ring-[var(--app-accent-soft)] transition-all resize-none"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Node content..."
                        />
                    </div>
                )}

                <button
                    onClick={handleSave}
                    className="w-full py-2.5 bg-[var(--app-accent)] hover:bg-[var(--app-accent-strong)] text-white text-xs font-bold rounded-xl shadow-lg shadow-black/20 active:scale-95 transition-all"
                >
                    Update Node
                </button>
            </div>
        </div>
    );
};
