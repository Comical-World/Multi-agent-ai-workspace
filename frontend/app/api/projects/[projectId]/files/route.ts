import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const files = await prisma.generatedFile.findMany({
      where: { projectId },
      orderBy: { path: "asc" },
    });

    return NextResponse.json({
      files: files.map((file) => ({
        path: file.path,
        content: file.content,
        language: file.language,
        updatedAt: file.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load generated files." },
      { status: 500 }
    );
  }
}
