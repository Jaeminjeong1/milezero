import { createDemoGateway } from "@/demo/gateway";
import { createDemoKnowledgeSeed } from "@/demo/seed";
import { createGeminiGatewayFromEnv } from "@/gemini/gateway";
import type { KnowledgeGenerator } from "@/knowledge/analyzer";
import { BackendPipeline, type ClaimMatcher } from "@/pipeline/pipeline";
import type { QuestionGenerator } from "@/questions/planner";
import { InMemoryKnowledgeStore } from "@/storage/in-memory-store";
import { createSupabaseKnowledgeStoreFromEnv } from "@/storage/supabase-store";

type RuntimeMode = "demo" | "judge" | "production";

type ModelGateway = {
  generateQuestion: QuestionGenerator;
  generateKnowledge: KnowledgeGenerator;
  matchClaim: ClaimMatcher;
};

type DependencyFactories = {
  createGeminiGateway?: (env: NodeJS.ProcessEnv) => ModelGateway;
};

export function createDependencies(
  env: NodeJS.ProcessEnv,
  factories: DependencyFactories = {},
) {
  const mode = parseRuntimeMode(env.MILEZERO_MODE);
  if (mode === "demo") {
    return createSeededDependencies("demo", createDemoGateway());
  }
  if (mode === "judge") {
    const createGateway =
      factories.createGeminiGateway ?? createGeminiGatewayFromEnv;
    return createSeededDependencies("judge", createGateway(env));
  }

  const createGateway =
    factories.createGeminiGateway ?? createGeminiGatewayFromEnv;
  const gateway = createGateway(env);
  const store = createSupabaseKnowledgeStoreFromEnv(env);
  return {
    mode: "production" as const,
    pipeline: createPipeline(store, gateway),
    readiness: () => store.getPointBalance("readiness-probe"),
    inspect: undefined,
    resetSimulation: undefined,
  };
}

function createSeededDependencies(
  mode: "demo" | "judge",
  gateway: ModelGateway,
) {
  const store = new InMemoryKnowledgeStore(createDemoKnowledgeSeed());
  return {
    mode,
    pipeline: createPipeline(store, gateway),
    readiness: () => store.getPointBalance("readiness-probe"),
    inspect: () => store.snapshot(),
    resetSimulation: async () => {
      store.reset(createDemoKnowledgeSeed());
    },
  };
}

function createPipeline(
  store: InMemoryKnowledgeStore | ReturnType<typeof createSupabaseKnowledgeStoreFromEnv>,
  gateway: ModelGateway,
) {
  return new BackendPipeline({
    store,
    generateQuestion: gateway.generateQuestion,
    generateKnowledge: gateway.generateKnowledge.bind(gateway),
    matchClaim: gateway.matchClaim,
  });
}

function parseRuntimeMode(value: string | undefined): RuntimeMode {
  const mode = value ?? "production";
  if (mode === "demo" || mode === "judge" || mode === "production") {
    return mode;
  }
  throw new Error("MILEZERO_MODE는 demo, judge, production 중 하나여야 합니다.");
}
