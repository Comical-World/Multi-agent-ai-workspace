import { NextResponse } from "next/server";

import { runServerAgent } from "@/lib/agent-runner";
import { prisma } from "@/lib/db";
import { extractGeneratedFiles, formatGeneratedFileSummary, writeGeneratedFiles } from "@/lib/generated-files";
import type { AgentType, ProjectState } from "@/lib/project-types";

const validAgents: AgentType[] = ["plan", "research", "code", "test", "docs"];

type RouteContext = {
  params: Promise<{
    agent: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { agent } = await context.params;
  const agentType = agent as AgentType;
  let runId: string | null = null;
  let projectId = "";

  if (!validAgents.includes(agentType)) {
    return NextResponse.json({ error: "Unknown agent." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { projectState?: ProjectState };
    const projectState = body.projectState;

    if (!projectState?.idea?.trim()) {
      return NextResponse.json({ error: "Enter a project idea before running an agent." }, { status: 400 });
    }

    projectId = projectState.projectId;

    await prisma.project
      .upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        title: buildProjectTitle(projectState.idea),
        idea: projectState.idea,
        plan: projectState.plan,
        research: projectState.research,
        code: projectState.code,
        test: projectState.test,
        docs: projectState.docs,
        activeAgent: agentType,
      },
      update: {
        title: buildProjectTitle(projectState.idea),
        idea: projectState.idea,
        plan: projectState.plan,
        research: projectState.research,
        code: projectState.code,
        test: projectState.test,
        docs: projectState.docs,
        activeAgent: agentType,
      },
      })
      .catch(() => null);

    const run = await prisma.agentRun
      .create({
        data: {
          projectId,
          agent: agentType,
          status: "running",
          input: projectState,
        },
      })
      .catch(() => null);
    runId = run?.id ?? null;

    await prisma.activityLog
      .create({
        data: {
          projectId,
          message: `${agentType} agent started`,
        },
      })
      .catch(() => null);

    const result = await runServerAgent(agentType, projectState);
    let resultOutput = result.output;
    let artifactNames = result.artifacts;

    if (agentType === "code") {
      const generatedFiles = extractGeneratedFiles(result, projectState);
      const writtenFiles = await writeGeneratedFiles(projectId, generatedFiles);
      result.generatedFiles = writtenFiles;
      artifactNames = Array.from(new Set([...result.artifacts, ...writtenFiles.map((file) => file.path)]));
      result.artifacts = artifactNames;
      resultOutput = `${result.output}\n\n${formatGeneratedFileSummary(writtenFiles)}`;

      await Promise.all(
        writtenFiles.map((file) =>
          prisma.generatedFile.upsert({
            where: {
              projectId_path: {
                projectId,
                path: file.path,
              },
            },
            create: {
              projectId,
              path: file.path,
              content: file.content,
              language: file.language || "text",
            },
            update: {
              content: file.content,
              language: file.language || "text",
            },
          })
          .catch(() => null)
        )
      );
    }

    const projectUpdate = getProjectOutputUpdate(agentType, resultOutput);

    await prisma.project
      .update({
        where: { id: projectId },
        data: {
          ...projectUpdate,
          activeAgent: "idle",
        },
      })
      .catch(() => null);

    if (runId) {
      await prisma.agentRun
        .update({
          where: { id: runId },
          data: {
            status: "done",
            output: resultOutput,
            summary: result.summary,
            warnings: result.warnings,
            nextAction: result.nextAction,
            usedMock: result.usedMock,
            finishedAt: new Date(),
          },
        })
        .catch(() => null);
    }

    if (artifactNames.length > 0) {
      await prisma.artifact
        .createMany({
          data: artifactNames.map((artifact) => ({
            projectId,
            name: artifact,
            type: result.agent,
            status: result.agent === "test" ? "passed" : "ready",
            content: resultOutput,
          })),
        })
        .catch(() => null);
    }

    await prisma.activityLog
      .create({
        data: {
          projectId,
          message: `${agentType} agent completed${result.usedMock ? " in mock fallback mode" : ""}`,
        },
      })
      .catch(() => null);

    return NextResponse.json({
      ...result,
      output: resultOutput,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed.";

    if (runId) {
      await prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: "error",
          error: message,
          finishedAt: new Date(),
        },
      });
    }

    if (projectId) {
      await prisma.project
        .update({
          where: { id: projectId },
          data: { activeAgent: "idle" },
        })
        .catch(() => null);

      await prisma.activityLog
        .create({
          data: {
            projectId,
            message: `${agentType} agent failed`,
            level: "error",
          },
        })
        .catch(() => null);
    }

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}

function buildProjectTitle(idea: string) {
  const title = idea.trim().replace(/\s+/g, " ").slice(0, 80);
  return title || "Untitled project";
}

function getProjectOutputUpdate(agent: AgentType, output: string) {
  switch (agent) {
    case "plan":
      return { plan: output };
    case "research":
      return { research: output };
    case "code":
      return { code: output };
    case "test":
      return { test: output };
    case "docs":
      return { docs: output };
  }
}
