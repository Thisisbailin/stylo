import type { AgentRuntimeEvent } from "../runtime/types";

const eventKey = (event: AgentRuntimeEvent) => {
  if (event.type === "message_delta") return `message:${event.runId}:${event.messageId || "default"}`;
  if (event.type === "reasoning_delta") return `reasoning:${event.runId}`;
  return null;
};

export class AgentStreamEventBuffer {
  private events: AgentRuntimeEvent[] = [];

  push(event: AgentRuntimeEvent) {
    const key = eventKey(event);
    if (!key) return false;
    const existingIndex = this.events.findIndex((queued) => eventKey(queued) === key);
    if (existingIndex >= 0) this.events[existingIndex] = event;
    else this.events.push(event);
    return true;
  }

  drain() {
    const events = this.events;
    this.events = [];
    return events;
  }

  clear() {
    this.events = [];
  }
}
