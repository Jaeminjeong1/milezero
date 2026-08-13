import { z } from "zod";

const PortSchema = z.coerce.number().int().min(1).max(65_535);

export function parseRuntimeConfig(
  env: { PORT?: string },
): { host: "0.0.0.0"; port: number } {
  const parsed = PortSchema.safeParse(env.PORT ?? "3000");
  if (!parsed.success) throw new Error("PORT는 1~65535 사이의 정수여야 합니다.");
  return { host: "0.0.0.0", port: parsed.data };
}
