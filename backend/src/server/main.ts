import { createDependencies } from "./dependencies";
import {
  parseCorsOrigins,
  parseRuntimeConfig,
  resolveClientDistPath,
} from "./runtime";
import { buildServer } from "./server";

const dependencies = createDependencies(process.env);
const server = buildServer(dependencies.pipeline, {
  readiness: dependencies.readiness,
  resetSimulation: dependencies.resetSimulation,
  corsOrigins: parseCorsOrigins(process.env),
  clientDistPath: resolveClientDistPath({
    configuredPath: process.env.CLIENT_DIST_DIR,
  }),
});
const runtime = parseRuntimeConfig(process.env);

await server.listen(runtime);

async function shutdown() {
  await server.close();
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
