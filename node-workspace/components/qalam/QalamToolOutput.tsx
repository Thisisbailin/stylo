import React from "react";
import type { ToolPayload } from "./types";

const qalamSecondaryTextClass =
  "text-[14px] leading-6 text-[var(--app-text-secondary)] md:text-[12px] md:leading-relaxed";

const renderArtifactMetaPill = (label: string, value?: string | null) => {
  if (!value) return null;
  return (
    <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2 py-0.5 text-[11px] text-[var(--app-text-secondary)]">
      {label} · {value}
    </span>
  );
};

const renderArtifactCard = (payload: Record<string, any>) => {
  const artifact =
    payload.artifact && typeof payload.artifact === "object"
      ? (payload.artifact as Record<string, any>)
      : null;
  if (!artifact || typeof artifact.kind !== "string") return null;

  const title =
    (typeof artifact.title === "string" && artifact.title.trim()) ||
    (typeof artifact.ref === "string" && artifact.ref.trim()) ||
    (typeof artifact.id === "string" && artifact.id.trim()) ||
    artifact.kind;
  const target =
    typeof artifact.target === "string"
      ? artifact.target
      : typeof payload.target === "string"
        ? payload.target
        : "";
  const nodeKind =
    typeof artifact.node_kind === "string"
      ? artifact.node_kind
      : typeof artifact.node_type === "string"
        ? artifact.node_type
        : undefined;

  const source = artifact.source && typeof artifact.source === "object" ? artifact.source : null;
  const destination =
    artifact.destination && typeof artifact.destination === "object" ? artifact.destination : null;

  const sourceLabel =
    source &&
    (source.title || source.node_ref || source.node_id || source.ref || source.id);
  const destinationLabel =
    destination &&
    (destination.title || destination.node_ref || destination.node_id || destination.ref || destination.id);

  const typeLabel =
    artifact.kind === "node"
      ? "Node"
      : artifact.kind === "link"
        ? "Link"
        : artifact.kind === "map"
          ? "Map"
          : artifact.kind === "package"
            ? "Package"
            : artifact.kind === "approval"
              ? "Approval"
              : artifact.kind;

  return (
    <div className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
            {typeLabel}
          </div>
          <div className="mt-1 truncate text-[14px] font-medium text-[var(--app-text-primary)]">
            {title}
          </div>
        </div>
        {target ? (
          <div className="shrink-0 rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
            {target}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {renderArtifactMetaPill("ID", typeof artifact.id === "string" ? artifact.id : undefined)}
        {renderArtifactMetaPill("REF", typeof artifact.ref === "string" ? artifact.ref : undefined)}
        {renderArtifactMetaPill("KIND", nodeKind)}
      </div>
      {artifact.kind === "link" && (sourceLabel || destinationLabel) ? (
        <div className="mt-3 rounded-[14px] border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-[12px] text-[var(--app-text-secondary)]">
          <span className="text-[var(--app-text-primary)]">{String(sourceLabel || "source")}</span>
          <span className="mx-2 text-[var(--app-text-muted)]">→</span>
          <span className="text-[var(--app-text-primary)]">{String(destinationLabel || "target")}</span>
        </div>
      ) : null}
    </div>
  );
};

export const renderQalamToolOutput = (tool: ToolPayload) => {
  if (!tool.output) return null;
  let parsed: any = null;
  try {
    parsed = JSON.parse(tool.output);
  } catch {
    parsed = tool.output;
  }

  if (!parsed || typeof parsed === "string") {
    return (
      <div className={`whitespace-pre-wrap ${qalamSecondaryTextClass}`}>
        {String(parsed || "")}
      </div>
    );
  }

  const payload =
    parsed && typeof parsed === "object" && parsed.output && typeof parsed.output === "object"
      ? parsed.output
      : parsed;

  const artifactCard = renderArtifactCard(payload);

  const simpleFields: Array<{ label: string; value: string }> = [];
  if (typeof payload.target === "string") simpleFields.push({ label: "目标", value: payload.target });
  if (typeof payload.layer === "string") simpleFields.push({ label: "层", value: payload.layer });
  if (typeof payload.entity === "string") simpleFields.push({ label: "实体", value: payload.entity });
  if (typeof payload.view === "string") simpleFields.push({ label: "视图", value: payload.view });
  if (typeof payload.action === "string") simpleFields.push({ label: "动作", value: payload.action });
  if (typeof payload.role === "string") simpleFields.push({ label: "关系角色", value: payload.role });
  if (typeof payload.found === "boolean") simpleFields.push({ label: "命中", value: payload.found ? "是" : "否" });
  if (payload.artifact && typeof payload.artifact === "object") {
    if (typeof payload.artifact.kind === "string") simpleFields.push({ label: "载荷", value: payload.artifact.kind });
    if (typeof payload.artifact.id === "string") simpleFields.push({ label: "载荷 ID", value: payload.artifact.id });
    if (typeof payload.artifact.ref === "string") simpleFields.push({ label: "载荷引用", value: payload.artifact.ref });
    if (typeof payload.artifact.title === "string") simpleFields.push({ label: "载荷标题", value: payload.artifact.title });
  }
  if (typeof payload.created === "boolean") simpleFields.push({ label: "写入动作", value: payload.created ? "已创建" : "已更新" });
  if (typeof payload.name === "string") simpleFields.push({ label: "名称", value: payload.name });
  if (typeof payload.workflow_title === "string") simpleFields.push({ label: "工作流", value: payload.workflow_title });
  if (typeof payload.episode_label === "string") simpleFields.push({ label: "剧集", value: payload.episode_label });
  if (typeof payload.episode_id === "number") simpleFields.push({ label: "集数", value: `第${payload.episode_id}集` });
  if (typeof payload.scene_id === "string") simpleFields.push({ label: "场景", value: payload.scene_id });
  if (typeof payload.scene_title === "string") simpleFields.push({ label: "场景标题", value: payload.scene_title });
  if (typeof payload.field === "string") simpleFields.push({ label: "写入字段", value: payload.field });
  if (typeof payload.chars === "number") simpleFields.push({ label: "字数", value: String(payload.chars) });
  if (typeof payload.nodeId === "string") simpleFields.push({ label: "节点 ID", value: payload.nodeId });
  if (typeof payload.nodeType === "string") simpleFields.push({ label: "节点类型", value: payload.nodeType });
  if (typeof payload.nodeRef === "string") simpleFields.push({ label: "节点引用", value: payload.nodeRef });
  if (typeof payload.defaultOutputHandle === "string") simpleFields.push({ label: "默认尾端端口", value: payload.defaultOutputHandle });
  if (Array.isArray(payload.defaultInputHandles) && payload.defaultInputHandles.length > 0) {
    simpleFields.push({ label: "默认首端端口", value: payload.defaultInputHandles.join(", ") });
  }
  if (typeof payload.node_id === "string") simpleFields.push({ label: "节点 ID", value: payload.node_id });
  if (typeof payload.node_kind === "string") simpleFields.push({ label: "节点类型", value: payload.node_kind });
  if (typeof payload.node_ref === "string") simpleFields.push({ label: "节点引用", value: payload.node_ref });
  if (typeof payload.default_output_handle === "string") simpleFields.push({ label: "默认尾端端口", value: payload.default_output_handle });
  if (Array.isArray(payload.default_input_handles) && payload.default_input_handles.length > 0) {
    simpleFields.push({ label: "默认首端端口", value: payload.default_input_handles.join(", ") });
  }
  if (typeof payload.linkId === "string") simpleFields.push({ label: "连线 ID", value: payload.linkId });
  if (typeof payload.sourceNodeId === "string") simpleFields.push({ label: "尾端节点", value: payload.sourceNodeId });
  if (typeof payload.targetNodeId === "string") simpleFields.push({ label: "首端节点", value: payload.targetNodeId });
  if (typeof payload.sourceRef === "string") simpleFields.push({ label: "尾端引用", value: payload.sourceRef });
  if (typeof payload.targetRef === "string") simpleFields.push({ label: "首端引用", value: payload.targetRef });
  if (typeof payload.sourceHandle === "string") simpleFields.push({ label: "尾端端口", value: payload.sourceHandle });
  if (typeof payload.targetHandle === "string") simpleFields.push({ label: "首端端口", value: payload.targetHandle });
  if (typeof payload.group_id === "string") simpleFields.push({ label: "分组节点", value: payload.group_id });
  if (typeof payload.text_node_id === "string") simpleFields.push({ label: "文本节点", value: payload.text_node_id });
  if (typeof payload.image_node_id === "string") simpleFields.push({ label: "图像节点", value: payload.image_node_id });
  if (typeof payload.edge_id === "string") simpleFields.push({ label: "连线 ID", value: payload.edge_id });
  if (typeof payload.source_node_id === "string") simpleFields.push({ label: "尾端节点", value: payload.source_node_id });
  if (typeof payload.target_node_id === "string") simpleFields.push({ label: "首端节点", value: payload.target_node_id });
  if (typeof payload.source_ref === "string") simpleFields.push({ label: "尾端引用", value: payload.source_ref });
  if (typeof payload.target_ref === "string") simpleFields.push({ label: "首端引用", value: payload.target_ref });
  if (typeof payload.source_handle === "string") simpleFields.push({ label: "尾端端口", value: payload.source_handle });
  if (typeof payload.target_handle === "string") simpleFields.push({ label: "首端端口", value: payload.target_handle });
  if (typeof payload.edge_count === "number") simpleFields.push({ label: "连线数", value: String(payload.edge_count) });
  if (typeof payload.aspect_ratio === "string") simpleFields.push({ label: "画幅", value: payload.aspect_ratio });

  if (
    typeof payload.content === "string" ||
    typeof payload.summary === "string" ||
    typeof payload.bio === "string" ||
    typeof payload.description === "string" ||
    typeof payload.visuals === "string" ||
    simpleFields.length > 0
  ) {
    return (
      <div className="space-y-2">
        {artifactCard}
        {simpleFields.length > 0 ? (
          <dl className="grid gap-x-4 gap-y-1 text-[12px] text-[var(--app-text-secondary)] sm:grid-cols-2">
            {simpleFields.map((item) => (
              <div key={`${item.label}-${item.value}`} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">{item.label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-[var(--app-text-primary)]">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {typeof payload.summary === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">摘要</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.summary}</div>
          </div>
        ) : null}
        {typeof payload.bio === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">角色分析</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.bio}</div>
          </div>
        ) : null}
        {typeof payload.description === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">场景描述</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.description}</div>
          </div>
        ) : null}
        {typeof payload.visuals === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">视觉说明</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.visuals}</div>
          </div>
        ) : null}
        {typeof payload.content === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">正文</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.content}</div>
          </div>
        ) : null}
      </div>
    );
  }

  const data = payload.data || {};
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const sceneList = Array.isArray(data.sceneList) ? data.sceneList : [];
  const episodeCharacters = Array.isArray(data.episodeCharacters) ? data.episodeCharacters : [];
  const characterList = Array.isArray(data.characters) ? data.characters : [];
  const locationList = Array.isArray(data.locations) ? data.locations : [];

  const renderSection = (title: string, content: React.ReactNode) => (
    <div className="border-l border-[var(--app-border)] pl-3 space-y-1">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">{title}</div>
      {content}
    </div>
  );

  const blocks: React.ReactNode[] = [];

  if (warnings.length > 0) {
    blocks.push(
      renderSection(
        "Warnings",
        <ul className="text-[11px] text-[var(--app-text-secondary)] list-disc pl-4 space-y-1">
          {warnings.map((w: string, idx: number) => (
            <li key={`${idx}-${w}`}>{w}</li>
          ))}
        </ul>
      )
    );
  }

  if (matches.length > 0) {
    blocks.push(
      renderSection(
        "Matches",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-2">
          {matches.map((m: any, idx: number) => (
            <li key={`${idx}-${m.sceneId || m.episodeId || "m"}`} className="space-y-1">
              <div className="text-[11px] text-[var(--app-text-muted)]">
                {m.episodeId ? `Ep ${m.episodeId}` : ""}
                {m.episodeTitle ? ` · ${m.episodeTitle}` : ""}
                {m.sceneId ? ` · Scene ${m.sceneId}` : ""}
                {m.sceneTitle ? ` · ${m.sceneTitle}` : ""}
                {m.characterName ? ` · ${m.characterName}` : ""}
                {m.locationName ? ` · ${m.locationName}` : ""}
                {m.scope ? ` · ${m.scope}` : ""}
              </div>
              {m.snippet ? (
                <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{m.snippet}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )
    );
  }

  if (data.sceneContent) {
    blocks.push(
      renderSection(
        "Scene Content",
        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{data.sceneContent}</div>
      )
    );
  }
  if (data.episodeContent) {
    blocks.push(
      renderSection(
        "Episode Content",
        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{data.episodeContent}</div>
      )
    );
  }
  if (episodeCharacters.length > 0) {
    blocks.push(
      renderSection(
        "Episode Characters",
        <div className="text-[12px] text-[var(--app-text-secondary)]">{episodeCharacters.join(", ")}</div>
      )
    );
  }
  if (sceneList.length > 0) {
    blocks.push(
      renderSection(
        "Scene List",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          {sceneList.map((sc: any) => (
            <li key={`${sc.id}-${sc.title}`}>
              <span className="text-[11px] text-[var(--app-text-muted)]">{sc.id}</span> {sc.title}
            </li>
          ))}
        </ul>
      )
    );
  }
  if (characterList.length > 0) {
    blocks.push(
      renderSection(
        "Characters",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          {characterList.map((c: any) => (
            <li key={`${c.id || c.name}-${c.name}`}>
              <span className="text-[11px] text-[var(--app-text-muted)]">{c.name}</span>
              {c.role ? ` · ${c.role}` : ""}
              {typeof c.isMain === "boolean" ? ` · ${c.isMain ? "Main" : "Side"}` : ""}
            </li>
          ))}
        </ul>
      )
    );
  }
  if (locationList.length > 0) {
    blocks.push(
      renderSection(
        "Locations",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          {locationList.map((loc: any) => (
            <li key={`${loc.id || loc.name}-${loc.name}`}>
              <span className="text-[11px] text-[var(--app-text-muted)]">{loc.name}</span>
              {loc.type ? ` · ${loc.type}` : ""}
            </li>
          ))}
        </ul>
      )
    );
  }
  if (data.character) {
    const c = data.character;
    blocks.push(
      renderSection(
        "Character",
        <div className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          <div className="font-semibold text-[var(--app-text-primary)]">{c.name}</div>
          {c.role ? <div>Role: {c.role}</div> : null}
          {typeof c.isMain === "boolean" ? <div>Main: {c.isMain ? "Yes" : "No"}</div> : null}
          {c.tags?.length ? <div>Tags: {c.tags.join(", ")}</div> : null}
          {c.bio ? <div className="whitespace-pre-wrap">{c.bio}</div> : null}
          {Array.isArray(c.forms) && c.forms.length > 0 ? (
            <div className="text-[11px] text-[var(--app-text-muted)]">Portrait Slots: {c.forms.length}</div>
          ) : null}
        </div>
      )
    );
  }
  if (data.location) {
    const loc = data.location;
    blocks.push(
      renderSection(
        "Location",
        <div className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          <div className="font-semibold text-[var(--app-text-primary)]">{loc.name}</div>
          {loc.type ? <div>Type: {loc.type}</div> : null}
          {loc.description ? <div className="whitespace-pre-wrap">{loc.description}</div> : null}
          {Array.isArray(loc.zones) && loc.zones.length > 0 ? (
            <div className="text-[11px] text-[var(--app-text-muted)]">Portrait Slots: {loc.zones.length}</div>
          ) : null}
        </div>
      )
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="space-y-2">
        {artifactCard}
        <pre className="text-[11px] text-[var(--app-text-secondary)] whitespace-pre-wrap">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      </div>
    );
  }

  return <div className="space-y-2">{artifactCard}{blocks}</div>;
};

