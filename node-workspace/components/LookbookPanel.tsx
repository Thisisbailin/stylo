import React, { useEffect, useMemo } from "react";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  MapPin,
  MusicNotes,
  Play,
  User,
  VideoCamera,
} from "@phosphor-icons/react";
import type { ProjectData } from "../../types";
import type { NodeFlowNode } from "../types";
import { getPrimaryPortrait } from "../../utils/projectRoles";
import { getLookbookMemberNodes } from "../../utils/lookbookIdentities";

type Props = {
  projectData: ProjectData;
  identityNodeId: string;
  onClose: () => void;
};

const readString = (node: NodeFlowNode, ...keys: string[]) => {
  for (const key of keys) {
    const value = node.data?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

const nodeTitle = (node: NodeFlowNode) =>
  readString(node, "title", "filename", "label") || "未命名素材";

export const LookbookPanel: React.FC<Props> = ({ projectData, identityNodeId, onClose }) => {
  const identityNode = useMemo(
    () => projectData.flow?.flowNodes?.find((node) => node.id === identityNodeId && (node.type === "lookbook" || node.type === "identityCard")),
    [identityNodeId, projectData.flow?.flowNodes]
  );
  const identityId = typeof identityNode?.data?.identityId === "string" ? identityNode.data.identityId : "";
  const identity = useMemo(
    () => (projectData.roles || []).find((role) => role.id === identityId),
    [identityId, projectData.roles]
  );
  const members = useMemo(
    () => getLookbookMemberNodes(projectData, identityNodeId),
    [identityNodeId, projectData]
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!identityNode || !identity) {
    return (
      <section className="lookbook-overlay" role="dialog" aria-modal="true" aria-label="Lookbook 无法打开">
        <div className="lookbook-missing">
          <p>身份索引已失去绑定，无法打开 Lookbook。</p>
          <button type="button" onClick={onClose}>返回 Flow</button>
        </div>
      </section>
    );
  }

  const documents = members.filter((node) => node.type === "mdText" || node.type === "text");
  const images = members.filter((node) => node.type === "imageInput");
  const audios = members.filter((node) => node.type === "audioInput");
  const videos = members.filter((node) => node.type === "videoInput");
  const primaryPortrait = getPrimaryPortrait(identity);
  const connectedCover = images.map((node) => readString(node, "image")).find(Boolean);
  const cover = primaryPortrait?.imageUrl || identity.avatarUrl || connectedCover;
  const typeLabel = identity.kind === "person" ? "CHARACTER" : "SCENE";
  const issueNumber = String((projectData.roles || []).findIndex((role) => role.id === identity.id) + 1).padStart(2, "0");

  return (
    <section className="lookbook-overlay" role="dialog" aria-modal="true" aria-label={`${identity.name} Lookbook`}>
      <header className="lookbook-header">
        <button type="button" className="lookbook-back" onClick={onClose}>
          <ArrowLeft size={17} weight="bold" />
          <span>返回 Flow</span>
        </button>
        <div className="lookbook-wordmark">STYLO LOOKBOOK</div>
        <div className="lookbook-issue">ISSUE {issueNumber} / {typeLabel}</div>
      </header>

      <main className="lookbook-scroll">
        <section className="lookbook-cover">
          <div className="lookbook-cover-copy">
            <div className="lookbook-kicker">
              {identity.kind === "person" ? <User size={15} /> : <MapPin size={15} />}
              <span>{typeLabel} IDENTITY</span>
            </div>
            <h1>{identity.displayName || identity.name}</h1>
            <div className="lookbook-mention">@{identity.mention}</div>
            <p>{identity.summary || identity.description || "尚未写入身份摘要。"}</p>
            <dl className="lookbook-facts">
              <div><dt>状态</dt><dd>{identity.status || "draft"}</dd></div>
              <div><dt>档案</dt><dd>{documents.length}</dd></div>
              <div><dt>视觉</dt><dd>{images.length + (identity.portraits?.length || 0)}</dd></div>
              <div><dt>动态 / 声音</dt><dd>{videos.length + audios.length}</dd></div>
            </dl>
          </div>
          <div className={`lookbook-cover-visual ${cover ? "has-cover" : "is-empty"}`}>
            {cover ? <img src={cover} alt={`${identity.name} 主视觉`} /> : (
              <div className="lookbook-cover-placeholder">
                {identity.kind === "person" ? <User size={44} /> : <MapPin size={44} />}
                <span>等待主视觉</span>
              </div>
            )}
            <div className="lookbook-cover-caption">
              <span>01</span>
              <span>{identity.kind === "person" ? "PRIMARY LOOK" : "ESTABLISHING VIEW"}</span>
            </div>
          </div>
        </section>

        <section className="lookbook-section lookbook-section--documents">
          <div className="lookbook-section-head">
            <div><span>RECORD / 02</span><h2>档案与索引</h2></div>
            <p>这些文档仍是 Flow 中的普通节点；Lookbook 只提供身份边界内的连续阅读。</p>
          </div>
          {documents.length ? (
            <div className="lookbook-document-list">
              {documents.map((node, index) => {
                const content = readString(node, "content", "text");
                const isIndex = node.data?.lookbookRole === "index";
                return (
                  <article key={node.id} className={`lookbook-document ${isIndex ? "is-index" : ""}`}>
                    <div className="lookbook-document-meta">
                      <FileText size={17} />
                      <span>{isIndex ? "LOOKBOOK INDEX" : `ARCHIVE ${String(index + 1).padStart(2, "0")}`}</span>
                    </div>
                    <h3>{nodeTitle(node)}</h3>
                    <pre>{content || "这份档案尚未写入内容。"}</pre>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="lookbook-empty"><FileText size={24} /><p>在 Flow 中将 Markdown 文本连接到 Lookbook，它会出现在这里。</p></div>
          )}
        </section>

        <section className="lookbook-section">
          <div className="lookbook-section-head">
            <div><span>VISUAL / 03</span><h2>{identity.kind === "person" ? "造型序列" : "空间序列"}</h2></div>
            <p>节点连接决定收录范围，原始图片仍保存在各自的媒体节点中。</p>
          </div>
          {images.length || identity.portraits?.length ? (
            <div className="lookbook-image-grid">
              {(identity.portraits || []).filter((portrait) => portrait.imageUrl).map((portrait, index) => (
                <figure key={portrait.id} className={index % 3 === 0 ? "is-wide" : ""}>
                  <img src={portrait.imageUrl} alt={`${identity.name} ${portrait.name}`} />
                  <figcaption><span>{portrait.name}</span><span>@{portrait.mention}</span></figcaption>
                </figure>
              ))}
              {images.map((node, index) => {
                const src = readString(node, "image");
                return (
                  <figure key={node.id} className={(index + (identity.portraits?.length || 0)) % 3 === 0 ? "is-wide" : ""}>
                    {src ? <img src={src} alt={nodeTitle(node)} /> : <div className="lookbook-media-placeholder"><ImageIcon size={28} /></div>}
                    <figcaption><span>{nodeTitle(node)}</span><span>FLOW IMAGE</span></figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <div className="lookbook-empty"><ImageIcon size={24} /><p>连接图片节点，建立这本视觉册的第一组画面。</p></div>
          )}
        </section>

        <section className="lookbook-section lookbook-section--motion">
          <div className="lookbook-section-head">
            <div><span>MOTION & SOUND / 04</span><h2>动态与声音</h2></div>
            <p>视频和声音参考在同一个身份包装边界内并列呈现。</p>
          </div>
          {videos.length || audios.length ? (
            <div className="lookbook-motion-grid">
              {videos.map((node) => {
                const src = readString(node, "video");
                return (
                  <article key={node.id} className="lookbook-motion-item">
                    <div className="lookbook-video-frame">
                      {src ? <video src={src} controls preload="metadata" /> : <VideoCamera size={32} />}
                      <span><Play size={13} weight="fill" /> VIDEO</span>
                    </div>
                    <h3>{nodeTitle(node)}</h3>
                  </article>
                );
              })}
              {audios.map((node) => {
                const src = readString(node, "audio");
                return (
                  <article key={node.id} className="lookbook-audio-item">
                    <div><MusicNotes size={22} /><span>AUDIO REFERENCE</span></div>
                    <h3>{nodeTitle(node)}</h3>
                    {src ? <audio src={src} controls preload="metadata" /> : <p>音频节点尚无内容。</p>}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="lookbook-empty"><MusicNotes size={24} /><p>把音频或视频节点连接到身份卡，即可在此集中审阅。</p></div>
          )}
        </section>

        <footer className="lookbook-footer">
          <span>STYLO / IDENTITY WRAPPER</span>
          <span>{identity.name} / @{identity.mention}</span>
        </footer>
      </main>
    </section>
  );
};
