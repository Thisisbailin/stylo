import React, { useRef, useLayoutEffect } from "react";
import { BaseNode } from "./BaseNode";
import { NoteNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { StickyNote } from "lucide-react";

type Props = {
    id: string;
    data: NoteNodeData;
};

export const NoteNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
    const { updateNodeData } = useNodeFlowStore();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const autoResize = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    };

    useLayoutEffect(() => {
        autoResize();
    }, [data.text]);

    return (
        <BaseNode
            title={data.title || "Note"}
            onTitleChange={(title) => updateNodeData(id, { title })}
            selected={selected}
        >
            <div className="flex-1 flex flex-col space-y-3">
                <div className="node-pill inline-flex items-center gap-2 px-3 py-1 shadow-sm w-fit">
                    <StickyNote size={10} className="text-[var(--node-text-secondary)]" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--node-text-secondary)]">ANNOTATION</span>
                </div>
                <textarea
                    ref={textareaRef}
                    className="node-textarea w-full text-[13px] leading-relaxed p-4 outline-none resize-none transition-all placeholder:text-[var(--node-text-secondary)] min-h-[100px]"
                    value={data.text}
                    onChange={(e) => {
                        updateNodeData(id, { text: e.target.value });
                        autoResize();
                    }}
                    onFocus={autoResize}
                    placeholder="Write your note here..."
                    style={{ height: 'auto' }}
                />
            </div>
        </BaseNode>
    );
};
