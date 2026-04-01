import { listBuiltinSkills } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { toNodeFlowLinkRecord, toNodeFlowMapView } from "../../node-workspace/nodeflow/model";

export const LIST_PROJECT_RESOURCE_TYPES = [
  "skill_packages",
  "episodes",
  "understanding_project",
  "understanding_episodes",
  "understanding_characters",
  "understanding_scenes",
  "understanding_guides",
  "workflow_overview",
  "workflow_nodes",
  "workflow_connections",
] as const;

const listProjectResourcesParameters = {
  type: "object",
  properties: {
    resource_type: {
      type: "string",
      enum: [
        ...LIST_PROJECT_RESOURCE_TYPES,
      ],
      description: "Which resource directory to inspect.",
    },
    max_items: {
      type: "integer",
      description: "Optional maximum number of items to return for list results.",
    },
  },
  additionalProperties: false,
  required: ["resource_type"],
} as const;

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

type ResourceType = (typeof LIST_PROJECT_RESOURCE_TYPES)[number];

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("list_project_resources 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const resourceType = typeof raw.resource_type === "string" ? raw.resource_type.trim() : "";
  const maxItems = toPositiveInteger(raw.max_items ?? raw.maxItems);
  if (!resourceType) {
    throw new Error("list_project_resources 需要 resource_type。");
  }
  if (
    !(LIST_PROJECT_RESOURCE_TYPES as readonly string[]).includes(resourceType)
  ) {
    throw new Error(`list_project_resources 不支持 resource_type=${resourceType}`);
  }
  return {
    resourceType: resourceType as ResourceType,
    maxItems: Math.max(1, Math.min(200, maxItems || 50)),
  };
};

export const listProjectResourcesToolDef = {
  name: "list_project_resources",
  description:
    "List available resource directories before reading them. Supports skill packages, scripts, understanding assets, and workflow structure.",
  parameters: listProjectResourcesParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const data = bridge.getProjectData();
    const workflow = bridge.getNodeFlowSnapshot();
    const roles = data.context?.roles || [];
    const characters = roles.filter((role) => role.kind === "person");
    const scenes = roles.filter((role) => role.kind === "scene");

    if (args.resourceType === "skill_packages") {
      const items = listBuiltinSkills().slice(0, args.maxItems).map((skill) => ({
        item_id: skill.id,
        title: skill.title,
        description: skill.description,
        tags: skill.tags || [],
        version: skill.version || "",
      }));
      return {
        resource_type: "skill_packages",
        total: listBuiltinSkills().length,
        items,
      };
    }

    if (args.resourceType === "episodes") {
      const items = (data.episodes || []).slice(0, args.maxItems).map((episode) => ({
        episode_id: episode.id,
        label: episode.title || `第${episode.id}集`,
        scene_count: (episode.scenes || []).length,
        shot_count: (episode.shots || []).length,
        has_summary: Boolean((episode.summary || "").trim() || data.context?.episodeSummaries?.some((entry) => entry.episodeId === episode.id && entry.summary?.trim())),
      }));
      return {
        resource_type: "episodes",
        total: (data.episodes || []).length,
        items,
      };
    }

    if (args.resourceType === "understanding_project") {
      const summary = (data.context?.projectSummary || "").trim();
      return {
        resource_type: "understanding_project",
        exists: Boolean(summary),
        chars: summary.length,
        character_count: characters.length,
        scene_count: scenes.length,
        episode_summary_count: (data.context?.episodeSummaries || []).filter((item) => item.summary?.trim()).length,
      };
    }

    if (args.resourceType === "understanding_episodes") {
      const items = (data.episodes || []).slice(0, args.maxItems).map((episode) => {
        const summary =
          (data.context?.episodeSummaries || []).find((entry) => entry.episodeId === episode.id)?.summary ||
          episode.summary ||
          "";
        return {
          episode_id: episode.id,
          label: episode.title || `第${episode.id}集`,
          has_summary: Boolean(summary.trim()),
          chars: summary.trim().length,
        };
      });
      return {
        resource_type: "understanding_episodes",
        total: (data.episodes || []).length,
        items,
      };
    }

    if (args.resourceType === "understanding_characters") {
      const items = characters.slice(0, args.maxItems).map((role) => {
        return {
          id: role.id,
          name: role.name,
          role: role.summary || "",
          is_main: Boolean(role.isMain),
          portraits_count: (role.portraits || []).length,
          has_bio: Boolean((role.description || "").trim()),
        };
      });
      return {
        resource_type: "understanding_characters",
        total: characters.length,
        items,
      };
    }

    if (args.resourceType === "understanding_guides") {
      const items = [
        { item_id: "globalStyleGuide", title: "Style Guide", text: data.globalStyleGuide || "" },
        { item_id: "shotGuide", title: "Shot Guide", text: data.shotGuide || "" },
        { item_id: "soraGuide", title: "Sora Guide", text: data.soraGuide || "" },
        { item_id: "storyboardGuide", title: "Storyboard Guide", text: data.storyboardGuide || "" },
        { item_id: "dramaGuide", title: "Drama Guide", text: data.dramaGuide || "" },
      ]
        .filter((item) => item.text.trim().length > 0)
        .slice(0, args.maxItems)
        .map((item) => ({
          item_id: item.item_id,
          title: item.title,
          chars: item.text.trim().length,
        }));
      return {
        resource_type: "understanding_guides",
        total: items.length,
        items,
      };
    }

    if (args.resourceType === "workflow_overview") {
      const map = toNodeFlowMapView(workflow);
      return {
        resource_type: "workflow_overview",
        name: map.name,
        revision: map.revision,
        node_count: map.nodes.length,
        link_count: map.links.length,
        edge_count: map.links.length,
        viewport: map.viewport,
        active_view: map.activeView,
      };
    }

    if (args.resourceType === "workflow_nodes") {
      const map = toNodeFlowMapView(workflow);
      const items = map.nodes.slice(0, args.maxItems).map((node) => ({
        node_id: node.id,
        node_ref: node.ref,
        node_type: node.kind,
        node_kind: node.kind,
        title: node.title || node.id,
        parent_id: node.parentId || null,
        position: { x: node.x, y: node.y },
        inputs: node.inputs,
        outputs: node.outputs,
      }));
      return {
        resource_type: "workflow_nodes",
        total: map.nodes.length,
        items,
      };
    }

    if (args.resourceType === "workflow_connections") {
      const map = toNodeFlowMapView(workflow);
      const items = workflow.links.slice(0, args.maxItems).map((edge) => {
        const link = toNodeFlowLinkRecord(edge);
        return {
          edge_id: link.id,
          link_id: link.id,
          source_node_id: link.fromNodeId,
          target_node_id: link.toNodeId,
          from_node_id: link.fromNodeId,
          to_node_id: link.toNodeId,
          source_handle: link.fromPort,
          target_handle: link.toPort,
          from_port: link.fromPort,
          to_port: link.toPort,
          paused: link.paused,
        };
      });
      return {
        resource_type: "workflow_connections",
        total: map.links.length,
        link_total: map.links.length,
        items,
      };
    }

    const items = scenes.slice(0, args.maxItems).map((role) => {
      return {
        id: role.id,
        name: role.name,
        type: role.isCore ? "core" : "secondary",
        portraits_count: (role.portraits || []).length,
        has_description: Boolean((role.description || "").trim()),
        has_visuals: Boolean((role.visualTags || "").trim()),
      };
    });
    return {
      resource_type: "understanding_scenes",
      total: scenes.length,
      items,
    };
  },
  summarize: (output: any) => {
    if (output?.resource_type === "skill_packages") {
      return `已列出内部 skill 包，共 ${output?.total ?? 0} 项`;
    }
    if (output?.resource_type === "episodes") {
      return `已列出剧本目录，共 ${output?.total ?? 0} 集`;
    }
    if (output?.resource_type === "understanding_project") {
      return output?.exists ? "已检查项目理解总览：已存在" : "已检查项目理解总览：尚未写入";
    }
    if (output?.resource_type === "understanding_episodes") {
      return `已列出分集理解目录，共 ${output?.total ?? 0} 项`;
    }
    if (output?.resource_type === "understanding_characters") {
      return `已列出角色理解目录，共 ${output?.total ?? 0} 项`;
    }
    if (output?.resource_type === "understanding_guides") {
      return `已列出理解指南目录，共 ${output?.total ?? 0} 项`;
    }
    if (output?.resource_type === "workflow_overview") {
      return `已读取工作流总览，共 ${output?.node_count ?? 0} 个节点 / ${output?.edge_count ?? 0} 条连线`;
    }
    if (output?.resource_type === "workflow_nodes") {
      return `已列出工作流节点目录，共 ${output?.total ?? 0} 项`;
    }
    if (output?.resource_type === "workflow_connections") {
      return `已列出工作流连线目录，共 ${output?.total ?? 0} 项`;
    }
    return `已列出场景理解目录，共 ${output?.total ?? 0} 项`;
  },
};
