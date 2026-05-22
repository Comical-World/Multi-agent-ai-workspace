import type { AgentResult, AgentType, ProjectState } from "@/lib/project-types";

export async function runAgentRequest(agent: AgentType, projectState: ProjectState): Promise<AgentResult> {
  const response = await fetch(`/api/agent/${agent}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectState }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Agent ${agent} failed.`);
  }

  return response.json() as Promise<AgentResult>;
}
