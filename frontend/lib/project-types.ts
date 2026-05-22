export type AgentType = "plan" | "research" | "code" | "test" | "docs";

export type AgentStatus = "pending" | "running" | "done" | "error";

export type ActiveAgent = "idle" | AgentType;

export type ProjectState = {
  projectId: string;
  idea: string;
  plan: string;
  research: string;
  code: string;
  test: string;
  docs: string;
  activeAgent: ActiveAgent;
  status: Record<AgentType, AgentStatus>;
  updatedAt: string;
};

export type AgentResult = {
  agent: AgentType;
  output: string;
  summary: string;
  artifacts: string[];
  warnings: string[];
  nextAction: string;
  usedMock: boolean;
  generatedFiles?: GeneratedFilePayload[];
};

export type GeneratedFilePayload = {
  path: string;
  content: string;
  language?: string;
};

export const agentOrder: AgentType[] = ["plan", "research", "code", "test", "docs"];

export const initialProjectId = "project-draft";

const baseProjectState = (projectId: string, updatedAt: string): ProjectState => ({
  projectId,
  idea: "",
  plan: "",
  research: "",
  code: "",
  test: "",
  docs: "",
  activeAgent: "idle",
  status: {
    plan: "pending",
    research: "pending",
    code: "pending",
    test: "pending",
    docs: "pending",
  },
  updatedAt,
});

export const createInitialProjectState = (): ProjectState => baseProjectState(initialProjectId, "");

export const createProjectState = (): ProjectState => {
  const now = new Date().toISOString();

  return baseProjectState(`project-${Date.now()}`, now);
};
