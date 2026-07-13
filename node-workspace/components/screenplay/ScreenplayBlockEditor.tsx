import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowBendDownRight,
  BracketsRound,
  ChatCenteredText,
  EyeSlash,
  FilmSlate,
  ListBullets,
  MusicNotes,
  NoteBlank,
  Plus,
  Quotes,
  TextAlignCenter,
  TextT,
  User,
} from "@phosphor-icons/react";
import {
  getNextScreenplayLineKind,
  insertScreenplayLine,
  parseSceneHeading,
  removeScreenplayLine,
  replaceScreenplayLine,
  SCENE_BOUNDARIES,
  SCENE_TIMES,
  SCREENPLAY_FORMAT_LABELS,
  SCREENPLAY_FORMAT_SHORTCUTS,
  SCREENPLAY_LINE_KINDS,
  serializeSceneHeading,
  serializeScreenplayLine,
  type ScreenplayLine,
  type ScreenplayLineKind,
} from "../../screenplay/fountainEngine";

type SelectionPayload = {
  text: string;
  start: number;
  end: number;
  lineIndex: number;
};

type Props = {
  body: string;
  lines: ScreenplayLine[];
  activeLineIndex: number;
  navigationRequest: { lineIndex: number; id: number } | null;
  readOnly?: boolean;
  characterSuggestions: string[];
  locationSuggestions: string[];
  onChange: (body: string) => void;
  onActiveLineChange: (lineIndex: number) => void;
  onSelectionChange?: (selection: SelectionPayload | null) => void;
};

const KIND_ICONS: Record<ScreenplayLineKind, React.ComponentType<{ size?: number; weight?: "regular" | "bold" }>> = {
  action: TextT,
  scene_heading: FilmSlate,
  character: User,
  dual_dialogue: Quotes,
  dialogue: ChatCenteredText,
  parenthetical: BracketsRound,
  lyric: MusicNotes,
  transition: ArrowBendDownRight,
  centered: TextAlignCenter,
  note: NoteBlank,
  boneyard: EyeSlash,
  section: ListBullets,
  synopsis: ListBullets,
  page_break: ListBullets,
};

const PRIMARY_KINDS: ScreenplayLineKind[] = [
  "action",
  "scene_heading",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
];

const SECONDARY_KINDS = SCREENPLAY_LINE_KINDS.filter((kind) => !PRIMARY_KINDS.includes(kind));

const getContentOffset = (line: ScreenplayLine) => {
  if (!line.content) return 0;
  const offset = line.raw.indexOf(line.content);
  return offset >= 0 ? offset : 0;
};

type RowProps = {
  line: ScreenplayLine;
  isActive: boolean;
  readOnly: boolean;
  registerEditor: (lineIndex: number, element: HTMLTextAreaElement | HTMLInputElement | null) => void;
  requestFocus: (lineIndex: number, position?: "start" | "end") => void;
  onReplaceLine: (lineIndex: number, raw: string) => void;
  onInsertAfter: (lineIndex: number, raw: string) => void;
  onRemoveLine: (lineIndex: number) => void;
  onActive: (lineIndex: number) => void;
  onSelectionChange?: (selection: SelectionPayload | null) => void;
};

const ScreenplayBlockRow = memo(({
  line,
  isActive,
  readOnly,
  registerEditor,
  requestFocus,
  onReplaceLine,
  onInsertAfter,
  onRemoveLine,
  onActive,
  onSelectionChange,
}: RowProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const KindIcon = KIND_ICONS[line.kind];
  const scene = line.kind === "scene_heading" ? parseSceneHeading(line.raw) : null;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(34, textarea.scrollHeight)}px`;
  }, [line.content]);

  const assignEditor = (element: HTMLTextAreaElement | null) => {
    textareaRef.current = element;
    registerEditor(line.index, element);
  };

  const changeKind = (kind: ScreenplayLineKind) => {
    const nextRaw = kind === "scene_heading"
      ? serializeSceneHeading({ boundary: "INT.", location: line.content, time: "DAY" })
      : serializeScreenplayLine(line.content, kind);
    onReplaceLine(line.index, nextRaw);
    setFormatMenuOpen(false);
    requestFocus(line.index, "end");
  };

  const insertNextLine = () => {
    const nextKind = getNextScreenplayLineKind(line.kind);
    const nextRaw = nextKind === "dialogue" ? "" : serializeScreenplayLine("", nextKind);
    onInsertAfter(line.index, nextRaw);
    requestFocus(line.index + 1, "start");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && /^[1-6]$/.test(event.key)) {
      event.preventDefault();
      changeKind(PRIMARY_KINDS[Number(event.key) - 1]);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      insertNextLine();
      return;
    }
    if (event.key === "Backspace" && !line.content && event.currentTarget.selectionStart === 0 && line.index > 0) {
      event.preventDefault();
      onRemoveLine(line.index);
      requestFocus(line.index - 1, "end");
      return;
    }
    if (event.key === "ArrowUp" && event.currentTarget.selectionStart === 0 && line.index > 0) {
      event.preventDefault();
      requestFocus(line.index - 1, "end");
    }
    if (event.key === "ArrowDown" && event.currentTarget.selectionStart === line.content.length) {
      event.preventDefault();
      requestFocus(line.index + 1, "start");
    }
  };

  const publishSelection = (target: HTMLTextAreaElement) => {
    const start = target.selectionStart || 0;
    const end = target.selectionEnd || start;
    if (end <= start) {
      onSelectionChange?.(null);
      return;
    }
    const contentOffset = getContentOffset(line);
    onSelectionChange?.({
      text: target.value.slice(start, end),
      start: line.start + contentOffset + start,
      end: line.start + contentOffset + end,
      lineIndex: line.index,
    });
  };

  return (
    <div
      id={`screenplay-line-${line.index}`}
      className={`screenplay-block screenplay-block--${line.kind} ${isActive ? "is-active" : ""}`}
      data-line={line.index + 1}
      onMouseDown={() => onActive(line.index)}
    >
      <div className="screenplay-block__gutter">
        <span className="screenplay-block__line-number">{String(line.index + 1).padStart(3, "0")}</span>
        <button
          type="button"
          className="screenplay-block__kind-button"
          onClick={() => setFormatMenuOpen((open) => !open)}
          aria-label={`当前格式：${SCREENPLAY_FORMAT_LABELS[line.kind]}`}
          aria-expanded={formatMenuOpen}
          disabled={readOnly}
        >
          <KindIcon size={15} weight={isActive ? "bold" : "regular"} />
        </button>
        {formatMenuOpen ? (
          <div className="screenplay-block__format-menu" role="menu">
            <div className="screenplay-block__format-group">
              {PRIMARY_KINDS.map((kind) => {
                const Icon = KIND_ICONS[kind];
                return (
                  <button key={kind} type="button" onClick={() => changeKind(kind)} className={line.kind === kind ? "is-active" : ""}>
                    <Icon size={14} />
                    <span>{SCREENPLAY_FORMAT_LABELS[kind]}</span>
                    <kbd>{SCREENPLAY_FORMAT_SHORTCUTS[kind]}</kbd>
                  </button>
                );
              })}
            </div>
            <div className="screenplay-block__format-group is-secondary">
              {SECONDARY_KINDS.map((kind) => (
                <button key={kind} type="button" onClick={() => changeKind(kind)} className={line.kind === kind ? "is-active" : ""}>
                  <span>{SCREENPLAY_FORMAT_LABELS[kind]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="screenplay-block__content">
        {scene ? (
          <div className="screenplay-scene-heading" aria-label="场景标题">
            <label>
              <span>内外景</span>
              <select
                value={scene.boundary}
                onFocus={() => onActive(line.index)}
                onChange={(event) => onReplaceLine(line.index, serializeSceneHeading({ ...scene, boundary: event.target.value }))}
                disabled={readOnly}
              >
                {SCENE_BOUNDARIES.map((boundary) => <option key={boundary} value={boundary}>{boundary}</option>)}
              </select>
            </label>
            <label className="is-location">
              <span>地点</span>
              <input
                ref={(element) => registerEditor(line.index, element)}
                value={scene.location}
                list="screenplay-location-options"
                onFocus={() => onActive(line.index)}
                onChange={(event) => onReplaceLine(line.index, serializeSceneHeading({ ...scene, location: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    insertNextLine();
                  }
                }}
                disabled={readOnly}
                aria-label="场景地点"
              />
            </label>
            <label>
              <span>时间</span>
              <select
                value={scene.time}
                onFocus={() => onActive(line.index)}
                onChange={(event) => onReplaceLine(line.index, serializeSceneHeading({ ...scene, time: event.target.value }))}
                disabled={readOnly}
              >
                {SCENE_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </label>
          </div>
        ) : line.kind === "page_break" ? (
          <button type="button" className="screenplay-page-break" onClick={insertNextLine} disabled={readOnly}>
            <span>分页</span>
            <Plus size={14} />
          </button>
        ) : (
          <textarea
            ref={assignEditor}
            value={line.content}
            rows={1}
            readOnly={readOnly}
            spellCheck={line.kind !== "character" && line.kind !== "transition"}
            placeholder={line.kind === "action" ? "描述镜头中能够看到或听到的内容…" : `${SCREENPLAY_FORMAT_LABELS[line.kind]}内容`}
            aria-label={`第 ${line.index + 1} 行，${SCREENPLAY_FORMAT_LABELS[line.kind]}`}
            onFocus={() => onActive(line.index)}
            onChange={(event) => onReplaceLine(line.index, serializeScreenplayLine(event.target.value, line.kind))}
            onKeyDown={handleKeyDown}
            onSelect={(event) => publishSelection(event.currentTarget)}
            onMouseUp={(event) => publishSelection(event.currentTarget)}
          />
        )}
        {isActive && line.kind !== "page_break" ? (
          <span className="screenplay-block__active-label">{SCREENPLAY_FORMAT_LABELS[line.kind]}</span>
        ) : null}
      </div>
    </div>
  );
}, (previous, next) =>
  previous.line.index === next.line.index &&
  previous.line.raw === next.line.raw &&
  previous.line.kind === next.line.kind &&
  previous.line.start === next.line.start &&
  previous.line.end === next.line.end &&
  previous.isActive === next.isActive &&
  previous.readOnly === next.readOnly
);

ScreenplayBlockRow.displayName = "ScreenplayBlockRow";

export const ScreenplayBlockEditor: React.FC<Props> = ({
  body,
  lines,
  activeLineIndex,
  navigationRequest,
  readOnly = false,
  characterSuggestions,
  locationSuggestions,
  onChange,
  onActiveLineChange,
  onSelectionChange,
}) => {
  const editorsRef = useRef(new Map<number, HTMLTextAreaElement | HTMLInputElement>());
  const pendingFocusRef = useRef<{ lineIndex: number; position: "start" | "end" } | null>(null);
  const bodyRef = useRef(body);
  const lineCountRef = useRef(lines.length);
  bodyRef.current = body;
  lineCountRef.current = lines.length;

  const registerEditor = useCallback((lineIndex: number, element: HTMLTextAreaElement | HTMLInputElement | null) => {
    if (element) editorsRef.current.set(lineIndex, element);
    else editorsRef.current.delete(lineIndex);
  }, []);

  const replaceLine = useCallback((lineIndex: number, raw: string) => {
    onChange(replaceScreenplayLine(bodyRef.current, lineIndex, raw));
  }, [onChange]);

  const insertAfter = useCallback((lineIndex: number, raw: string) => {
    onChange(insertScreenplayLine(bodyRef.current, lineIndex, raw));
  }, [onChange]);

  const removeLine = useCallback((lineIndex: number) => {
    onChange(removeScreenplayLine(bodyRef.current, lineIndex));
  }, [onChange]);

  const focusLine = useCallback((lineIndex: number, position: "start" | "end" = "start") => {
    const safeIndex = Math.min(lineCountRef.current - 1, Math.max(0, lineIndex));
    pendingFocusRef.current = { lineIndex: safeIndex, position };
    onActiveLineChange(safeIndex);
    requestAnimationFrame(() => {
      const editor = editorsRef.current.get(safeIndex);
      if (!editor) return;
      editor.focus();
      const cursor = position === "end" ? editor.value.length : 0;
      editor.setSelectionRange(cursor, cursor);
      editor.scrollIntoView({ block: "center", behavior: "smooth" });
      pendingFocusRef.current = null;
    });
  }, [onActiveLineChange]);

  useEffect(() => {
    if (!navigationRequest) return;
    focusLine(navigationRequest.lineIndex, "start");
  // The request is intentionally edge-triggered by its id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationRequest?.id]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const editor = editorsRef.current.get(pending.lineIndex);
    if (!editor) return;
    editor.focus();
    const cursor = pending.position === "end" ? editor.value.length : 0;
    editor.setSelectionRange(cursor, cursor);
    pendingFocusRef.current = null;
  }, [lines.length]);

  const uniqueCharacters = useMemo(() => Array.from(new Set(characterSuggestions)), [characterSuggestions]);
  const uniqueLocations = useMemo(() => Array.from(new Set(locationSuggestions)), [locationSuggestions]);

  return (
    <div className="screenplay-block-editor" role="textbox" aria-multiline="true" aria-label="可视化剧本编辑器">
      <datalist id="screenplay-character-options">
        {uniqueCharacters.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="screenplay-location-options">
        {uniqueLocations.map((name) => <option key={name} value={name} />)}
      </datalist>
      {lines.map((line) => (
        <ScreenplayBlockRow
          key={`${line.index}-${line.kind}`}
          line={line}
          isActive={activeLineIndex === line.index}
          readOnly={readOnly}
          registerEditor={registerEditor}
          requestFocus={focusLine}
          onReplaceLine={replaceLine}
          onInsertAfter={insertAfter}
          onRemoveLine={removeLine}
          onActive={onActiveLineChange}
          onSelectionChange={onSelectionChange}
        />
      ))}
      {!lines.length ? (
        <button type="button" className="screenplay-empty-editor" onClick={() => onChange(serializeSceneHeading({ boundary: "INT.", location: "LOCATION", time: "DAY" }))}>
          <FilmSlate size={24} />
          <strong>写下第一个场景</strong>
          <span>无需记忆 Fountain 标记，从地点和时间开始。</span>
        </button>
      ) : null}
    </div>
  );
};
