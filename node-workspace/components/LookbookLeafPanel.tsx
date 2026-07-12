import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { ProjectData } from "../../types";
import type { NodeFlowNode } from "../types";
import { getVisibleLookbookMemberNodes } from "../../utils/lookbookIdentities";
import { LookbookContentPage } from "./LookbookBookPanel";

type Props = {
  projectData: ProjectData;
  identityNodeId: string;
  onClose: () => void;
};

type BookPage =
  | { kind: "cover" }
  | { kind: "content"; node: NodeFlowNode; pageNumber: number }
  | { kind: "back" };

type TurnDirection = -1 | 0 | 1;

const readString = (node: NodeFlowNode, key: string) => {
  const value = node.data?.[key];
  return typeof value === "string" ? value : "";
};

const LeafPage: React.FC<{
  page: BookPage | null;
  name: string;
  mention: string;
  issue: string;
  identityKind: "person" | "scene";
  coverImageUrl: string;
  blank?: boolean;
}> = ({ page, name, mention, issue, identityKind, coverImageUrl, blank }) => {
  if (!page || blank) return <div className="lookbook-leaf lookbook-leaf--blank" aria-hidden="true" />;
  if (page.kind === "content") return <LookbookContentPage node={page.node} pageNumber={page.pageNumber} />;
  if (page.kind === "back") {
    return (
      <article className="lookbook-book__back-cover">
        <span>QALAM</span>
        <div><strong>{name}</strong><small>@{mention}</small></div>
        <span>END / {issue}</span>
      </article>
    );
  }
  return (
    <article className="lookbook-book__cover">
      <div className="lookbook-book__cover-number">({issue})</div>
      <h1>{name}</h1>
      {coverImageUrl ? <img src={coverImageUrl} alt={`${name} Lookbook 封面`} /> : null}
      <div className="lookbook-book__cover-meta">
        <span>@{mention}</span>
        <span>{identityKind === "person" ? "CHARACTER STUDY" : "SCENE STUDY"}</span>
        <span>QALAM ARCHIVE</span>
      </div>
    </article>
  );
};

export const LookbookLeafPanel: React.FC<Props> = ({ projectData, identityNodeId, onClose }) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [turnDirection, setTurnDirection] = useState<TurnDirection>(0);
  const identityNode = useMemo(
    () => projectData.flow?.flowNodes?.find((node) => node.id === identityNodeId && node.type === "identityCard"),
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
  const pages = useMemo<BookPage[]>(() => {
    const result: BookPage[] = [
      { kind: "cover" },
      ...contentNodes.map((node, index): BookPage => ({ kind: "content", node, pageNumber: index + 1 })),
    ];
    if (contentNodes.length) result.push({ kind: "back" });
    return result;
  }, [contentNodes]);
  const coverImageNode = contentNodes.find((node) => node.type === "imageInput");
  const coverImageUrl = coverImageNode ? readString(coverImageNode, "image") : "";
  const canTurnBackward = pageIndex > 0 && turnDirection === 0;
  const canTurnForward = pageIndex < pages.length - 1 && turnDirection === 0;

  const beginTurn = useCallback((direction: -1 | 1) => {
    setTurnDirection((current) => {
      if (current !== 0) return current;
      if (direction > 0 && pageIndex >= pages.length - 1) return 0;
      if (direction < 0 && pageIndex <= 0) return 0;
      return direction;
    });
  }, [pageIndex, pages.length]);

  const finishTurn = useCallback(() => {
    setPageIndex((current) => Math.max(0, Math.min(pages.length - 1, current + turnDirection)));
    setTurnDirection(0);
  }, [pages.length, turnDirection]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") beginTurn(1);
      if (event.key === "ArrowLeft") beginTurn(-1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [beginTurn, onClose]);

  useEffect(() => {
    if (pageIndex < pages.length) return;
    setPageIndex(Math.max(0, pages.length - 1));
  }, [pageIndex, pages.length]);

  if (!identityNode || !identity) {
    return (
      <section className="lookbook-book" role="dialog" aria-modal="true" aria-label="Lookbook 无法打开">
        <div className="lookbook-book__missing"><p>身份索引已失去绑定。</p><button type="button" onClick={onClose}>返回 Flow</button></div>
      </section>
    );
  }

  const name = identity.displayName || identity.name;
  const issue = String((projectData.roles || []).findIndex((role) => role.id === identity.id) + 1).padStart(2, "0");
  const targetIndex = turnDirection === 0 ? pageIndex : pageIndex + turnDirection;
  const steadyIndex = turnDirection === 0 ? pageIndex : targetIndex;
  const leftPage = turnDirection > 0
    ? (pageIndex >= 2 ? pages[pageIndex - 1] : null)
    : (steadyIndex >= 2 ? pages[steadyIndex - 1] : null);
  const rightPage = turnDirection > 0 ? pages[targetIndex] : turnDirection < 0 ? pages[pageIndex] : pages[pageIndex];
  const turningPage = turnDirection > 0 ? pages[pageIndex] : turnDirection < 0 ? pages[targetIndex] : null;
  const leafProps = { name, mention: identity.mention, issue, identityKind: identity.kind, coverImageUrl };

  return (
    <section className="lookbook-book" role="dialog" aria-modal="true" aria-label={`${name} Lookbook`}>
      <header className="lookbook-book__header">
        <button type="button" onClick={onClose}><ArrowLeft size={17} weight="bold" /><span>返回 Flow</span></button>
        <span>QALAM / LOOKBOOK {issue}</span>
        <span>{identity.kind === "person" ? "CHARACTER" : "SCENE"} IDENTITY</span>
      </header>

      <main className="lookbook-book__desk">
        <button type="button" className="lookbook-book__turn" aria-label="上一页" disabled={!canTurnBackward} onClick={() => beginTurn(-1)}><CaretLeft size={22} /></button>

        <div className={`lookbook-leaf-book ${pageIndex === 0 && turnDirection === 0 ? "is-closed" : ""}`}>
          <div className="lookbook-leaf-book__left">
            <LeafPage page={leftPage} {...leafProps} blank={!leftPage} />
          </div>
          <div className="lookbook-leaf-book__right">
            <LeafPage page={rightPage} {...leafProps} />
          </div>

          {turningPage ? (
            <motion.div
              key={`turn-${pageIndex}-${turnDirection}`}
              className="lookbook-leaf-book__turning"
              initial={{ rotateY: turnDirection > 0 ? 0 : -180 }}
              animate={{ rotateY: turnDirection > 0 ? -180 : 0 }}
              transition={{
                duration: 0.48,
                ease: [0.22, 1, 0.36, 1],
              }}
              onAnimationComplete={finishTurn}
            >
              <div className="lookbook-leaf-book__face lookbook-leaf-book__face--front"><LeafPage page={turningPage} {...leafProps} /></div>
              <div className="lookbook-leaf-book__face lookbook-leaf-book__face--back"><LeafPage page={turningPage.kind === "cover" ? null : turningPage} {...leafProps} blank={turningPage.kind === "cover"} /></div>
            </motion.div>
          ) : null}
        </div>

        <button type="button" className="lookbook-book__turn" aria-label="下一页" disabled={!canTurnForward} onClick={() => beginTurn(1)}><CaretRight size={22} /></button>
      </main>

      {pages.length > 1 ? (
        <footer className="lookbook-book__pagination">
          <span>{String(pageIndex + 1).padStart(2, "0")}</span>
          <div>{pages.map((page, index) => <span key={`${page.kind}-${index}`} data-active={index === pageIndex} />)}</div>
          <span>{String(pages.length).padStart(2, "0")}</span>
        </footer>
      ) : <footer className="lookbook-book__pagination is-empty"><span>封面</span><span>连接节点后生成内页</span></footer>}
    </section>
  );
};
