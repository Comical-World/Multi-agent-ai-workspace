"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  Bot,
  Braces,
  CheckCircle2,
  Circle,
  Clock3,
  Code2,
  Copy,
  FileCode2,
  FileText,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Loader2,
  Play,
  RefreshCcw,
  Rocket,
  Search,
  Settings,
  ShieldAlert,
  Square,
  Terminal,
  Timer,
  TriangleAlert,
  Users,
  Wand2,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runAgentRequest } from "@/lib/agentClient";
import {
  agentOrder,
  createInitialProjectState,
  createProjectState,
  initialProjectId,
  type AgentResult,
  type AgentStatus,
  type AgentType,
  type GeneratedFilePayload,
  type ProjectState,
} from "@/lib/project-types";

type AgentView = {
  id: AgentType;
  name: string;
  role: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  stage: string;
};

type Artifact = {
  name: string;
  type: string;
  status: "draft" | "ready" | "passed";
  icon: LucideIcon;
  color: string;
};

const agents: AgentView[] = [
  {
    id: "plan",
    name: "Planner",
    role: "Architecture, modules, milestones",
    icon: Wand2,
    color: "text-blue-300",
    bg: "bg-blue-300/10 border-blue-300/25",
    stage: "1",
  },
  {
    id: "research",
    name: "Researcher",
    role: "Stack, APIs, dependencies, risks",
    icon: Search,
    color: "text-cyan-300",
    bg: "bg-cyan-300/10 border-cyan-300/25",
    stage: "2",
  },
  {
    id: "code",
    name: "Coder",
    role: "Files, components, backend routes",
    icon: Code2,
    color: "text-violet-300",
    bg: "bg-violet-300/10 border-violet-300/25",
    stage: "3",
  },
  {
    id: "test",
    name: "Tester",
    role: "Bugs, edge cases, release checks",
    icon: FlaskConical,
    color: "text-emerald-300",
    bg: "bg-emerald-300/10 border-emerald-300/25",
    stage: "4",
  },
  {
    id: "docs",
    name: "Docs",
    role: "README, setup, architecture notes",
    icon: FileText,
    color: "text-slate-200",
    bg: "bg-slate-300/10 border-slate-300/20",
    stage: "5",
  },
];

const sidebarItems = [
  { label: "Projects", icon: LayoutDashboard, active: true },
  { label: "Runs", icon: Activity, active: false },
  { label: "Agents", icon: Users, active: false },
  { label: "Settings", icon: Settings, active: false },
];

const templates = ["SaaS app", "AI tool", "Dashboard", "Portfolio", "API service"];

const outputLabels: Record<AgentType, string> = {
  plan: "Plan",
  research: "Research",
  code: "Code",
  test: "Tests",
  docs: "Docs",
};

const statusColor: Record<AgentStatus, string> = {
  pending: "bg-slate-500",
  running: "bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.55)]",
  done: "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.3)]",
  error: "bg-red-400 shadow-[0_0_18px_rgba(248,113,113,0.35)]",
};

const emptyOutputs: Record<AgentType, string> = {
  plan: "Planner output will appear here after you click the Planner agent.",
  research: "Research output will appear here after the Researcher runs.",
  code: "Code output will appear here after the Coder runs.",
  test: "Testing output will appear here after the Tester runs.",
  docs: "Documentation output will appear here after the Docs agent runs.",
};

export default function Page() {
  const [projectState, setProjectState] = useState<ProjectState>(() => createInitialProjectState());
  const [activeTab, setActiveTab] = useState<AgentType>("plan");
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("plan");
  const [activityFeed, setActivityFeed] = useState<string[]>([
    "Workspace initialized",
    "Add an idea, then click an agent in the launchpad",
  ]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([
    { name: "Project brief", type: "Spec", status: "draft", icon: FileText, color: "text-blue-300" },
    { name: "Architecture notes", type: "Doc", status: "draft", icon: Braces, color: "text-cyan-300" },
    { name: "Test report", type: "QA", status: "draft", icon: ShieldAlert, color: "text-emerald-300" },
  ]);
  const [projectHistory, setProjectHistory] = useState<ProjectState[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFilePayload[]>([]);
  const [selectedGeneratedPath, setSelectedGeneratedPath] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const runTokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const saved = window.localStorage.getItem("agentos-project-history");

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ProjectState[];
        window.setTimeout(() => {
          if (cancelled) return;
          setProjectHistory(parsed);
          if (parsed[0]) {
            setProjectState(parsed[0]);
          }
        }, 0);
      } catch {
        window.localStorage.removeItem("agentos-project-history");
      }
    }

    void fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { projects?: ProjectState[] } | null) => {
        if (cancelled || !payload?.projects?.length) return;
        setProjectHistory(payload.projects);
        setProjectState(payload.projects[0]);
      })
      .catch(() => {
        if (!cancelled) {
          setActivityFeed((prev) => ["Database project history unavailable", ...prev]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (projectState.projectId === initialProjectId && !projectState.idea.trim()) {
      return;
    }

    const nextHistory = [
      projectState,
      ...projectHistory.filter((project) => project.projectId !== projectState.projectId),
    ].slice(0, 5);

    window.localStorage.setItem("agentos-project-history", JSON.stringify(nextHistory));
  }, [projectState, projectHistory]);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/projects/${projectState.projectId}/files`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { files?: GeneratedFilePayload[] } | null) => {
        if (!cancelled) {
          setGeneratedFiles(payload?.files || []);
        }
      })
      .catch(() => {
        if (!cancelled) setGeneratedFiles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectState.projectId]);

  const selectedAgentView = agents.find((agent) => agent.id === selectedAgent) ?? agents[0];
  const SelectedAgentIcon = selectedAgentView.icon;
  const completedCount = agentOrder.filter((agent) => projectState.status[agent] === "done").length;

  const projectBrief = useMemo(() => {
    const idea = projectState.idea.trim() || "A multi-agent software workspace";
    const lower = idea.toLowerCase();

    return {
      appType: lower.includes("api")
        ? "API service"
        : lower.includes("dashboard")
          ? "Operational dashboard"
          : lower.includes("ai")
            ? "AI-assisted tool"
            : "Developer workspace",
      users: lower.includes("team") ? "Product and engineering teams" : "Builders and technical operators",
      stack: "Next.js, React, TypeScript, API routes, optional LLM provider",
      architecture: "Project state, prompt templates, agent route handlers, output registry",
      risk: projectState.idea.trim() ? "Scope drift, dependency ambiguity, output validation" : "Idea required before agents run",
    };
  }, [projectState.idea]);

  const setIdea = (idea: string) => {
    setErrorMessage("");
    setProjectState((prev) => ({
      ...(prev.projectId === initialProjectId ? createProjectState() : prev),
      idea,
      updatedAt: new Date().toISOString(),
    }));
  };

  const newProject = () => {
    const freshProject = createProjectState();
    setProjectState(freshProject);
    setActiveTab("plan");
    setSelectedAgent("plan");
    setErrorMessage("");
    setActivityFeed(["New project created", "Add an idea, then click an agent in the launchpad"]);
  };

  const runAgent = async (agent: AgentType, stateOverride?: ProjectState): Promise<ProjectState> => {
    const stateForRun = stateOverride ?? projectState;
    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;

    setSelectedAgent(agent);
    setActiveTab(agent);
    setErrorMessage("");

    if (!stateForRun.idea.trim()) {
      setErrorMessage("Add a project idea before running an agent.");
      return stateForRun;
    }

    const startedState: ProjectState = {
      ...stateForRun,
      activeAgent: agent,
      status: {
        ...stateForRun.status,
        [agent]: "running",
      },
      updatedAt: new Date().toISOString(),
    };

    setProjectState(startedState);
    addActivity(`${agentLabel(agent)} started`);

    try {
      const result = await runAgentRequest(agent, startedState);
      if (runToken !== runTokenRef.current) {
        return {
          ...startedState,
          activeAgent: "idle" as const,
          status: {
            ...startedState.status,
            [agent]: "error",
          },
        };
      }

      const finishedState = applyAgentResult(startedState, result);
      setProjectState(finishedState);
      if (result.generatedFiles?.length) {
        setGeneratedFiles(result.generatedFiles);
      }
      addArtifacts(result);
      addActivity(`${agentLabel(agent)} finished${result.usedMock ? " using local mock mode" : ""}`);
      return finishedState;
    } catch (error) {
      const failedState: ProjectState = {
        ...startedState,
        activeAgent: "idle",
        status: {
          ...startedState.status,
          [agent]: "error",
        },
        updatedAt: new Date().toISOString(),
      };

      const message = error instanceof Error ? error.message : "Agent execution failed.";
      setProjectState(failedState);
      setErrorMessage(message);
      addActivity(`${agentLabel(agent)} failed`);
      return failedState;
    }
  };

  const runFullWorkflow = async () => {
    if (!projectState.idea.trim()) {
      setErrorMessage("Add a project idea before running the full workflow.");
      return;
    }

    let workingState = projectState;

    for (const agent of agentOrder) {
      workingState = await runAgent(agent, workingState);
      if (workingState.status[agent] === "error") break;
    }
  };

  const stopRun = () => {
    if (projectState.activeAgent === "idle") return;

    runTokenRef.current += 1;
    const activeAgent = projectState.activeAgent;
    setProjectState((prev) => ({
      ...prev,
      activeAgent: "idle",
      status: {
        ...prev.status,
        [activeAgent]: "error",
      },
      updatedAt: new Date().toISOString(),
    }));
    addActivity(`${agentLabel(activeAgent)} stopped by operator`);
  };

  const addActivity = (message: string) => {
    setActivityFeed((prev) => [
      `${message} - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      ...prev,
    ]);
  };

  const addArtifacts = (result: AgentResult) => {
    const agent = agents.find((item) => item.id === result.agent) ?? agents[0];
    const nextArtifacts = result.artifacts.map((artifact) => ({
      name: artifact,
      type: outputLabels[result.agent],
      status: result.agent === "test" ? ("passed" as const) : ("ready" as const),
      icon: agent.icon,
      color: agent.color,
    }));

    setArtifacts((prev) => {
      const names = new Set(nextArtifacts.map((artifact) => artifact.name));
      return [...nextArtifacts, ...prev.filter((artifact) => !names.has(artifact.name))].slice(0, 7);
    });
  };

  const currentOutput = projectState[activeTab] || emptyOutputs[activeTab];
  const currentWarnings =
    projectState.status[activeTab] === "error"
      ? [errorMessage || `${outputLabels[activeTab]} failed.`]
      : buildWarnings(activeTab, projectState);
  const selectedGeneratedFile =
    generatedFiles.find((file) => file.path === selectedGeneratedPath) ?? generatedFiles[0];
  const activeGeneratedPath = selectedGeneratedFile?.path ?? "";

  return (
    <main className="min-h-screen bg-[#080b10] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-[#0c1118] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10">
                <Bot className="size-4 text-cyan-200" />
              </div>
              <div>
                <p className="text-sm font-semibold">AgentOS</p>
                <p className="text-xs text-slate-500">Command Center</p>
              </div>
            </div>

            <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition ${
                      item.active
                        ? "border border-blue-400/20 bg-blue-400/10 text-blue-100"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase text-slate-400">Projects</h2>
                <Button size="xs" variant="ghost" onClick={newProject} className="text-cyan-200 hover:bg-white/10">
                  New
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {[projectState, ...projectHistory.filter((item) => item.projectId !== projectState.projectId)]
                  .slice(0, 4)
                  .map((project) => (
                    <button
                      key={project.projectId}
                      onClick={() => setProjectState(project)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                        project.projectId === projectState.projectId
                          ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span className="block truncate">
                        {project.idea.trim() || "Untitled project"}
                      </span>
                <span className="mt-1 block text-slate-500">{agentOrder.filter((agent) => project.status[agent] === "done").length}/5 agents done</span>
                    </button>
                  ))}
              </div>
            </section>

            <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-medium text-slate-300">Environment</p>
              <div className="mt-3 space-y-2 text-xs text-slate-400">
                <StatusRow label="Runtime" value="Next API" tone="text-emerald-300" />
                <StatusRow label="Mode" value="Mock or LLM" />
                <StatusRow label="Progress" value={`${completedCount}/5`} />
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex flex-col gap-3 border-b border-white/10 bg-[#0c1118]/95 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Current project</span>
                <Circle className="size-2 fill-emerald-300 text-emerald-300" />
                <span>{projectState.activeAgent === "idle" ? "Agents ready" : `${agentLabel(projectState.activeAgent)} running`}</span>
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-normal text-slate-50">
                Autonomous Multi-Agent Workspace
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-slate-300">
                <Terminal className="size-3.5 text-emerald-300" />
                staged-pipeline
              </div>
              <Button variant="outline" size="sm" className="border-white/10 bg-white/[0.04] text-slate-100">
                <GitBranch className="size-3.5" />
                GitHub
              </Button>
              <Button size="sm" className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                <Rocket className="size-3.5" />
                Deploy
              </Button>
            </div>
          </header>

          <div className="grid flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="min-w-0 space-y-4 p-4">
              <section className="rounded-lg border border-white/10 bg-[#0f151e] p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold">Project Intake</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Enter one idea. Every agent uses this same project context.
                        </p>
                      </div>
                      <span className="hidden rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-400 sm:block">
                        ProjectState
                      </span>
                    </div>

                    <Textarea
                      value={projectState.idea}
                      onChange={(event) => setIdea(event.target.value)}
                      placeholder="Describe your project idea..."
                      className="min-h-[132px] resize-none border-white/10 bg-[#0b1017] text-sm text-slate-100 placeholder:text-slate-600 focus-visible:ring-cyan-300/20"
                    />

                    <div className="flex flex-wrap gap-2">
                      {templates.map((template) => (
                        <button
                          key={template}
                          onClick={() =>
                            setIdea(
                              `Create a professional ${template.toLowerCase()} with agent planning, research, code generation, tests, docs, and GitHub handoff.`
                            )
                          }
                          className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100"
                        >
                          {template}
                        </button>
                      ))}
                    </div>
                    {errorMessage ? (
                      <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                        {errorMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#0b1017] p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-blue-300" />
                      <h3 className="text-sm font-semibold">Project Brief</h3>
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <BriefRow label="App type" value={projectBrief.appType} />
                      <BriefRow label="Users" value={projectBrief.users} />
                      <BriefRow label="Stack" value={projectBrief.stack} />
                      <BriefRow label="Architecture" value={projectBrief.architecture} />
                      <BriefRow label="Risk" value={projectBrief.risk} warning />
                    </dl>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-cyan-300/15 bg-[#0f151e] p-4 shadow-[0_0_32px_rgba(34,211,238,0.05)]">
                <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Agent Launchpad</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Tip: click an agent card here to run that exact stage. Use Full Workflow when you want Plan to Docs in sequence.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={runFullWorkflow}
                      disabled={projectState.activeAgent !== "idle"}
                      className="bg-blue-300 text-slate-950 hover:bg-blue-200"
                    >
                      {projectState.activeAgent !== "idle" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                      Run Full Workflow
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={stopRun}
                      disabled={projectState.activeAgent === "idle"}
                    >
                      <Square className="size-4" />
                      Stop
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
                  {agents.map((agent) => {
                    const Icon = agent.icon;
                    const status = projectState.status[agent.id];
                    const isRunning = status === "running";

                    return (
                      <button
                        key={agent.id}
                        aria-label={`Run ${agent.name} Agent`}
                        onClick={() => runAgent(agent.id)}
                        disabled={projectState.activeAgent !== "idle" && projectState.activeAgent !== agent.id}
                        className={`min-h-[150px] rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60 ${agent.bg}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-black/20">
                            {isRunning ? <Loader2 className={`size-5 animate-spin ${agent.color}`} /> : <Icon className={`size-5 ${agent.color}`} />}
                          </span>
                          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300">
                            {agent.stage}
                          </span>
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                          <span className={`size-2 rounded-full ${statusColor[status]}`} />
                          <h3 className="text-sm font-semibold text-slate-50">{agent.name}</h3>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-400">{agent.role}</p>
                        <p className="mt-3 text-xs capitalize text-slate-500">{status}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="rounded-lg border border-white/10 bg-[#0f151e] p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Run Timeline</h2>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Rerun selected agent"
                      aria-label="Rerun selected agent"
                      className="text-slate-400 hover:bg-white/10"
                      onClick={() => runAgent(selectedAgent)}
                    >
                      <RefreshCcw className="size-3" />
                    </Button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {agents.map((agent) => {
                      const Icon = agent.icon;
                      const status = projectState.status[agent.id];

                      return (
                        <button
                          key={agent.id}
                          onClick={() => {
                            setSelectedAgent(agent.id);
                            setActiveTab(agent.id);
                          }}
                          className="grid w-full grid-cols-[24px_minmax(0,1fr)] gap-3 text-left"
                        >
                          <span
                            className={`mt-0.5 flex size-6 items-center justify-center rounded-full border ${
                              status === "done"
                                ? "border-emerald-300/30 bg-emerald-300/15"
                                : status === "running"
                                  ? "border-blue-300/30 bg-blue-300/10"
                                  : status === "error"
                                    ? "border-red-300/30 bg-red-300/10"
                                    : "border-white/10 bg-white/[0.03]"
                            }`}
                          >
                            <Icon className={`size-3.5 ${agent.color}`} />
                          </span>
                          <span className="min-w-0 border-b border-white/10 pb-3">
                            <span className="block truncate text-sm text-slate-200">{outputLabels[agent.id]} generated</span>
                            <span className="mt-1 block text-xs capitalize text-slate-500">{status}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#0f151e]">
                  <div className="border-b border-white/10 p-3">
                    <div className="flex flex-wrap gap-1">
                      {agents.map((agent) => {
                        const Icon = agent.icon;
                        const active = activeTab === agent.id;

                        return (
                          <button
                            key={agent.id}
                            onClick={() => {
                              setSelectedAgent(agent.id);
                              setActiveTab(agent.id);
                            }}
                            className={`flex h-8 items-center gap-2 rounded-lg px-3 text-sm transition ${
                              active
                                ? "bg-cyan-300 text-slate-950"
                                : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                            }`}
                          >
                            <Icon className="size-3.5" />
                            {outputLabels[agent.id]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <OutputPanel
                    title={`${outputLabels[activeTab]} Output`}
                    output={currentOutput}
                    summary={summarizeOutput(activeTab, projectState)}
                    artifacts={artifacts.filter((artifact) => artifact.type === outputLabels[activeTab]).map((artifact) => artifact.name)}
                    warnings={currentWarnings}
                    nextAction={nextActionFor(activeTab, projectState)}
                  />
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-lg border border-white/10 bg-[#0f151e] p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Live Activity</h2>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Activity className="size-3 text-emerald-300" />
                      live
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {activityFeed.slice(0, 6).map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                      >
                        <span className="mt-1 size-1.5 rounded-full bg-cyan-300" />
                        <p className="text-sm text-slate-300">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#0f151e] p-4">
                  <h2 className="text-sm font-semibold">Artifacts</h2>
                  <div className="mt-3 space-y-2">
                    {artifacts.map((artifact) => {
                      const Icon = artifact.icon;
                      return (
                        <div
                          key={`${artifact.name}-${artifact.status}`}
                          className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2"
                        >
                          <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.05]">
                            <Icon className={`size-4 ${artifact.color}`} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-slate-200">{artifact.name}</span>
                            <span className="text-xs text-slate-500">
                              {artifact.type} - {artifact.status}
                            </span>
                          </span>
                          <button
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-100"
                            aria-label={`Copy ${artifact.name}`}
                            title="Copy"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-[#0f151e] p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Generated Files</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Coder writes files to frontend/generated-projects/{projectState.projectId}
                    </p>
                  </div>
                  <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-400">
                    {generatedFiles.length} files
                  </span>
                </div>

                {generatedFiles.length ? (
                  <>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {generatedFiles.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => setSelectedGeneratedPath(file.path)}
                          className={`rounded-lg border p-3 text-left transition ${
                            activeGeneratedPath === file.path
                              ? "border-violet-300/40 bg-violet-300/10"
                              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <FileCode2 className="size-4 text-violet-300" />
                            <p className="truncate text-sm text-slate-200">{file.path}</p>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{file.language || "text"}</p>
                        </button>
                      ))}
                    </div>

                    {selectedGeneratedFile ? (
                      <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#080b10]">
                        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <FileCode2 className="size-4 shrink-0 text-violet-300" />
                            <p className="truncate text-sm text-slate-200">{selectedGeneratedFile.path}</p>
                          </div>
                          <span className="shrink-0 text-xs text-slate-500">{selectedGeneratedFile.language || "text"}</span>
                        </div>
                        <pre className="max-h-[420px] overflow-auto p-3 text-sm leading-6 text-slate-300">
                          <code>{selectedGeneratedFile.content}</code>
                        </pre>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="size-4 text-violet-300" />
                      <p className="text-sm text-slate-300">Run Coder to generate real files and preview their code here.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="border-t border-white/10 bg-[#0c1118] p-4 xl:border-l xl:border-t-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Agent Inspector</h2>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-400">
                  {projectState.activeAgent === "idle" ? "Idle" : agentLabel(projectState.activeAgent)}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <SelectedAgentIcon className={`size-4 ${selectedAgentView.color}`} />
                      <h3 className="text-sm font-semibold">{selectedAgentView.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{selectedAgentView.role}</p>
                  </div>
                  <span className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-xs capitalize text-slate-300">
                    {projectState.status[selectedAgent]}
                  </span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-300 transition-all"
                    style={{ width: `${progressFor(projectState.status[selectedAgent])}%` }}
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{nextActionFor(selectedAgent, projectState)}</p>
              </div>

              <div className="mt-4 grid gap-3">
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  const status = projectState.status[agent.id];

                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent.id)}
                      className={`rounded-lg border p-3 text-left transition ${
                        selectedAgent === agent.id
                          ? "border-cyan-300/40 bg-cyan-300/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`size-2 rounded-full ${statusColor[status]}`} />
                            <Icon className={`size-4 ${agent.color}`} />
                            <span className="font-medium text-slate-100">{agent.name}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{agent.role}</p>
                        </div>
                        <span className="text-xs capitalize text-slate-400">{status}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Trace Stats</h3>
                  <Bot className="size-4 text-cyan-300" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <Metric icon={Timer} label="Time" value={completedCount > 0 ? "00:42" : "00:00"} />
                  <Metric icon={Braces} label="Tokens" value={completedCount > 0 ? "ready" : "0"} />
                  <Metric icon={Activity} label="Cost" value="server" />
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-[#0b1017] p-3">
                  <p className="text-xs uppercase text-slate-500">Backend route</p>
                  <p className="mt-2 text-sm text-slate-300">POST /api/agent/{selectedAgent}</p>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function applyAgentResult(state: ProjectState, result: AgentResult): ProjectState {
  return {
    ...state,
    [result.agent]: result.output,
    activeAgent: "idle",
    status: {
      ...state.status,
      [result.agent]: "done",
    },
    updatedAt: new Date().toISOString(),
  };
}

function agentLabel(agent: AgentType) {
  return outputLabels[agent];
}

function progressFor(status: AgentStatus) {
  if (status === "done") return 100;
  if (status === "running") return 68;
  if (status === "error") return 100;
  return 0;
}

function summarizeOutput(agent: AgentType, projectState: ProjectState) {
  if (projectState.status[agent] === "done") {
    return `${outputLabels[agent]} has completed and saved output into the central ProjectState.`;
  }

  if (projectState.status[agent] === "running") {
    return `${outputLabels[agent]} is currently running against the latest project context.`;
  }

  if (projectState.status[agent] === "error") {
    return `${outputLabels[agent]} needs attention before continuing.`;
  }

  return `${outputLabels[agent]} is waiting for you to click its launchpad card.`;
}

function buildWarnings(agent: AgentType, projectState: ProjectState) {
  if (!projectState.idea.trim()) return ["No project idea has been entered yet."];
  if (agent === "research" && !projectState.plan) return ["Research works best after Planner has produced a plan."];
  if (agent === "code" && (!projectState.plan || !projectState.research)) {
    return ["Code generation works best after Plan and Research are complete."];
  }
  if (agent === "test" && !projectState.code) return ["Testing needs Code output for best results."];
  if (agent === "docs" && !projectState.code) return ["Docs become stronger after Code and Test are complete."];
  return ["Review generated output before using it in production."];
}

function nextActionFor(agent: AgentType, projectState: ProjectState) {
  const index = agentOrder.indexOf(agent);
  const next = agentOrder[index + 1];

  if (projectState.status[agent] === "running") return `${outputLabels[agent]} is running now.`;
  if (projectState.status[agent] === "error") return `Rerun ${outputLabels[agent]} or adjust the project idea.`;
  if (projectState.status[agent] === "done" && next) return `Next: run ${outputLabels[next]}.`;
  if (projectState.status[agent] === "done") return "Workflow complete. Review artifacts and prepare handoff.";
  return `Click ${outputLabels[agent]} in the Agent Launchpad.`;
}

function StatusRow({ label, value, tone = "text-slate-300" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}

function BriefRow({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={warning ? "text-amber-200" : "text-slate-300"}>{value}</dd>
    </div>
  );
}

function OutputPanel({
  title,
  output,
  summary,
  artifacts,
  warnings,
  nextAction,
}: {
  title: string;
  output: string;
  summary: string;
  artifacts: string[];
  warnings: string[];
  nextAction: string;
}) {
  return (
    <div className="grid gap-3 p-4">
      <StructuredBlock title={title} icon={FileText} tone="text-blue-300">
        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-[#080b10] p-3 text-sm leading-6 text-slate-300">
          {output}
        </pre>
      </StructuredBlock>

      <div className="grid gap-3 md:grid-cols-3">
        <StructuredBlock title="Summary" icon={CheckCircle2} tone="text-emerald-300">
          <p className="text-sm leading-6 text-slate-300">{summary}</p>
        </StructuredBlock>

        <StructuredBlock title="Artifacts" icon={FileCode2} tone="text-violet-300">
          <ul className="space-y-1.5">
            {(artifacts.length ? artifacts : ["No artifact from this stage yet"]).map((artifact) => (
              <li key={artifact} className="flex items-center gap-2 text-sm text-slate-300">
                <span className="size-1.5 rounded-full bg-violet-300" />
                {artifact}
              </li>
            ))}
          </ul>
        </StructuredBlock>

        <StructuredBlock title="Warnings" icon={TriangleAlert} tone="text-amber-300">
          <ul className="space-y-1.5">
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2 text-sm text-amber-100/90">
                <XCircle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
                {warning}
              </li>
            ))}
          </ul>
        </StructuredBlock>
      </div>

      <StructuredBlock title="Next Action" icon={Clock3} tone="text-cyan-300">
        <p className="text-sm leading-6 text-slate-300">{nextAction}</p>
      </StructuredBlock>
    </div>
  );
}

function StructuredBlock({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`size-4 ${tone}`} />
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
      <Icon className="mx-auto size-3.5 text-slate-400" />
      <p className="mt-1 text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-200">{value}</p>
    </div>
  );
}
