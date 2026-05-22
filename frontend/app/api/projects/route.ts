import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { toProjectState } from "@/lib/project-mapper";

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      projects: projects.map(toProjectState),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load projects." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { idea?: string };
    const idea = body.idea?.trim() || "Untitled project";

    const project = await prisma.project.create({
      data: {
        idea,
        title: idea.slice(0, 80),
      },
    });

    await prisma.activityLog.create({
      data: {
        projectId: project.id,
        message: "Project created",
      },
    });

    return NextResponse.json(toProjectState(project));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project." },
      { status: 500 }
    );
  }
}
