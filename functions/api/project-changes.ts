const JSON_HEADERS = { "content-type": "application/json" };

const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = { ...JSON_HEADERS, ...(init.headers || {}) };
  return new Response(JSON.stringify(body), { ...init, headers });
};

export const onRequestGet = async () =>
  jsonResponse(
    {
      error: "Deprecated endpoint",
      detail:
        "/api/project-changes used the legacy user_projects/user_project_changes tables and is no longer a valid source of project truth. Use /api/project instead.",
      replacement: "/api/project",
    },
    { status: 410 }
  );
