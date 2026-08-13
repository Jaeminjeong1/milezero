import { createGeminiGatewayFromEnv } from "@/gemini/gateway";
import { BackendPipeline } from "@/pipeline/pipeline";
import { createSupabaseKnowledgeStoreFromEnv } from "@/storage/supabase-store";

import { parseCorsOrigins, parseRuntimeConfig } from "./runtime";
import { buildServer } from "./server";

const gateway = createGeminiGatewayFromEnv();
const store = createSupabaseKnowledgeStoreFromEnv();
const pipeline = new BackendPipeline({
  store,
  generateQuestion: gateway.generateQuestion,
  generateKnowledge: gateway.generateKnowledge.bind(gateway),
  matchClaim: gateway.matchClaim,
});
const server = buildServer(pipeline, {
  readiness: () => store.getPointBalance("readiness-probe"),
  corsOrigins: parseCorsOrigins(process.env),
});
const runtime = parseRuntimeConfig(process.env);

await server.listen(runtime);

async function shutdown() {
  await server.close();
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
