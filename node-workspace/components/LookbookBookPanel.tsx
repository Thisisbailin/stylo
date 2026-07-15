import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CaretLeft,
  CaretRight,
  FileText,
  Image as ImageIcon,
  MusicNotes,
  VideoCamera,
} from "@phosphor-icons/react";
import type { ProjectData } from "../../types";
import type { NodeFlowNode } from "../types";
import { getVisibleLookbookMemberNodes } from "../../utils/lookbookIdentities";

type Props = {
  projectData: ProjectData;
  identityNodeId: string;
  onClose: () => void;
};

type Spread =
  | { kind: "cover" }
  | { kind: "content"; nodes: NodeFlowNode[]; offset: number }
  | { kind: "back" };

const readString = (node: NodeFlowNode, ...keys: string[]) => {
  for (const key of keys) {
    const value = node.data?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

const getNodeTitle = (node: NodeFlowNode) =>
  readString(node, "title", "filename", "label") || "未命名节点";

const buildSpreads = (nodes: NodeFlowNode[]): Spread[] => {
  const spreads: Spread[] = [{ kind: "cover" }];
  for (let offset = 0; offset < nodes.length; offset += 2) {
    spreads.push({ kind: "content", nodes: nodes.slice(offset, offset + 2), offset });
  }
  if (nodes.length) spreads.push({ kind: "back" });
  return spreads;
};

export const LookbookContentPage: React.FC<{ node: NodeFlowNode; pageNumber: number }> = ({ node, pageNumber }) => {
  const title = getNodeTitle(node);
  const number = String(pageNumber).padStart(2, "0");

  if (node.type === "imageInput") {
    const src = readString(node, "image");
    return (
      <article className="lookbook-leaf lookbook-leaf--image">
        <div className="lookbook-leaf__folio">({number})</div>
        {src ? <img src={src} alt={title} /> : <div className="lookbook-leaf__empty"><ImageIcon size={28} /><span>图片节点为空</span></div>}
        <footer><span>{title}</span><span>IMAGE</span></footer>
      </article>
    );
  }

  if (node.type === "videoInput") {
    const src = readString(node, "video");
    return (
      <article className="lookbook-leaf lookbook-leaf--media">
        <div className="lookbook-leaf__folio">({number})</div>
        <div className="lookbook-leaf__media-frame">
          {src ? <video src={src} controls preload="metadata" /> : <div className="lookbook-leaf__empty"><VideoCamera size={30} /><span>视频节点为空</span></div>}
        </div>
        <h2>{title}</h2>
        <footer><span>FLOW MOTION</span><span>VIDEO</span></footer>
      </article>
    );
  }

  if (node.type === "audioInput") {
    const src = readString(node, "audio");
    return (
      <article className="lookbook-leaf lookbook-leaf--audio">
        <div className="lookbook-leaf__folio">({number})</div>
        <MusicNotes size={28} weight="light" />
        <div>
          <span className="lookbook-leaf__eyebrow">SOUND REFERENCE</span>
          <h2>{title}</h2>
        </div>
        {src ? <audio src={src} controls preload="metadata" /> : <p>音频节点尚未写入内容。</p>}
        <footer><span>STYLO AUDIO</span><span>AUDIO</span></footer>
      </article>
    );
  }

  const content = readString(node, "content", "text");
  return (
    <article className="lookbook-leaf lookbook-leaf--document">
      <div className="lookbook-leaf__folio">({number})</div>
      <div className="lookbook-leaf__document-heading">
        <FileText size={16} />
        <span>ARCHIVE NOTE</span>
      </div>
      <h2>{title}</h2>
      <pre>{content || "这份档案尚未写入内容。"}</pre>
      <footer><span>IDENTITY RECORD</span><span>TEXT</span></footer>
    </article>
  );
};

export const LookbookBookPanel: React.FC<Props> = ({ projectData, identityNodeId, onClose }) => {
  const [pageState, setPageState] = useState({ index: 0, direction: 1 });
  const identityNode = useMemo(
    () => projectData.flow?.flowNodes?.find((node) => node.id === identityNodeId && (node.type === "lookbook" || node.type === "identityCard")),
    [identityNodeId, projectData.flow?.flowNodes]
  );
  const identityId = typeof identityNode?.data?.identityId === "string" ? identityNode.data.identityId : "";
  const identity = useMemo(
    () => (projectData.roles || []).find((role) => role.id === identityId),
    [identityId, projectData.roles]
  );
  const contentNodes = useMemo(
    () => getVisibleLookbookMemberNodes(projectData, identityNodeId),
    [identityNodeId, projectData]
  );
  const spreads = useMemo(() => buildSpreads(contentNodes), [contentNodes]);
  const activeSpread = spreads[Math.min(pageState.index, spreads.length - 1)] || spreads[0];
  const coverImage = contentNodes.find((node) => node.type === "imageInput");
  const coverImageUrl = coverImage ? readString(coverImage, "image") : "";

  const goTo = useCallback((nextIndex: number) => {
    setPageState((current) => {
      const bounded = Math.max(0, Math.min(spreads.length - 1, nextIndex));
      if (bounded === current.index) return current;
      return { index: bounded, direction: bounded > current.index ? 1 : -1 };
    });
  }, [spreads.length]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") goTo(pageState.index + 1);
      if (event.key === "ArrowLeft") goTo(pageState.index - 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goTo, onClose, pageState.index]);

  useEffect(() => {
    if (pageState.index < spreads.length) return;
    setPageState({ index: Math.max(0, spreads.length - 1), direction: -1 });
  }, [pageState.index, spreads.length]);

  if (!identityNode || !identity || !activeSpread) {
    return (
      <section className="lookbook-book" role="dialog" aria-modal="true" aria-label="Lookbook 无法打开">
        <div className="lookbook-book__missing"><p>身份索引已失去绑定。</p><button type="button" onClick={onClose}>返回 Flow</button></div>
      </section>
    );
  }

  const name = identity.displayName || identity.name;
  const issue = String((projectData.roles || []).findIndex((role) => role.id === identity.id) + 1).padStart(2, "0");

  return (
    <section className="lookbook-book" role="dialog" aria-modal="true" aria-label={`${name} Lookbook`}>
      <header className="lookbook-book__header">
        <button type="button" onClick={onClose}><ArrowLeft size={17} weight="bold" /><span>返回 Flow</span></button>
        <span>STYLO / LOOKBOOK {issue}</span>
        <span>{identity.kind === "person" ? "CHARACTER" : "SCENE"} IDENTITY</span>
      </header>

      <main className="lookbook-book__desk">
        <button
          type="button"
          className="lookbook-book__turn lookbook-book__turn--previous"
          aria-label="上一页"
          disabled={pageState.index === 0}
          onClick={() => goTo(pageState.index - 1)}
        ><CaretLeft size={22} /></button>

        <div className={`lookbook-book__stage is-${activeSpread.kind}`}>
          <AnimatePresence mode="wait" custom={pageState.direction}>
            <motion.div
              key={`${activeSpread.kind}-${pageState.index}`}
              className={`lookbook-book__motion is-${activeSpread.kind}`}
              custom={pageState.direction}
              initial={{ opacity: 0, rotateY: pageState.direction > 0 ? -10 : 10, x: pageState.direction > 0 ? 34 : -34 }}
              animate={{ opacity: 1, rotateY: 0, x: 0 }}
              exit={{ opacity: 0, rotateY: pageState.direction > 0 ? 10 : -10, x: pageState.direction > 0 ? -34 : 34 }}
              transition={{ type: "spring", stiffness: 150, damping: 23, mass: 0.82 }}
            >
              {activeSpread.kind === "cover" ? (
                <article className="lookbook-book__cover">
                  <div className="lookbook-book__cover-number">({issue})</div>
                  <h1>{name}</h1>
                  {coverImageUrl ? <img src={coverImageUrl} alt={`${name} Lookbook 封面`} /> : null}
                  <div className="lookbook-book__cover-meta">
                    <span>@{identity.mention}</span>
                    <span>{identity.kind === "person" ? "CHARACTER STUDY" : "SCENE STUDY"}</span>
                    <span>STYLO ARCHIVE</span>
                  </div>
                </article>
              ) : activeSpread.kind === "back" ? (
                <article className="lookbook-book__back-cover">
                  <span>STYLO</span>
                  <div><strong>{name}</strong><small>@{identity.mention}</small></div>
                  <span>END / {issue}</span>
                </article>
              ) : (
                <div className={`lookbook-book__spread ${activeSpread.nodes.length === 1 ? "has-single-page" : ""}`}>
                  {activeSpread.nodes.map((node, index) => (
                    <LookbookContentPage key={node.id} node={node} pageNumber={activeSpread.offset + index + 1} />
                  ))}
                  {activeSpread.nodes.length === 1 ? <div className="lookbook-leaf lookbook-leaf--blank" aria-hidden="true" /> : null}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          className="lookbook-book__turn lookbook-book__turn--next"
          aria-label="下一页"
          disabled={pageState.index === spreads.length - 1}
          onClick={() => goTo(pageState.index + 1)}
        ><CaretRight size={22} /></button>
      </main>

      {spreads.length > 1 ? (
        <footer className="lookbook-book__pagination">
          <span>{String(pageState.index + 1).padStart(2, "0")}</span>
          <div>{spreads.map((spread, index) => <button key={`${spread.kind}-${index}`} type="button" aria-label={`前往第 ${index + 1} 页`} data-active={index === pageState.index} onClick={() => goTo(index)} />)}</div>
          <span>{String(spreads.length).padStart(2, "0")}</span>
        </footer>
      ) : <footer className="lookbook-book__pagination is-empty"><span>封面</span><span>连接节点后生成内页</span></footer>}
    </section>
  );
};
