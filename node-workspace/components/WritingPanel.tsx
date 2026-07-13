import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, Check, PaperPlaneTilt, X } from "@phosphor-icons/react";
import type { AgentUiContext } from "../../agents/runtime/types";
import type { ProjectData } from "../../types";
import { projectRolesToCharacters } from "../../utils/projectRoles";
import type { NodeFlowNode } from "../types";
import {
  analyzeFountainLines,
  analyzeScreenplay,
  createScreenplayPreview,
  normalizeFountainDocument,
  stripFountainMarkup,
} from "../screenplay/fountainEngine";
import {
  buildScriptLinePatch,
  deriveReviewedScriptBody,
  hasPendingPatchLines,
  type PendingScriptPatch,
  type ScriptPatchLine,
  type ScriptPatchLineStatus,
} from "../screenplay/scriptPatch";
import { ScreenplayBlockEditor } from "./screenplay/ScreenplayBlockEditor";
import {
  ScreenplayHeader,
  ScreenplayInspector,
  ScreenplayNavigator,
  type SaveState,
} from "./screenplay/ScreenplayChrome";
import type { AgentScriptEditProposalBatch, ScriptDocumentCommit } from "./qalam/interactionTypes";
import "../styles/screenplay.css";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onClose?: () => void;
  initialScriptNodeId?: string | null;
  isQalamOpen?: boolean;
  agentScriptEditProposals?: AgentScriptEditProposalBatch | null;
  onResolveAgentScriptEditProposal?: (proposalId: string) => void;
  onCommitScriptDocument?: (commit: ScriptDocumentCommit) => void;
  onOpenQalam?: () => void;
  onCloseQalam?: () => void;
  onSubmitToQalam?: (text: string, uiContext?: AgentUiContext) => void;
};

type WritingDraft = {
  title: string;
  body: string;
};

type SelectionCommand = {
  text: string;
  start: number;
  end: number;
  lineIndex: number;
  message: string;
};

type ReviewedSnapshot = WritingDraft;

const ensureFlow = (flow: ProjectData["flow"]): NonNullable<ProjectData["flow"]> => ({
  flowNodes: Array.isArray(flow?.flowNodes) ? flow.flowNodes : [],
  links: Array.isArray(flow?.links) ? flow.links : [],
  graphLinks: Array.isArray(flow?.graphLinks) ? flow.graphLinks : [],
  globalAssetHistory: Array.isArray(flow?.globalAssetHistory) ? flow.globalAssetHistory : [],
  linkStyle: flow?.linkStyle,
  activeView: flow?.activeView,
});

const findScriptNode = (projectData: ProjectData, nodeId?: string | null): NodeFlowNode | null => {
  const nodes = Array.isArray(projectData.flow?.flowNodes) ? projectData.flow.flowNodes : [];
  if (nodeId) {
    const explicit = nodes.find((node) => node.id === nodeId && node.type === "scriptPage");
    if (explicit) return explicit;
  }
  return nodes.find((node) => node.type === "scriptPage") || null;
};

const readScriptNode = (node: NodeFlowNode | null): WritingDraft => {
  const data = (node?.data || {}) as { title?: string; text?: string; content?: string };
  const content = typeof data.content === "string" ? data.content : data.text || "";
  return {
    title: data.title?.trim() || "剧本文档",
    body: normalizeFountainDocument(content),
  };
};

const draftsEqual = (left: WritingDraft, right: WritingDraft) =>
  left.title === right.title && left.body === right.body;

const downloadFountain = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const WritingPanel: React.FC<Props> = ({
  projectData,
  setProjectData,
  onClose,
  initialScriptNodeId,
  isQalamOpen = false,
  agentScriptEditProposals = null,
  onResolveAgentScriptEditProposal,
  onCommitScriptDocument,
  onOpenQalam,
  onCloseQalam,
  onSubmitToQalam,
}) => {
  const scriptNode = useMemo(
    () => findScriptNode(projectData, initialScriptNodeId),
    [initialScriptNodeId, projectData.flow?.flowNodes]
  );
  const sourceDraft = useMemo(() => readScriptNode(scriptNode), [scriptNode]);
  const [loadedNodeId, setLoadedNodeId] = useState<string | null>(scriptNode?.id || null);
  const [draft, setDraft] = useState<WritingDraft>(sourceDraft);
  const draftRef = useRef(draft);
  const lastCommittedRef = useRef<WritingDraft>(sourceDraft);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [navigationRequest, setNavigationRequest] = useState<{ lineIndex: number; id: number } | null>(null);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [selectionCommand, setSelectionCommand] = useState<SelectionCommand | null>(null);
  const [pendingPatch, setPendingPatch] = useState<PendingScriptPatch | null>(null);
  const [lastReviewedSnapshot, setLastReviewedSnapshot] = useState<ReviewedSnapshot | null>(null);
  const [externalConflict, setExternalConflict] = useState<WritingDraft | null>(null);
  const handledProposalIdsRef = useRef(new Set<string>());

  const knownCharacters = useMemo(
    () => projectRolesToCharacters(projectData.roles || []).map((character) => character.name.trim()).filter(Boolean),
    [projectData.roles]
  );
  const deferredBody = useDeferredValue(draft.body);
  const analysis = useMemo(() => analyzeScreenplay(deferredBody, knownCharacters), [deferredBody, knownCharacters]);
  const liveLines = useMemo(() => analyzeFountainLines(draft.body), [draft.body]);
  const activeLine = liveLines[Math.min(activeLineIndex, Math.max(0, liveLines.length - 1))] || {
    index: 0,
    start: 0,
    end: 0,
    raw: "",
    content: "",
    kind: "action" as const,
  };
  const locationSuggestions = analysis.locations;

  useEffect(() => {
    draftRef.current = draft;
    if (!draftsEqual(draft, lastCommittedRef.current)) setSaveState("idle");
  }, [draft]);

  useEffect(() => {
    const nextNodeId = scriptNode?.id || null;
    if (nextNodeId === loadedNodeId) return;
    setLoadedNodeId(nextNodeId);
    setDraft(sourceDraft);
    draftRef.current = sourceDraft;
    lastCommittedRef.current = sourceDraft;
    setSaveState("saved");
    setActiveLineIndex(0);
    setPendingPatch(null);
    setExternalConflict(null);
    setSelectionCommand(null);
  }, [loadedNodeId, scriptNode?.id, sourceDraft]);

  useEffect(() => {
    if (!scriptNode?.id || scriptNode.id !== loadedNodeId) return;
    if (draftsEqual(sourceDraft, lastCommittedRef.current)) return;
    if (pendingPatch) return;
    if (draftsEqual(draftRef.current, lastCommittedRef.current)) {
      setDraft(sourceDraft);
      draftRef.current = sourceDraft;
      lastCommittedRef.current = sourceDraft;
      setSaveState("saved");
      return;
    }
    setExternalConflict(sourceDraft);
    setSaveState("conflict");
  }, [loadedNodeId, pendingPatch, scriptNode?.id, sourceDraft]);

  const commitDraft = useCallback((nextDraft: WritingDraft) => {
    const nodeId = scriptNode?.id || initialScriptNodeId;
    if (!nodeId || pendingPatch || externalConflict || draftsEqual(nextDraft, lastCommittedRef.current)) return;
    const normalized: WritingDraft = {
      title: nextDraft.title.trim() || "剧本文档",
      body: normalizeFountainDocument(nextDraft.body),
    };
    setSaveState("saving");
    try {
      if (onCommitScriptDocument) {
        onCommitScriptDocument({
          nodeId,
          title: normalized.title,
          content: normalized.body,
          preview: createScreenplayPreview(normalized.body),
          stats: analyzeScreenplay(normalized.body).stats,
        });
      } else {
        setProjectData((previous) => {
          const flow = ensureFlow(previous.flow);
          let changed = false;
          const flowNodes = (flow.flowNodes || []).map((node) => {
            if (node.id !== nodeId || node.type !== "scriptPage") return node;
            changed = true;
            const data = (node.data || {}) as Record<string, unknown>;
            return {
              ...node,
              data: {
                ...data,
                title: normalized.title,
                text: normalized.body,
                content: normalized.body,
                documentId: typeof data.documentId === "string" && data.documentId ? data.documentId : node.id,
                documentKind: "script",
                format: "fountain",
                preview: createScreenplayPreview(normalized.body),
                updatedAt: Date.now(),
              },
            };
          });
          return changed ? { ...previous, rawScript: "", episodes: [], flow: { ...flow, flowNodes } } : previous;
        });
      }
      lastCommittedRef.current = normalized;
      if (!draftsEqual(nextDraft, normalized)) setDraft(normalized);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [externalConflict, initialScriptNodeId, onCommitScriptDocument, pendingPatch, scriptNode?.id, setProjectData]);

  useEffect(() => {
    if (pendingPatch || externalConflict || draftsEqual(draft, lastCommittedRef.current)) return;
    const timer = window.setTimeout(() => commitDraft(draft), 650);
    return () => window.clearTimeout(timer);
  }, [commitDraft, draft, externalConflict, pendingPatch]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") commitDraft(draftRef.current);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        commitDraft(draftRef.current);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [commitDraft]);

  useEffect(() => {
    const compactLayout = window.matchMedia("(max-width: 1180px)");
    const collapseSidePanels = (event: MediaQueryListEvent | MediaQueryList) => {
      if (!event.matches) return;
      setIsNavigatorOpen(false);
      setIsInspectorOpen(false);
    };
    collapseSidePanels(compactLayout);
    compactLayout.addEventListener("change", collapseSidePanels);
    return () => compactLayout.removeEventListener("change", collapseSidePanels);
  }, []);

  useEffect(() => {
    if (!scriptNode?.id || !agentScriptEditProposals) return;
    const proposal = agentScriptEditProposals.proposals.find((item) => item.nodeId === scriptNode.id);
    if (!proposal || handledProposalIdsRef.current.has(proposal.id)) return;
    handledProposalIdsRef.current.add(proposal.id);
    const proposedDraft = {
      title: proposal.title.trim() || draftRef.current.title,
      body: normalizeFountainDocument(proposal.content),
    };
    if (draftsEqual(proposedDraft, draftRef.current)) {
      onResolveAgentScriptEditProposal?.(proposal.id);
      return;
    }
    setSelectionCommand(null);
    setPendingPatch({
      id: proposal.id,
      baseTitle: draftRef.current.title,
      nextTitle: proposedDraft.title,
      baseBody: draftRef.current.body,
      nextBody: proposedDraft.body,
      lines: buildScriptLinePatch(draftRef.current.body, proposedDraft.body),
    });
  }, [agentScriptEditProposals, onResolveAgentScriptEditProposal, scriptNode?.id]);

  const navigateToLine = useCallback((lineIndex: number) => {
    setActiveLineIndex(lineIndex);
    setNavigationRequest({ lineIndex, id: Date.now() });
  }, []);

  const updatePatch = useCallback((updater: (line: ScriptPatchLine) => ScriptPatchLine) => {
    setPendingPatch((current) => {
      if (!current) return current;
      const next = { ...current, lines: current.lines.map((line) => line.kind === "equal" ? line : updater(line)) };
      const body = deriveReviewedScriptBody(next);
      setDraft((existing) => ({ ...existing, body }));
      if (hasPendingPatchLines(next)) return next;
      const allAccepted = next.lines.filter((line) => line.kind !== "equal").every((line) => line.status === "accepted");
      const reviewed = { title: allAccepted ? next.nextTitle : next.baseTitle, body };
      setLastReviewedSnapshot({ title: next.baseTitle, body: next.baseBody });
      setDraft(reviewed);
      requestAnimationFrame(() => commitDraft(reviewed));
      onResolveAgentScriptEditProposal?.(next.id);
      return null;
    });
  }, [commitDraft, onResolveAgentScriptEditProposal]);

  const reviewAll = useCallback((status: ScriptPatchLineStatus) => {
    updatePatch((line) => ({ ...line, status }));
  }, [updatePatch]);

  const undoReviewedPatch = useCallback(() => {
    if (!lastReviewedSnapshot) return;
    setDraft(lastReviewedSnapshot);
    commitDraft(lastReviewedSnapshot);
    setLastReviewedSnapshot(null);
  }, [commitDraft, lastReviewedSnapshot]);

  const submitSelectionCommand = useCallback(() => {
    if (!selectionCommand?.message.trim() || !scriptNode?.id) return;
    const data = (scriptNode.data || {}) as Record<string, unknown>;
    if (!isQalamOpen) onOpenQalam?.();
    onSubmitToQalam?.(selectionCommand.message.trim(), {
      documentSelection: {
        kind: "script",
        nodeId: scriptNode.id,
        documentId: typeof data.documentId === "string" ? data.documentId : undefined,
        title: draft.title,
        selectedText: selectionCommand.text,
        range: { start: selectionCommand.start, end: selectionCommand.end },
      },
    });
    setSelectionCommand(null);
  }, [draft.title, isQalamOpen, onOpenQalam, onSubmitToQalam, scriptNode, selectionCommand]);

  const handleClose = () => {
    if (externalConflict) return;
    commitDraft(draftRef.current);
    onClose?.();
  };

  const handleExport = () => {
    const baseName = (projectData.fileName || draft.title || "qalam-script").replace(/\.[^/.]+$/, "");
    downloadFountain(`${baseName}.fountain`, normalizeFountainDocument(draft.body));
  };

  return (
    <div className={`screenplay-workspace ${isFocusMode ? "is-focus-mode" : ""}`}>
      <ScreenplayHeader
        title={draft.title}
        saveState={saveState}
        isFocusMode={isFocusMode}
        isNavigatorOpen={isNavigatorOpen}
        isInspectorOpen={isInspectorOpen}
        isQalamOpen={isQalamOpen}
        onTitleChange={(title) => setDraft((current) => ({ ...current, title }))}
        onToggleFocus={() => setIsFocusMode((active) => !active)}
        onToggleNavigator={() => setIsNavigatorOpen((open) => {
          const next = !open;
          if (next && window.matchMedia("(max-width: 1180px)").matches) setIsInspectorOpen(false);
          return next;
        })}
        onToggleInspector={() => setIsInspectorOpen((open) => {
          const next = !open;
          if (next && window.matchMedia("(max-width: 1180px)").matches) setIsNavigatorOpen(false);
          return next;
        })}
        onToggleQalam={() => isQalamOpen ? onCloseQalam?.() : onOpenQalam?.()}
        onExport={handleExport}
        onClose={handleClose}
      />

      <div
        className="screenplay-layout"
        style={{ "--screenplay-agent-inset": isQalamOpen ? "min(440px, 30vw)" : "0px" } as React.CSSProperties}
      >
        {isNavigatorOpen ? (
          <ScreenplayNavigator analysis={analysis} activeLineIndex={activeLine.index} onNavigate={navigateToLine} />
        ) : null}

        <main className="screenplay-document-viewport">
          <article className="screenplay-document">
            <header className="screenplay-document__masthead">
              <div>
                <span>QALAM SCREENPLAY</span>
                <strong>{draft.title || "未命名剧本"}</strong>
              </div>
              <small>{analysis.stats.estimatedPages} PAGE · {analysis.stats.scenes} SCENE</small>
            </header>
            <ScreenplayBlockEditor
              body={draft.body}
              lines={liveLines}
              activeLineIndex={activeLine.index}
              navigationRequest={navigationRequest}
              readOnly={!!pendingPatch}
              characterSuggestions={Array.from(new Set([...knownCharacters, ...analysis.characterNames]))}
              locationSuggestions={locationSuggestions}
              onChange={(body) => setDraft((current) => ({ ...current, body }))}
              onActiveLineChange={setActiveLineIndex}
              onSelectionChange={(selection) => {
                setSelectionCommand(selection ? { ...selection, message: "" } : null);
              }}
            />
          </article>
        </main>

        {isInspectorOpen ? (
          <ScreenplayInspector analysis={analysis} activeLine={activeLine} onNavigate={navigateToLine} />
        ) : null}
      </div>

      {selectionCommand && !pendingPatch ? (
        <form className="screenplay-selection-command" onSubmit={(event) => { event.preventDefault(); submitSelectionCommand(); }}>
          <span title={selectionCommand.text}>“{selectionCommand.text.replace(/\s+/g, " ").slice(0, 26)}”</span>
          <input
            autoFocus
            value={selectionCommand.message}
            onChange={(event) => setSelectionCommand((current) => current ? { ...current, message: event.target.value } : current)}
            placeholder="让 Qalam 重写、压缩或检查这段内容"
            aria-label="针对选中文本向 Qalam 提问"
          />
          <button type="submit" className="is-primary" disabled={!selectionCommand.message.trim()} aria-label="发送给 Qalam">
            <PaperPlaneTilt size={15} weight="fill" />
          </button>
          <button type="button" onClick={() => setSelectionCommand(null)} aria-label="关闭">
            <X size={14} />
          </button>
        </form>
      ) : null}

      {externalConflict ? (
        <div className="screenplay-conflict-banner" role="alert">
          <div>
            <strong>检测到外部版本</strong>
            <span>当前草稿尚未保存，请选择要保留的版本。</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(externalConflict);
              draftRef.current = externalConflict;
              lastCommittedRef.current = externalConflict;
              setExternalConflict(null);
              setSaveState("saved");
            }}
          >载入外部版本</button>
          <button
            type="button"
            className="is-primary"
            onClick={() => {
              lastCommittedRef.current = externalConflict;
              setExternalConflict(null);
              setSaveState("idle");
            }}
          >保留我的草稿</button>
        </div>
      ) : null}

      {lastReviewedSnapshot && !pendingPatch ? (
        <button type="button" className="screenplay-review-undo" onClick={undoReviewedPatch}>
          <ArrowCounterClockwise size={14} />
          撤销 Qalam 修改
        </button>
      ) : null}

      {pendingPatch ? (
        <div className="screenplay-patch-review" role="dialog" aria-modal="true" aria-label="Qalam 修改审核">
          <div className="screenplay-patch-review__dialog">
            <header className="screenplay-patch-review__header">
              <div>
                <strong>审核 Qalam 修改</strong>
                <span>{pendingPatch.lines.filter((line) => line.kind !== "equal").length} 项变更，逐项决定后才会写入剧本</span>
              </div>
            </header>
            <div className="screenplay-patch-review__list">
              {pendingPatch.lines.filter((line) => line.kind !== "equal").map((line) => (
                <div key={line.id} className={`screenplay-patch-line is-${line.kind} is-${line.status}`}>
                  <span>{line.kind === "insert" ? "新增" : "删除"}</span>
                  <p>{stripFountainMarkup(line.line) || "空行"}</p>
                  {line.status === "pending" ? (
                    <div>
                      <button type="button" onClick={() => updatePatch((item) => item.id === line.id ? { ...item, status: "accepted" } : item)}>接受</button>
                      <button type="button" onClick={() => updatePatch((item) => item.id === line.id ? { ...item, status: "rejected" } : item)}>拒绝</button>
                    </div>
                  ) : <span>{line.status === "accepted" ? "已接受" : "已拒绝"}</span>}
                </div>
              ))}
            </div>
            <footer className="screenplay-patch-review__footer">
              <button type="button" onClick={() => reviewAll("rejected")}><X size={13} /> 全部拒绝</button>
              <button type="button" className="is-primary" onClick={() => reviewAll("accepted")}><Check size={13} /> 全部接受</button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
};
