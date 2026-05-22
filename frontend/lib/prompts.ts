import type { AgentType, ProjectState } from "@/lib/project-types";

const compact = (value: string) => value.trim() || "Not available yet.";

export function buildAgentPrompt(agent: AgentType, project: ProjectState) {
  const sharedContext = `
Project idea:
${compact(project.idea)}

Current outputs:
Plan: ${compact(project.plan)}
Research: ${compact(project.research)}
Code: ${compact(project.code)}
Test: ${compact(project.test)}
Docs: ${compact(project.docs)}
`;

  const instructions: Record<AgentType, string> = {
    plan: `
You are the Planner Agent.
Break the project into technical steps, architecture plan, modules, milestones, risks, and execution order.
Return concise markdown with sections: Summary, Architecture, Milestones, Modules, Risks, Next Action.
`,
    research: `
You are the Research Agent.
Use the idea and plan to recommend tech stack, libraries, APIs, implementation constraints, dependency risks, and validation notes.
Return concise markdown with sections: Stack, Libraries, APIs, Risks, Decisions, Next Action.
`,
    code: `
You are the Coding Agent.
Use the plan and research to generate real project files for a small, working Next.js app or API service.
Return a short markdown explanation first.
Then include exactly one fenced JSON block with this shape:
\`\`\`json
{
  "files": [
    {
      "path": "app/page.tsx",
      "language": "tsx",
      "content": "file content here"
    }
  ]
}
\`\`\`
Rules:
- Include package.json, app/page.tsx, app/layout.tsx, app/globals.css, README.md, and any useful components/lib files.
- Keep file paths relative. Do not use absolute paths. Do not use ../.
- Content must be complete file content, not fragments.
- Prefer no external dependencies unless package.json includes them.
`,
    test: `
You are the Testing Agent.
Use the generated code output to identify bugs, edge cases, manual checks, test cases, and release blockers.
Return concise markdown with sections: Checks, Bugs, Edge Cases, Improvements, Pass Criteria, Next Action.
`,
    docs: `
You are the Docs Agent.
Use the full project context to produce README content, setup guide, architecture explanation, workflow notes, and handoff summary.
Return concise markdown with sections: Overview, Setup, Usage, Architecture, Agent Workflow, Handoff.
`,
  };

  return `${instructions[agent]}\n${sharedContext}`.trim();
}
