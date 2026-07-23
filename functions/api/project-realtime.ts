import { getUserId } from "./_auth";
import { requireRequestProjectId } from "./_projectScope";
import { readWebSocketCredential } from "../../utils/websocketAuth";

type Env = {
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
  PROJECT_REALTIME: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
};

const REALTIME_PROTOCOL = "stylo-realtime.v1";

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    if ((context.request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const token = readWebSocketCredential(context.request.headers.get("sec-websocket-protocol"));
    const authenticated = new Request(context.request, {
      headers: {
        ...Object.fromEntries(context.request.headers.entries()),
        authorization: token ? `Bearer ${token}` : "",
      },
    });
    const userId = await getUserId(authenticated, context.env);
    const projectId = requireRequestProjectId(context.request);
    const roomId = context.env.PROJECT_REALTIME.idFromName(`${userId}:${projectId}`);
    const headers = new Headers(context.request.headers);
    headers.set("x-stylo-user-id", userId);
    headers.set("x-stylo-project-id", projectId);
    headers.set("x-stylo-access-mode", "edit");
    headers.set("x-stylo-viewer-id", userId);
    headers.set("sec-websocket-protocol", REALTIME_PROTOCOL);
    headers.delete("authorization");
    return context.env.PROJECT_REALTIME.get(roomId).fetch(new Request(context.request, { headers }));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/project-realtime error", error);
    return new Response("Realtime project connection failed", { status: 500 });
  }
};
