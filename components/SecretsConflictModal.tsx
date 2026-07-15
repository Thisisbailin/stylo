import React from "react";
import { Cloud, HardDrive, KeyRound } from "lucide-react";
import type { SecretsPayload } from "../sync/secretsSyncAdapter";
import { TopRightHint } from "./TopRightHint";

type Props = {
  remote: SecretsPayload;
  local: SecretsPayload;
  onUseRemote: () => void;
  onKeepLocal: () => void;
};

const summarize = (value: SecretsPayload) => [
  value.textApiKey ? "文本" : null,
  value.multiApiKey ? "多模态" : null,
  value.videoApiKey ? "视频" : null,
].filter(Boolean).join("、") || "未配置";

export const SecretsConflictModal: React.FC<Props> = ({
  remote,
  local,
  onUseRemote,
  onKeepLocal,
}) => (
  <TopRightHint
    stackIndex={2}
    top={20}
    right={20}
    variant="compact"
    widthClassName="w-[248px] max-w-[calc(100vw-24px)]"
  >
    <div className="min-h-[142px]">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-black/10 text-[var(--app-accent-strong)]">
          <KeyRound className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">API Key Sync</div>
          <div className="mt-1 text-[15px] font-semibold text-[var(--app-text-primary)]">选择密钥版本</div>
          <div className="mt-1 text-[11px] leading-5 text-[var(--app-text-secondary)]">
            本地与云端均有改动。密钥不会合并，也不会显示明文。
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onUseRemote}
          className="min-w-0 rounded-[8px] bg-[var(--app-panel-soft)] p-3 text-left transition hover:bg-black/10"
        >
          <Cloud className="h-4 w-4 text-[var(--app-accent-strong)]" />
          <div className="mt-2 text-[11px] font-semibold text-[var(--app-text-primary)]">使用云端</div>
          <div className="mt-1 truncate text-[10px] text-[var(--app-text-muted)]">{summarize(remote)}</div>
        </button>
        <button
          type="button"
          onClick={onKeepLocal}
          className="min-w-0 rounded-[8px] bg-[var(--app-panel-soft)] p-3 text-left transition hover:bg-black/10"
        >
          <HardDrive className="h-4 w-4 text-[var(--app-accent-strong)]" />
          <div className="mt-2 text-[11px] font-semibold text-[var(--app-text-primary)]">保留本地</div>
          <div className="mt-1 truncate text-[10px] text-[var(--app-text-muted)]">{summarize(local)}</div>
        </button>
      </div>
    </div>
  </TopRightHint>
);
