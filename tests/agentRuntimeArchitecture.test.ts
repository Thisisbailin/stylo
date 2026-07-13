import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { performance } from "node:perf_hooks";
import { StyloMessageEventState } from "../agents/react/styloMessageState";
import {
  normalizeMessagesForDeepSeek,
  normalizeRequestForDeepSeek,
  normalizeResponseFromDeepSeek,
  normalizeStreamChunkFromDeepSeek,
} from "../agents/runtime/deepseekCompat";
import { AgentEventSequenceGuard, parseAgentStreamPacket } from "../agents/runtime/httpProtocol";
import { resolveAgentProvider, resolveApiMode } from "../agents/runtime/providerConfig";
import { createStyloProviderRuntime } from "../agents/runtime/providerRuntime";
import {
  compactAgentSessionItems,
  projectAgentItemsToSessionMessages,
} from "../agents/runtime/sessionProjection";
import { drainAgentSseBuffer } from "../agents/runtime/sseProtocol";
import { AgentMessageStreamProjector } from "../agents/runtime/streamProjector";
import { createStyloToolBudgetPolicy } from "../agents/runtime/toolBudget";
import { STYLO_TOOL_CATALOG, getStyloToolDescriptor } from "../agents/runtime/toolCatalog";
import { buildDisabledTools } from "../agents/runtime/toolPolicy";
import { normalizeStyloToolSettings } from "../agents/runtime/toolSettings";
import type { AgentRuntimeEvent, StyloRunResult } from "../agents/runtime/types";
import { buildStyloMessageTimeline } from "../node-workspace/components/stylo/messageTimeline";
import {
  STYLO_PRIMARY_MESSAGE_VISUALS,
  STYLO_TOOL_MESSAGE_VISUALS,
  resolveStyloToolMessageVisual,
} from "../node-workspace/components/stylo/messageVisualPolicy";
import { normalizeSafeExternalUrl } from "../node-workspace/components/stylo/safeExternalUrl";
import { resolveToolDisplayOutcome } from "../node-workspace/components/stylo/toolDisplayOutcome";
import {
  reconcileStaleAgentMessages,
  shouldRejectStaleAgentResult,
} from "../node-workspace/components/stylo/agentResultReconciliation";
import type { Message } from "../node-workspace/components/stylo/types";

const emptyResult = (projectId = "project-1"): StyloRunResult => ({
  projectId,
  sessionId: "session-1",
  finalText: "done",
  outputItems: [{ kind: "text", text: "done" }],
  toolCalls: [],
});

test("DeepSeek is the default Agent provider and uses Chat Completions mode", () => {
  assert.equal(resolveAgentProvider(undefined), "deepseek");
  assert.equal(resolveApiMode(resolveAgentProvider(undefined)), "chat_completions");
  assert.equal(resolveAgentProvider("qwen"), "qwen");
});

test("provider runtimes own isolated SDK clients and DeepSeek model settings", async () => {
  const config = {
    provider: "deepseek" as const,
    apiMode: "chat_completions" as const,
    model: "deepseek-test",
    apiKey: "test-key",
    baseUrl: "https://example.invalid",
    allowBrowserClient: false,
  };
  const first = createStyloProviderRuntime(config);
  const second = createStyloProviderRuntime(config);
  try {
    assert.notEqual(first.client, second.client);
    assert.notEqual(first.modelProvider, second.modelProvider);
    assert.equal(first.modelSettings.parallelToolCalls, false);
    assert.equal(first.modelSettings.reasoning?.effort, "high");
    assert.deepEqual(first.modelSettings.providerData?.thinking, { type: "enabled" });
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});

test("DeepSeek compatibility preserves reasoning across SDK assistant tool-call records", () => {
  const normalized = normalizeMessagesForDeepSeek([
    { role: "user", content: "inspect" },
    { role: "assistant", content: null, reasoning: "first thought" },
    {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call-1", type: "function", function: { name: "read_document", arguments: "{}" } }],
    },
  ]) as Array<Record<string, unknown>>;

  assert.equal(normalized.length, 2);
  assert.equal(normalized[1].reasoning_content, "first thought");
  assert.equal("reasoning" in normalized[1], false);

  const request = normalizeRequestForDeepSeek({ messages: normalized });
  assert.equal(request.reasoning_effort, "high");
  assert.deepEqual(request.thinking, { type: "enabled" });

  const response = normalizeResponseFromDeepSeek({
    choices: [{ message: { role: "assistant", reasoning_content: "response thought", content: "answer" } }],
  });
  assert.equal(response.choices[0].message.reasoning, "response thought");

  const chunk = normalizeStreamChunkFromDeepSeek({
    choices: [{ delta: { reasoning_content: "stream thought" } }],
  });
  assert.equal(chunk.choices[0].delta.reasoning, "stream thought");
});

test("tool metadata is unique and drives lookup, mutation, cache, and budget behavior", () => {
  const names = STYLO_TOOL_CATALOG.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(getStyloToolDescriptor("operate_foundation").category, "mutation");
  assert.equal(getStyloToolDescriptor("create_document").interaction, "edit");
  assert.equal(getStyloToolDescriptor("create_document").label, "创建文档");
  assert.equal(getStyloToolDescriptor("access_github_repository").capability, "external_read");

  const policy = createStyloToolBudgetPolicy();
  assert.equal(policy.reserve("access_github_repository", { owner: "stylo", repo: "app" }).allowed, true);
  const duplicate = policy.reserve("access_github_repository", { repo: "app", owner: "stylo" });
  assert.equal(duplicate.allowed, false);
  assert.match(duplicate.allowed ? "" : duplicate.reason, /Duplicate lookup blocked/);
  assert.equal(policy.reserve("operate_foundation", { action: "rename" }).allowed, true);
  const snapshot = policy.snapshot();
  assert.equal(snapshot.lookupCalls, 1);
  assert.equal(snapshot.mutationCalls, 1);
  assert.throws(() => getStyloToolDescriptor("unknown_tool"), /Unknown Stylo tool/);
});

test("every registered Agent tool has a distinct message icon and unknown tools degrade safely", () => {
  const catalogNames = STYLO_TOOL_CATALOG.map((tool) => tool.name).sort();
  const visualNames = Object.keys(STYLO_TOOL_MESSAGE_VISUALS).sort();
  const toolIcons = Object.values(STYLO_TOOL_MESSAGE_VISUALS).map((visual) => visual.icon);
  const primaryIcons = Object.values(STYLO_PRIMARY_MESSAGE_VISUALS).map((visual) => visual.icon);

  assert.deepEqual(visualNames, catalogNames);
  assert.equal(new Set(toolIcons).size, toolIcons.length);
  assert.equal(new Set(primaryIcons).size, primaryIcons.length);
  assert.equal(resolveStyloToolMessageVisual("unknown_tool").icon, "tool_generic");
});

test("Agent message rendering binds themed visual identities to every major message kind", () => {
  const source = readFileSync(
    "node-workspace/components/stylo/StyloChatContent.tsx",
    "utf8"
  );
  const iconSource = readFileSync(
    "node-workspace/components/stylo/StyloMessageIcon.tsx",
    "utf8"
  );

  for (const visualKey of ["user", "assistant", "thinking", "response", "work", "approval"] as const) {
    assert.match(source, new RegExp(`STYLO_PRIMARY_MESSAGE_VISUALS\\.${visualKey}`));
  }
  assert.match(source, /resolveStyloToolMessageVisual\(effectiveTool\.name\)/);
  assert.match(iconSource, /data-tone=\{visual\.tone\}/);
  assert.match(iconSource, /weight="duotone"/);
});

test("tool settings are normalized in runtime and disable complete capability groups", () => {
  const normalized = normalizeStyloToolSettings({
    projectData: { enabled: false },
    workflowBuilder: { enabled: false },
    runtimeIntelligence: { enabled: false },
  });
  assert.equal(normalized.projectData.enabled, false);
  assert.equal(normalized.workflowBuilder.enabled, false);
  assert.equal(normalized.runtimeIntelligence.webSearchEnabled, true);

  const disabled = new Set(buildDisabledTools({
    styloTools: {
      projectData: { enabled: false },
      workflowBuilder: { enabled: false },
      runtimeIntelligence: { enabled: false },
    },
  }, []));
  assert.equal(disabled.has("read_project_resource"), true);
  assert.equal(disabled.has("access_github_repository"), true);
  assert.equal(disabled.has("operate_foundation"), true);
  assert.equal(disabled.has("prepare_generation_execution"), true);
});

test("session compaction bounds text and removes incomplete tool transactions", () => {
  const longText = "x".repeat(3_000);
  const longSummary = "summary-".repeat(100);
  const items = [
    { role: "user", content: [{ type: "input_text", text: longText }] },
    { type: "reasoning", rawContent: [{ type: "reasoning_text", text: "inspect context" }] },
    { type: "function_call", callId: "complete", name: "read_document", arguments: "{}" },
    {
      type: "function_call_result",
      callId: "complete",
      name: "read_document",
      status: "completed",
      output: JSON.stringify({ status: "success", tool: "read_document", summary: longSummary }),
    },
    { type: "function_call", callId: "dangling", name: "read_document", arguments: "{}" },
  ] as any[];

  const compacted = compactAgentSessionItems(items, { maxItems: 10, textLimit: 80, toolOutputLimit: 120 }) as any[];
  assert.equal(compacted.some((item) => item.callId === "dangling"), false);
  assert.equal(compacted.some((item) => item.callId === "complete" && item.type === "function_call"), true);
  assert.ok(compacted[0].content[0].text.length <= 83);

  const projected = projectAgentItemsToSessionMessages(compacted as any, 100);
  assert.equal(projected.some((message) => message.role === "reasoning" && message.text === "inspect context"), true);
  const toolMessage = projected.find((message) => message.role === "tool");
  assert.ok(toolMessage);
  assert.ok(toolMessage.text.length <= 303);
});

test("SDK stream projection merges deltas and emits a single final completion", () => {
  const events: AgentRuntimeEvent[] = [];
  const projector = new AgentMessageStreamProjector("run-1", (event) => events.push(event));
  projector.consume({
    type: "raw_model_stream_event",
    data: { type: "model", event: { choices: [{ delta: { reasoning_content: "think" } }] } },
  } as any);
  projector.consume({ type: "raw_model_stream_event", data: { type: "output_text_delta", delta: "Hel" } } as any);
  projector.consume({
    type: "raw_model_stream_event",
    data: {
      type: "response_done",
      response: { output: [{ type: "message", content: [{ type: "output_text", text: "Hello" }] }] },
    },
  } as any);
  projector.finish();
  projector.finalize("Hello");

  assert.equal(events.filter((event) => event.type === "reasoning_delta").length, 1);
  const completed = events.filter((event) => event.type === "message_completed");
  assert.equal(completed.length, 1);
  assert.equal(completed[0].type === "message_completed" && completed[0].text, "Hello");
  assert.equal(completed[0].type === "message_completed" && completed[0].isFinal, true);
});

test("React message projection is idempotent for replayed terminal events and trips on distinct repeated failures", () => {
  const state = new StyloMessageEventState();
  let messages: Message[] = [];
  const apply = (event: AgentRuntimeEvent) => {
    const projected = state.apply(messages, event);
    messages = projected.messages;
    return projected;
  };
  apply({ type: "run_started", runId: "run-1", sessionId: "session-1", sequence: 1 });
  apply({ type: "message_delta", runId: "run-1", messageId: "message-1", delta: "Hi", accumulatedText: "Hi", sequence: 2 });
  const completedEvent: AgentRuntimeEvent = {
    type: "message_completed",
    runId: "run-1",
    messageId: "message-1",
    text: "Hi",
    isFinal: true,
    sequence: 3,
  };
  apply(completedEvent);
  apply(completedEvent);
  assert.equal(messages.filter((message) => message.kind === "chat" && message.role === "assistant").length, 1);

  const settledCall = { callId: "call-1", name: "read_document", status: "success" as const, summary: "read" };
  apply({ type: "tool_completed", runId: "run-1", call: settledCall, sequence: 4 });
  apply({ type: "tool_completed", runId: "run-1", call: settledCall, sequence: 4 });
  assert.equal(messages.filter((message) => message.kind === "tool_result" && message.tool.callId === "call-1").length, 1);

  let abortReason = "";
  for (let index = 0; index < 5; index += 1) {
    const failure = apply({
      type: "tool_failed",
      runId: "run-1",
      call: { callId: `failed-${index}`, name: "read_document", status: "error" },
      error: "failed",
      sequence: 5 + index,
    });
    abortReason = failure.abortReason || abortReason;
  }
  assert.match(abortReason, /连续失败 5 次/);
});

test("message timeline pairs tool transactions in O(n) projection order", () => {
  const messages: Message[] = [
    {
      role: "assistant",
      kind: "tool_result",
      order: 3,
      tool: { callId: "call-1", runId: "run-1", name: "read_document", status: "success" },
    },
    {
      role: "assistant",
      kind: "tool",
      order: 2,
      tool: { callId: "call-1", runId: "run-1", name: "read_document", status: "running" },
    },
    { role: "assistant", kind: "chat", order: 4, text: "done", meta: { runId: "run-1", isFinal: true } },
  ];
  const timeline = buildStyloMessageTimeline(messages);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].kind, "work");
  const tool = timeline[0].kind === "work"
    ? timeline[0].items.find((item) => item.kind === "tool")
    : undefined;
  assert.equal(tool?.kind === "tool" && tool.thread.request?.tool.callId, "call-1");
  assert.equal(tool?.kind === "tool" && tool.thread.result?.tool.callId, "call-1");
  assert.equal(timeline[0].kind === "work" && timeline[0].hasFinalAnswer, true);
});

test("message timeline collapses run work, removes redundant completion status, and preserves primary messages", () => {
  const messages: Message[] = [
    {
      role: "assistant",
      kind: "status",
      order: 1,
      statusCard: {
        id: "thinking-1",
        runId: "run-1",
        status: "success",
        headline: "思考",
        steps: [],
        startedAt: 100,
        updatedAt: 1_100,
        isThinking: true,
      },
    },
    {
      role: "assistant",
      kind: "tool_result",
      order: 2,
      tool: { callId: "call-1", runId: "run-1", name: "read_document", status: "success" },
    },
    {
      role: "assistant",
      kind: "chat",
      order: 3,
      text: "继续处理。",
      meta: { runId: "run-1", messageId: "progress-1", isFinal: false },
    },
    {
      role: "assistant",
      kind: "status",
      order: 3.5,
      statusCard: {
        id: "response-1",
        runId: "run-1",
        status: "success",
        headline: "本轮内容已生成",
        steps: [],
        startedAt: 1_100,
        updatedAt: 1_200,
      },
    },
    {
      role: "assistant",
      kind: "approval",
      order: 4,
      approval: {
        id: "approval-1",
        nodeId: "node-1",
        nodeTitle: "镜头图",
        action: "image_generation",
        providerLabel: "Image",
        modelLabel: "model",
        status: "pending",
        steps: [],
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      role: "assistant",
      kind: "chat",
      order: 5,
      text: "最终结果。",
      meta: { runId: "run-1", messageId: "final-1", isFinal: true },
    },
  ];

  const timeline = buildStyloMessageTimeline(messages);
  const work = timeline.find((item) => item.kind === "work");
  assert.ok(work && work.kind === "work");
  assert.equal(work.items.length, 3);
  assert.equal(
    work.items.some((item) => item.kind === "status" && item.message.statusCard.id === "response-1"),
    false
  );
  assert.equal(work.toolCount, 1);
  assert.equal(work.durationMs, 1_100);
  assert.equal(work.hasFinalAnswer, true);
  assert.equal(timeline.some((item) => item.kind === "approval"), true);
  assert.equal(
    timeline.some((item) => item.kind === "chat" && item.message.text === "最终结果。"),
    true
  );
  assert.equal(
    timeline.some((item) => item.kind === "chat" && item.message.text === "继续处理。"),
    false
  );
});

test("message timeline projects a synthetic long conversation within the rendering budget", () => {
  const messages: Message[] = [];
  for (let index = 0; index < 2_000; index += 1) {
    const runId = `run-${index}`;
    const callId = `call-${index}`;
    const order = index * 5;
    messages.push(
      { role: "user", kind: "chat", order, text: `任务 ${index}` },
      {
        role: "assistant",
        kind: "status",
        order: order + 1,
        statusCard: {
          id: `status-${index}`,
          runId,
          status: "success",
          headline: "思考",
          steps: [],
          startedAt: order,
          updatedAt: order + 10,
          isThinking: true,
        },
      },
      {
        role: "assistant",
        kind: "tool",
        order: order + 2,
        tool: { callId, runId, name: "read_document", status: "running" },
      },
      {
        role: "assistant",
        kind: "tool_result",
        order: order + 3,
        tool: { callId, runId, name: "read_document", status: "success" },
      },
      {
        role: "assistant",
        kind: "chat",
        order: order + 4,
        text: `完成 ${index}`,
        meta: { runId, messageId: `answer-${index}`, isFinal: true },
      }
    );
  }

  const startedAt = performance.now();
  const timeline = buildStyloMessageTimeline(messages);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(timeline.length, 6_000);
  assert.ok(elapsedMs < 1_000, `10,000-message timeline projection took ${elapsedMs.toFixed(1)}ms`);
});

test("Agent history rendering coalesces scroll frames and isolates offscreen message work", () => {
  const componentSource = readFileSync("node-workspace/components/stylo/StyloChatContent.tsx", "utf8");
  const styleSource = readFileSync("node-workspace/styles/nodeflow.css", "utf8");

  assert.match(componentSource, /const MessageItemView = memo/);
  assert.match(componentSource, /cancelAnimationFrame\(scrollFrameRef\.current\)/);
  assert.match(componentSource, /nextPinned === isPinnedToCurrentRef\.current/);
  assert.match(styleSource, /\.stylo-message-item:not\(\[data-current="true"\]\)[\s\S]*content-visibility:\s*auto/);
  assert.match(styleSource, /contain-intrinsic-block-size:\s*auto 76px/);
});

test("Agent icons stay editorial while message surfaces follow Account theme panels", () => {
  const styleSource = readFileSync("node-workspace/styles/nodeflow.css", "utf8");
  const iconRule = styleSource.match(/\.stylo-message-icon\s*\{([^}]+)\}/)?.[1] || "";
  const approvalRule = styleSource.match(/\.stylo-approval-panel\s*\{([^}]+)\}/)?.[1] || "";

  assert.match(iconRule, /border-radius:\s*0/);
  assert.match(iconRule, /background:\s*transparent/);
  assert.match(iconRule, /box-shadow:\s*none/);
  assert.doesNotMatch(iconRule, /radial-gradient|filter:|text-shadow/);
  assert.match(approvalRule, /border-radius:\s*14px/);
  assert.match(approvalRule, /var\(--app-panel-muted\)/);
  assert.doesNotMatch(approvalRule, /radial-gradient|filter:|text-shadow/);
});

test("Agent mixed-message hierarchy keeps answers and decisions primary over work details", () => {
  const componentSource = readFileSync("node-workspace/components/stylo/StyloChatContent.tsx", "utf8");
  const styleSource = readFileSync("node-workspace/styles/nodeflow.css", "utf8");

  assert.match(componentSource, /className="stylo-assistant-answer/);
  assert.match(componentSource, /className="stylo-work-stage__content/);
  assert.match(componentSource, /data-status=\{approval\.status\}/);
  assert.match(styleSource, /\.stylo-assistant-answer\s*\{[\s\S]*var\(--app-panel-muted\)/);
  assert.match(styleSource, /\.stylo-work-stage__content\s*\{[\s\S]*border-color:/);
  assert.match(styleSource, /\.stylo-work-detail-row \.stylo-message-icon\s*\{[\s\S]*opacity:\s*0\.58/);
  assert.match(styleSource, /\.stylo-approval-panel\[data-status="pending"\]\s*\{[\s\S]*border-color:\s*var\(--app-border-strong\)/);
  assert.doesNotMatch(styleSource, /\.stylo-approval-panel\[data-status="pending"\]\s*\{[^}]*inset 3px/);
});

test("tool display outcomes do not present budget skips or no-ops as success", () => {
  assert.equal(resolveToolDisplayOutcome(undefined, {
    name: "operate_foundation",
    status: "success",
    summary: "Tool skipped: Tool budget exhausted",
    output: JSON.stringify({ target: "tool_budget", action: "skip", skipped: true }),
  }), "skipped");
  assert.equal(resolveToolDisplayOutcome(undefined, {
    name: "update_document",
    status: "success",
    summary: "Document not updated",
    output: JSON.stringify({ target: "document", action: "update", updated: false }),
  }), "no_change");
  assert.equal(resolveToolDisplayOutcome(undefined, {
    name: "read_document",
    status: "success",
    output: JSON.stringify({ target: "document", action: "read" }),
  }), "success");
});

test("Agent markdown accepts only HTTP(S) links", () => {
  assert.equal(normalizeSafeExternalUrl("javascript:alert(1)"), null);
  assert.equal(normalizeSafeExternalUrl("data:text/html,unsafe"), null);
  assert.equal(normalizeSafeExternalUrl("https://example.com/path"), "https://example.com/path");
});

test("stale durable Agent results cannot overwrite a newer Flow revision", () => {
  const result: StyloRunResult = {
    ...emptyResult(),
    updatedProjectPatch: { activeFlowProjectId: "project-1" },
    toolCalls: [
      { callId: "write-1", name: "update_document", status: "success" },
      { callId: "read-1", name: "read_document", status: "success" },
    ],
  };
  assert.equal(shouldRejectStaleAgentResult(result, 10, 11), true);
  assert.equal(shouldRejectStaleAgentResult(emptyResult(), 10, 11), false);
  const messages: Message[] = [
    { role: "assistant", kind: "tool_result", tool: { callId: "write-1", name: "update_document", status: "success" } },
    { role: "assistant", kind: "tool_result", tool: { callId: "read-1", name: "read_document", status: "success" } },
  ];
  const reconciled = reconcileStaleAgentMessages(messages, result, "conflict");
  assert.equal(reconciled[0].kind === "tool_result" && reconciled[0].tool.status, "error");
  assert.equal(reconciled[1].kind === "tool_result" && reconciled[1].tool.status, "success");
  const last = reconciled.at(-1);
  assert.equal(last?.kind === "chat" && last.text, "conflict");
});

test("HTTP stream packets validate shape and sequence guard rejects replay", () => {
  const event = parseAgentStreamPacket(JSON.stringify({
    kind: "event",
    event: { type: "message_delta", runId: "run-1", sequence: 2, delta: "a", accumulatedText: "a" },
  }));
  assert.equal(event.kind, "event");
  assert.throws(
    () => parseAgentStreamPacket(JSON.stringify({ kind: "event", event: { type: "message_delta", runId: "run-1" } })),
    /Malformed Agent stream packet/
  );
  assert.throws(
    () => parseAgentStreamPacket(JSON.stringify({ kind: "event", event: { type: "unknown", runId: "run-1" } })),
    /Malformed Agent stream packet/
  );
  const resultPacket = parseAgentStreamPacket(JSON.stringify({ kind: "result", result: emptyResult() }));
  assert.equal(resultPacket.kind === "result" && resultPacket.result.projectId, "project-1");

  const guard = new AgentEventSequenceGuard();
  const sequenced = event.kind === "event" ? event.event : null;
  assert.ok(sequenced);
  assert.equal(guard.accept(sequenced), true);
  assert.equal(guard.accept(sequenced), false);
});

test("SSE decoder handles CRLF frames, comments, and multi-line data", () => {
  const first = drainAgentSseBuffer(": heartbeat\r\ndata: {\"kind\":\r\ndata: \"result\"}\r\n\r\ndata: next");
  assert.deepEqual(first.packets, ['{"kind":\n"result"}']);
  assert.equal(first.remainder, "data: next");
  const flushed = drainAgentSseBuffer(first.remainder, true);
  assert.deepEqual(flushed.packets, ["next"]);
  assert.equal(flushed.remainder, "");
});

test("runtime core does not mutate process-wide OpenAI Agents SDK defaults", () => {
  const source = readFileSync("agents/runtime/core.ts", "utf8");
  assert.doesNotMatch(source, /setDefaultOpenAIClient|setOpenAIAPI/);
  assert.match(source, /createStyloProviderRuntime/);
});

test("prompt catalog follows the registered tool graph and excludes legacy tool files", () => {
  const source = readFileSync("agents/runtime/promptCatalog.generated.ts", "utf8");
  assert.doesNotMatch(source, /agents\/tools\/(editScriptResource|getEpisodeScript|getSceneScript)\.ts/);
});

test("Edge sessions use optimistic concurrency and the API delegates bridge and stream adapters", () => {
  const sessionSource = readFileSync("functions/api/_agentSessions.ts", "utf8");
  assert.match(sessionSource, /WHERE session_key=\?1 AND updated_at=\?7/);
  assert.match(sessionSource, /Agent session update conflicted repeatedly/);
  const apiSource = readFileSync("functions/api/agent.ts", "utf8");
  assert.match(apiSource, /from "\.\/_agentBridgeState"/);
  assert.match(apiSource, /from "\.\/_agentStream"/);
  assert.ok(apiSource.split("\n").length < 450);
});
