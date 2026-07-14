import type { FlowState, ProjectData } from "../types";
import type { NodeFlowNode } from "../node-workspace/types";

const INLINE_MEDIA_PREFIXES = ["data:", "blob:"] as const;
const LOCAL_MEDIA_REFS_KEY = "localMediaRefs";

type PathSegment = string | number;

export type LocalMediaRef = {
  path: string;
  availability: "local-only";
  mimeType?: string;
  fileName?: string;
  byteLength?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isInlineMedia = (value: unknown): value is string =>
  typeof value === "string" && INLINE_MEDIA_PREFIXES.some((prefix) => value.startsWith(prefix));

const encodePointerSegment = (segment: PathSegment) =>
  String(segment).replace(/~/g, "~0").replace(/\//g, "~1");

const decodePointerSegment = (segment: string) =>
  segment.replace(/~1/g, "/").replace(/~0/g, "~");

const toPointer = (path: PathSegment[]) => `/${path.map(encodePointerSegment).join("/")}`;

const fromPointer = (pointer: string): PathSegment[] => {
  if (!pointer.startsWith("/")) return [];
  return pointer
    .slice(1)
    .split("/")
    .map(decodePointerSegment)
    .map((segment) => (/^(0|[1-9]\d*)$/.test(segment) ? Number(segment) : segment));
};

const inlineMediaMetadata = (
  value: string,
  path: PathSegment[],
  data: Record<string, unknown>
): LocalMediaRef => {
  const dataUrlMatch = value.match(/^data:([^;,]+)?(;base64)?,/i);
  const payloadStart = value.indexOf(",") + 1;
  const payloadLength = payloadStart > 0 ? Math.max(0, value.length - payloadStart) : 0;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const byteLength = dataUrlMatch?.[2]
    ? Math.max(0, Math.floor((payloadLength * 3) / 4) - padding)
    : payloadLength || undefined;
  const fileName = typeof data.filename === "string" && data.filename.trim()
    ? data.filename.trim().slice(0, 256)
    : undefined;
  return {
    path: toPointer(path),
    availability: "local-only",
    ...(dataUrlMatch?.[1] ? { mimeType: dataUrlMatch[1].slice(0, 120) } : {}),
    ...(fileName ? { fileName } : {}),
    ...(byteLength ? { byteLength } : {}),
  };
};

const projectNodeDataForCloud = (data: Record<string, unknown>) => {
  const refsByPath = new Map<string, LocalMediaRef>();
  const existingRefs = Array.isArray(data[LOCAL_MEDIA_REFS_KEY])
    ? data[LOCAL_MEDIA_REFS_KEY] as unknown[]
    : [];
  existingRefs.forEach((candidate) => {
    if (!isRecord(candidate) || typeof candidate.path !== "string") return;
    refsByPath.set(candidate.path, candidate as LocalMediaRef);
  });

  const visit = (value: unknown, path: PathSegment[]): { value: unknown; changed: boolean } => {
    if (isInlineMedia(value)) {
      const ref = inlineMediaMetadata(value, path, data);
      refsByPath.set(ref.path, ref);
      return { value: null, changed: true };
    }
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item, index) => {
        const result = visit(item, [...path, index]);
        changed ||= result.changed;
        return result.value;
      });
      return { value: changed ? next : value, changed };
    }
    if (!isRecord(value)) return { value, changed: false };

    let changed = false;
    const next: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, item]) => {
      if (path.length === 0 && key === LOCAL_MEDIA_REFS_KEY) {
        next[key] = item;
        return;
      }
      const result = visit(item, [...path, key]);
      changed ||= result.changed;
      next[key] = result.value;
    });
    return { value: changed ? next : value, changed };
  };

  const projected = visit(data, []);
  if (!projected.changed) return data;
  return {
    ...(projected.value as Record<string, unknown>),
    [LOCAL_MEDIA_REFS_KEY]: Array.from(refsByPath.values()),
  };
};

const projectNodeForCloud = (node: NodeFlowNode): NodeFlowNode => {
  const data = projectNodeDataForCloud(node.data as Record<string, unknown>);
  return data === node.data ? node : { ...node, data: data as NodeFlowNode["data"] };
};

const projectFlowForCloud = (flow: FlowState | undefined): FlowState | undefined => {
  if (!flow?.flowNodes?.length) return flow;
  let changed = false;
  const flowNodes = flow.flowNodes.map((node) => {
    const projected = projectNodeForCloud(node);
    changed ||= projected !== node;
    return projected;
  });
  return changed ? { ...flow, flowNodes } : flow;
};

/**
 * Builds the metadata-only cloud representation. Binary media remains in the
 * local project/package and is represented remotely by localMediaRefs.
 */
export const toCloudProjectData = (data: ProjectData): ProjectData => {
  const hasFlowProjects = Boolean(data.flowProjects?.length);
  const flowProjects = data.flowProjects?.map((project) => {
    const flow = projectFlowForCloud(project.flow);
    return flow === project.flow ? project : { ...project, flow: flow as FlowState };
  });
  return {
    ...data,
    flow: hasFlowProjects ? undefined : projectFlowForCloud(data.flow),
    flowProjects,
  };
};

const collectNodesById = (data: ProjectData) => {
  const nodes = new Map<string, NodeFlowNode>();
  data.flow?.flowNodes?.forEach((node) => nodes.set(node.id, node));
  data.flowProjects?.forEach((project) => {
    project.flow.flowNodes?.forEach((node) => nodes.set(node.id, node));
  });
  return nodes;
};

const readAtPath = (root: unknown, path: PathSegment[]) => {
  let current = root;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") {
      current = current[segment];
      continue;
    }
    if (isRecord(current) && typeof segment === "string") {
      current = current[segment];
      continue;
    }
    return undefined;
  }
  return current;
};

const writeAtPath = (root: Record<string, unknown>, path: PathSegment[], value: unknown) => {
  if (!path.length) return root;
  const cloneContainer = (container: unknown) =>
    Array.isArray(container) ? [...container] : isRecord(container) ? { ...container } : {};
  const output = cloneContainer(root) as Record<string, unknown>;
  let source: unknown = root;
  let target: any = output;
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      target[segment] = value;
      return;
    }
    const nextSource = Array.isArray(source) && typeof segment === "number"
      ? source[segment]
      : isRecord(source) && typeof segment === "string"
        ? source[segment]
        : undefined;
    const nextTarget = cloneContainer(nextSource);
    target[segment] = nextTarget;
    source = nextSource;
    target = nextTarget;
  });
  return output;
};

const restoreNodeLocalMedia = (remoteNode: NodeFlowNode, localNode: NodeFlowNode | undefined) => {
  if (!localNode) return remoteNode;
  const remoteData = remoteNode.data as Record<string, unknown>;
  const localData = localNode.data as Record<string, unknown>;
  const refs = Array.isArray(remoteData[LOCAL_MEDIA_REFS_KEY])
    ? remoteData[LOCAL_MEDIA_REFS_KEY] as unknown[]
    : [];
  let nextData = remoteData;
  refs.forEach((candidate) => {
    if (!isRecord(candidate) || typeof candidate.path !== "string") return;
    const path = fromPointer(candidate.path);
    if (!path.length || readAtPath(nextData, path) != null) return;
    const localValue = readAtPath(localData, path);
    if (!isInlineMedia(localValue)) return;
    nextData = writeAtPath(nextData, path, localValue);
  });
  return nextData === remoteData
    ? remoteNode
    : { ...remoteNode, data: nextData as NodeFlowNode["data"] };
};

export const restoreLocalNodeMedia = (
  remoteNodes: NodeFlowNode[],
  localNodes: NodeFlowNode[]
) => {
  const localById = new Map(localNodes.map((node) => [node.id, node]));
  return remoteNodes.map((node) => restoreNodeLocalMedia(node, localById.get(node.id)));
};

/** Preserves local media bytes when cloud metadata wins a sync conflict. */
export const restoreLocalProjectMedia = (remote: ProjectData, local: ProjectData): ProjectData => {
  const localNodes = collectNodesById(local);
  const restoreFlow = (flow: FlowState | undefined) => {
    if (!flow?.flowNodes?.length) return flow;
    let changed = false;
    const flowNodes = flow.flowNodes.map((node) => {
      const restored = restoreNodeLocalMedia(node, localNodes.get(node.id));
      changed ||= restored !== node;
      return restored;
    });
    return changed ? { ...flow, flowNodes } : flow;
  };
  const flow = restoreFlow(remote.flow);
  const flowProjects = remote.flowProjects?.map((project) => {
    const nextFlow = restoreFlow(project.flow);
    return nextFlow === project.flow ? project : { ...project, flow: nextFlow as FlowState };
  });
  const flowProjectsUnchanged = !remote.flowProjects ||
    flowProjects?.every((project, index) => project === remote.flowProjects?.[index]);
  return flow === remote.flow && flowProjectsUnchanged
    ? remote
    : { ...remote, flow, flowProjects };
};

export const hasInlineProjectMedia = (data: Pick<ProjectData, "flow" | "flowProjects">) => {
  const stack: unknown[] = [];
  data.flow?.flowNodes?.forEach((node) => stack.push(node.data));
  data.flowProjects?.forEach((project) => {
    project.flow.flowNodes?.forEach((node) => stack.push(node.data));
  });
  const seen = new Set<unknown>();
  while (stack.length) {
    const value = stack.pop();
    if (isInlineMedia(value)) return true;
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) stack.push(...value);
    else stack.push(...Object.values(value as Record<string, unknown>));
  }
  return false;
};
