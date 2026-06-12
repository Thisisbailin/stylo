import React, { useEffect, useRef } from "react";
import { AudioLines, BookOpen, LayoutPanelTop, Layers, MessageSquare, Image as ImageIcon, Sparkles, Video, PenTool } from "lucide-react";
import { NodeType } from "../types";

export type ConnectionDropMenuOption<T extends string = NodeType> = {
  label: string;
  hint: string;
  type: T;
  Icon: React.ComponentType<{ size?: number }>;
};

type Props<T extends string = NodeType> = {
  position: { x: number; y: number };
  onCreate: (type: T) => void;
  onClose: () => void;
  options?: ConnectionDropMenuOption<T>[];
  subtitle?: string;
};

const defaultOptions: ConnectionDropMenuOption<NodeType>[] = [
    { label: "Script Panel", hint: "Episode and scene browser", type: "scriptBoard", Icon: BookOpen },
    { label: "Storyboard Table", hint: "Shot table board", type: "storyboardBoard", Icon: LayoutPanelTop },
    { label: "Identity Card", hint: "Character and scene cards", type: "identityCard", Icon: Layers },
    { label: "Text", hint: "Input text", type: "text", Icon: MessageSquare },
    { label: "Image Input", hint: "Upload an image", type: "imageInput", Icon: ImageIcon },
    { label: "Audio Input", hint: "Upload an audio clip", type: "audioInput", Icon: AudioLines },
    { label: "Video Input", hint: "Upload a video clip", type: "videoInput", Icon: Video },
    { label: "Image Gen", hint: "Create images", type: "imageGen", Icon: Sparkles },
    { label: "Nano Banana", hint: "Nano Banana Pro image", type: "nanoBananaImageGen", Icon: Sparkles },
    { label: "WAN Img", hint: "Wan 2.6 image", type: "wanImageGen", Icon: Sparkles },
    { label: "Sora Video", hint: "Generate Sora clips", type: "soraVideoGen", Icon: Video },
    { label: "Vidu", hint: "Reference to video", type: "viduVideoGen", Icon: Video },
    { label: "WAN Ref Vid", hint: "Wan 2.7 reference video", type: "wanReferenceVideoGen", Icon: Video },
    { label: "Seedance", hint: "Multimodal reference video", type: "seedanceVideoGen", Icon: Video },
    { label: "Annotation", hint: "Markup image", type: "annotation", Icon: PenTool },
  ];

export const ConnectionDropMenu = <T extends string = NodeType>({
  position,
  onCreate,
  onClose,
  options,
  subtitle = "Quick add from the flow",
}: Props<T>) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const resolvedOptions = (options || defaultOptions) as ConnectionDropMenuOption<T>[];

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
      className="connection-menu absolute z-20 w-64"
      style={{ left: position.x, top: position.y }}
    >
      <div className="connection-menu-header">
        <div className="connection-menu-title">Create Node</div>
        <div className="connection-menu-subtitle">{subtitle}</div>
      </div>
      <div className="connection-menu-list">
        {resolvedOptions.map((opt) => (
          <button
            key={opt.type}
            className="connection-menu-item"
            onClick={() => {
              onCreate(opt.type);
              onClose();
            }}
          >
            <div className="connection-menu-icon">
              <opt.Icon size={16} />
            </div>
            <div className="connection-menu-text">
              <div className="connection-menu-label">{opt.label}</div>
              <div className="connection-menu-hint">{opt.hint}</div>
            </div>
          </button>
        ))}
      </div>
      <button onClick={onClose} className="connection-menu-cancel">
        Cancel
      </button>
    </div>
  );
};
