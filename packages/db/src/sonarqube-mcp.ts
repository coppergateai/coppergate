/**
 * Read-only SonarQube Web API helpers exposed as MCP-style tools.
 */
export type SonarToolName =
  | "sonar_list_issues"
  | "sonar_quality_gate"
  | "sonar_hotspots";

export async function callSonarTool(input: {
  endpointUrl: string;
  token: string;
  tool: SonarToolName;
  args?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = input.endpointUrl.replace(/\/+$/, "");
  const auth = Buffer.from(`${input.token}:`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  if (input.tool === "sonar_list_issues") {
    const project = String(input.args?.projectKey ?? "").trim();
    const qs = new URLSearchParams({
      resolved: "false",
      ps: "20",
      ...(project ? { componentKeys: project } : {}),
    });
    const res = await fetchImpl(`${base}/api/issues/search?${qs}`, {
      headers,
    });
    if (!res.ok) throw new Error(`sonar_list_issues failed (${res.status})`);
    return res.json();
  }

  if (input.tool === "sonar_quality_gate") {
    const project = String(input.args?.projectKey ?? "").trim();
    if (!project) throw new Error("projectKey required");
    const qs = new URLSearchParams({ project });
    const res = await fetchImpl(
      `${base}/api/qualitygates/project_status?${qs}`,
      { headers },
    );
    if (!res.ok) throw new Error(`sonar_quality_gate failed (${res.status})`);
    return res.json();
  }

  if (input.tool === "sonar_hotspots") {
    const project = String(input.args?.projectKey ?? "").trim();
    const qs = new URLSearchParams({
      ps: "20",
      ...(project ? { projectKey: project } : {}),
    });
    const res = await fetchImpl(`${base}/api/hotspots/search?${qs}`, {
      headers,
    });
    if (!res.ok) throw new Error(`sonar_hotspots failed (${res.status})`);
    return res.json();
  }

  throw new Error(`unknown sonar tool: ${input.tool}`);
}
