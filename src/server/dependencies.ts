import { createDemoGateway } from "@/demo/gateway";
import { createGeminiGatewayFromEnv } from "@/gemini/gateway";
import { BackendPipeline } from "@/pipeline/pipeline";
import { InMemoryKnowledgeStore } from "@/storage/in-memory-store";
import { createSupabaseKnowledgeStoreFromEnv } from "@/storage/supabase-store";

export function createDependencies(env: NodeJS.ProcessEnv) {
  if (env.MILEZERO_MODE === "demo") {
    const store = new InMemoryKnowledgeStore();
    const gateway = createDemoGateway();
    return {
      mode: "demo" as const,
      pipeline: new BackendPipeline({ store, ...gateway }),
      readiness: () => store.getPointBalance("readiness-probe"),
      inspect: () => store.snapshot(),
    };
  }

  const gateway = createGeminiGatewayFromEnv(env);
  const store = createSupabaseKnowledgeStoreFromEnv(env);
  return {
    mode: "production" as const,
    pipeline: new BackendPipeline({
      store,
      generateQuestion: gateway.generateQuestion,
      generateKnowledge: gateway.generateKnowledge.bind(gateway),
      matchClaim: gateway.matchClaim,
    }),
    readiness: () => store.getPointBalance("readiness-probe"),
    inspect: undefined,
  };
}
