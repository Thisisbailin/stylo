import type { StyloAgentBridge } from "../bridge/styloBridge";

type PingArgs = {
  message?: string;
};

const pingParameters = {
  type: "object",
  properties: {
    message: {
      type: "string",
      description: "Optional short message to echo back for tool-call verification.",
    },
  },
  required: [],
} as const;

const parsePingArgs = (input: unknown): PingArgs => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const raw = input as Record<string, unknown>;
  return {
    message: typeof raw.message === "string" ? raw.message : undefined,
  };
};

export const pingToolDef = {
  name: "ping_tool",
  description: "Minimal verification tool used to confirm that function calling works end-to-end.",
  parameters: pingParameters,
  execute: (input: unknown, _bridge: StyloAgentBridge) => {
    const args = parsePingArgs(input);
    return {
      ok: true,
      echoedMessage: args.message || "",
      timestamp: Date.now(),
    };
  },
  summarize: (output: any) => {
    const echoed = typeof output?.echoedMessage === "string" && output.echoedMessage.trim();
    return echoed ? `ping_tool 已返回: ${output.echoedMessage}` : "ping_tool 已返回";
  },
};
