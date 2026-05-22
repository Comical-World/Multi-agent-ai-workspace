import type { Project } from "@prisma/client";

import type { AgentType, ProjectState } from "@/lib/project-types";

const agents: AgentType[] = ["plan", "research", "code", "test", "docs"];

export function toProjectState(project: Project): ProjectState {
  return {
    projectId: project.id,
    idea: project.idea,
    plan: project.plan,
    research: project.research,
    code: project.code,
    test: project.test,
    docs: project.docs,
    activeAgent: agents.includes(project.activeAgent as AgentType)
      ? (project.activeAgent as AgentType)
      : "idle",
    status: {
      plan: project.plan ? "done" : "pending",
      research: project.research ? "done" : "pending",
      code: project.code ? "done" : "pending",
      test: project.test ? "done" : "pending",
      docs: project.docs ? "done" : "pending",
    },
    updatedAt: project.updatedAt.toISOString(),
  };
}
