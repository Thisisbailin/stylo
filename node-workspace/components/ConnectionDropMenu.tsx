import React, { useEffect, useMemo, useRef } from "react";
import { AudioLines, Layers, MessageSquare, Image as ImageIcon, Sparkles, Video, PenTool, Plus } from "lucide-react";
import { NodeType } from "../types";

export type ConnectionDropMenuOption<T extends string = NodeType> = {
  label: string;
  hint: string;
  type: T;
  Icon: React.ComponentType<{ size?: number }>;
  group?: string;
  meta?: string;
  tone?: string;
  surface?: string;
};

type Props<T extends string = NodeType> = {
  position: { x: number; y: number };
  onCreate: (type: T) => void;
  onClose: () => void;
  options?: ConnectionDropMenuOption<T>[];
  subtitle?: string;
};

const defaultOptions: ConnectionDropMenuOption<NodeType>[] = [
    { label: "剧本文档", hint: "Fountain writing document", type: "scriptPage", Icon: Plus, group: "Writing", meta: "Fountain" },
    { label: "档案文档", hint: "Markdown archive document", type: "mdText", Icon: Plus, group: "Writing", meta: "Markdown" },
    { label: "Identity Card", hint: "Character and scene cards", type: "identityCard", Icon: Layers },
    { label: "Text", hint: "Input text", type: "text", Icon: MessageSquare },
    { label: "Image Input", hint: "Upload an image", type: "imageInput", Icon: ImageIcon },
    { label: "Audio Input", hint: "Upload an audio clip", type: "audioInput", Icon: AudioLines },
    { label: "Video Input", hint: "Upload a video clip", type: "videoInput", Icon: Video },
    { label: "Image Gen", hint: "Create images", type: "imageGen", Icon: Sparkles },
    { label: "Nano Banana", hint: "Nano Banana Pro image", type: "nanoBananaImageGen", Icon: Sparkles },
    { label: "WAN Img", hint: "Wan 2.6 image", type: "wanImageGen", Icon: Sparkles },
    { label: "Vidu", hint: "Reference to video", type: "viduVideoGen", Icon: Video },
    { label: "WAN Ref Vid", hint: "Wan 2.7 reference video", type: "wanReferenceVideoGen", Icon: Video },
    { label: "Seedance", hint: "Multimodal reference video", type: "seedanceVideoGen", Icon: Video },
    { label: "Annotation", hint: "Markup image", type: "annotation", Icon: PenTool },
  ];

const groupLabels: Record<string, string> = {
  script: "文档",
  library: "档案",
  input: "输入",
  generation: "图像",
  motion: "视频",
  edit: "编辑",
  Writing: "文档",
  Flow: "Flow",
};

export const ConnectionDropMenu = <T extends string = NodeType>({
  position,
  onCreate,
  onClose,
  options,
  subtitle = "Quick add from the flow",
}: Props<T>) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const resolvedOptions = (options || defaultOptions) as ConnectionDropMenuOption<T>[];
  const groupedOptions = useMemo(() => {
    const groups: Array<{ key: string; options: ConnectionDropMenuOption<T>[] }> = [];
    resolvedOptions.forEach((option) => {
      const rawKey = option.group || option.meta || "Flow";
      const key = groupLabels[rawKey] || rawKey;
      const existing = groups.find((group) => group.key === key);
      if (existing) existing.options.push(option);
      else groups.push({ key, options: [option] });
    });
    return groups;
  }, [resolvedOptions]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="connection-menu absolute z-20"
      style={{ left: position.x, top: position.y }}
    >
      <div className="connection-menu-header">
        <div className="connection-menu-title">Add Node</div>
        <div className="connection-menu-subtitle">{subtitle}</div>
      </div>
      <div className="connection-menu-list">
        {groupedOptions.map((group) => (
          <div key={group.key} className="connection-menu-group">
            <div className="connection-menu-group-label">{group.key}</div>
            <div className="connection-menu-grid">
              {group.options.map((opt) => (
                <button
                  key={opt.type}
                  className="connection-menu-item"
                  onClick={() => {
                    onCreate(opt.type);
                    onClose();
                  }}
                >
                  <span className="connection-menu-icon">
                    <opt.Icon size={15} />
                  </span>
                  <span className="connection-menu-text">
                    <span className="connection-menu-label">{opt.label}</span>
                    <span className="connection-menu-hint">{opt.meta || opt.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
