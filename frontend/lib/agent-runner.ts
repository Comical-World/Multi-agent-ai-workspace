import { buildAgentPrompt } from "@/lib/prompts";
import type { AgentResult, AgentType, ProjectState } from "@/lib/project-types";

type OpenAIResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const agentMeta: Record<
  AgentType,
  {
    title: string;
    summary: string;
    artifacts: string[];
    warnings: string[];
    nextAction: string;
  }
> = {
  plan: {
    title: "Planner Agent",
    summary: "Architecture, modules, milestones, risks, and build order are ready.",
    artifacts: ["project-brief.md", "architecture-plan.md", "milestones.json"],
    warnings: ["Confirm scope boundaries before code generation."],
    nextAction: "Run Research to validate stack and dependency risks.",
  },
  research: {
    title: "Research Agent",
    summary: "Tech stack, libraries, APIs, constraints, and risk notes are ready.",
    artifacts: ["dependency-notes.md", "api-surface.md", "risk-register.md"],
    warnings: ["Validate external service limits before production use."],
    nextAction: "Run Code to produce project structure and implementation details.",
  },
  code: {
    title: "Coding Agent",
    summary: "Implementation structure, components, API routes, and state flow are ready.",
    artifacts: ["file-tree.md", "component-map.md", "api-routes.md"],
    warnings: ["Review generated code before committing to a shared branch."],
    nextAction: "Run Test to inspect bugs, edge cases, and release blockers.",
  },
  test: {
    title: "Testing Agent",
    summary: "Checks, edge cases, improvements, and pass criteria are ready.",
    artifacts: ["test-report.md", "qa-checklist.md", "release-blockers.md"],
    warnings: ["Add real automated tests once generated files are committed."],
    nextAction: "Run Docs to produce setup and handoff documentation.",
  },
  docs: {
    title: "Docs Agent",
    summary: "README, setup guide, architecture notes, and handoff summary are ready.",
    artifacts: ["README.md", "architecture.md", "handoff-summary.md"],
    warnings: ["Replace placeholder URLs after deployment."],
    nextAction: "Review artifacts and prepare a commit.",
  },
};

export async function runServerAgent(agent: AgentType, project: ProjectState): Promise<AgentResult> {
  const prompt = buildAgentPrompt(agent, project);
  let usedMock = false;
  let output = "";

  if (hasLLMProvider()) {
    try {
      output = await runLLM(prompt);
    } catch (error) {
      if (process.env.ALLOW_AGENT_MOCK_FALLBACK === "false" && agent !== "code") {
        throw error;
      }

      usedMock = true;
      output = buildMockOutput(agent, project);
    }
  } else {
    usedMock = true;
    output = buildMockOutput(agent, project);
  }

  if (!output) {
    if (process.env.ALLOW_AGENT_MOCK_FALLBACK === "false" && agent !== "code") {
      throw new Error("Agent returned an empty response.");
    }

    usedMock = true;
    output = buildMockOutput(agent, project);
  }

  return {
    agent,
    output,
    summary: agentMeta[agent].summary,
    artifacts: agentMeta[agent].artifacts,
    warnings: agentMeta[agent].warnings,
    nextAction: agentMeta[agent].nextAction,
    usedMock,
  };
}

function hasLLMProvider() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY);
}

async function runLLM(prompt: string) {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return runGemini(prompt);
  }

  if (process.env.OPENAI_API_KEY) {
    return runOpenAI(prompt);
  }

  throw new Error("No LLM provider configured.");
}

async function runGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are a senior multi-agent software workspace assistant. Be concise, structured, practical, and implementation-focused.\n\n${prompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.35,
        },
      }),
      signal: AbortSignal.timeout(llmTimeoutMs()),
    }
  );

  const data = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${data.error?.message || response.statusText}`);
  }

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n")
      .trim() || "The agent completed, but no output was returned."
  );
}

async function runOpenAI(prompt: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a senior multi-agent software workspace assistant. Be concise, structured, practical, and implementation-focused.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
    }),
    signal: AbortSignal.timeout(llmTimeoutMs()),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed: ${text}`);
  }

  const data = (await response.json()) as OpenAIResponse;
  return data.choices?.[0]?.message?.content?.trim() || "The agent completed, but no output was returned.";
}

function llmTimeoutMs() {
  const timeout = Number(process.env.AGENT_LLM_TIMEOUT_MS || 12000);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 12000;
}

/*
 * Mock output keeps the app usable when no provider is configured. Set
 * ALLOW_AGENT_MOCK_FALLBACK=false in env to make provider errors fail hard.
 */
function buildMockOutput(agent: AgentType, project: ProjectState) {
  const idea = project.idea.trim() || "the requested software project";
  const meta = agentMeta[agent];

  const outputs: Record<AgentType, string> = {
    plan: `## ${meta.title}

### Summary
Build ${idea} as a staged, single-project AI workspace with a clear execution pipeline.

### Architecture
- Next.js app shell for the command center UI
- API routes for agent execution
- Central project state for idea, outputs, statuses, and active agent
- Agent prompt templates for repeatable behavior

### Milestones
1. Capture project idea and project state
2. Generate plan from original user intent
3. Research stack, APIs, and risks using the plan
4. Generate implementation structure from plan and research
5. Test generated outputs and document the final handoff

### Next Action
Run Research.`,
    research: `## ${meta.title}

### Stack
- Next.js App Router
- React state with a typed project model
- API route handlers for each agent stage
- Optional OpenAI-compatible backend execution

### Risks
- The coding stage depends on the quality of plan and research outputs
- API keys should stay server-side only
- Long outputs may need streaming in a later phase

### Recommendations
- Keep the first release single-project and deterministic
- Add persistence after the staged workflow is stable
- Add retries and streaming once basic execution is reliable

### Next Action
Run Code.`,
    code: `## ${meta.title}

### File Tree
\`\`\`txt
frontend/app/page.tsx
frontend/app/api/agent/[agent]/route.ts
frontend/lib/project-types.ts
frontend/lib/prompts.ts
frontend/lib/agent-runner.ts
frontend/lib/agentClient.ts
\`\`\`

### State Flow
Idea input updates ProjectState. Agent buttons call API routes. API routes build prompts, run the selected agent, and return structured output. The UI stores the result and unlocks the next stage.

### Backend Routes
- POST /api/agent/plan
- POST /api/agent/research
- POST /api/agent/code
- POST /api/agent/test
- POST /api/agent/docs

### Next Action
Run Test.`,
    test: `## ${meta.title}

### Checks
- Agent buttons should set status to running, then done
- Research should use existing plan output
- Code should use plan and research
- Docs should use all previous outputs

### Edge Cases
- Empty idea should be blocked before execution
- Failed API route should mark the active agent as error
- Re-running an agent should overwrite that stage and preserve other stages

### Pass Criteria
The full workflow completes from Plan through Docs and produces visible output, artifacts, and activity entries.

### Next Action
Run Docs.`,
    docs: `## ${meta.title}

### Overview
This workspace runs a staged multi-agent software development pipeline for one active project.

### Setup
Run the Next.js frontend and optionally set OPENAI_API_KEY plus OPENAI_MODEL for real model-backed output.

### Usage
1. Enter a project idea
2. Click an agent in the launchpad
3. Inspect output, status, timeline, and artifacts
4. Continue through Plan, Research, Code, Test, and Docs

### Handoff
The final result includes a project brief, research notes, implementation structure, test report, and documentation draft.`,
  };

  return outputs[agent];
}
