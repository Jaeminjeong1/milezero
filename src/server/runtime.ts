import { z } from "zod";

const PortSchema = z.coerce.number().int().min(1).max(65_535);

export function parseRuntimeConfig(
  env: { PORT?: string },
): { host: "0.0.0.0"; port: number } {
  const parsed = PortSchema.safeParse(env.PORT ?? "3000");
  if (!parsed.success) throw new Error("PORT는 1~65535 사이의 정수여야 합니다.");
  return { host: "0.0.0.0", port: parsed.data };
}

export function parseCorsOrigins(env: { CORS_ORIGINS?: string }): string[] {
  if (!env.CORS_ORIGINS?.trim()) return [];

  try {
    return [
      ...new Set(
        env.CORS_ORIGINS.split(",").map((rawOrigin) => {
          const origin = rawOrigin.trim();
          const parsed = new URL(origin);
          if (
            !["http:", "https:"].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password ||
            parsed.origin !== origin
          ) {
            throw new Error("invalid origin");
          }
          return parsed.origin;
        }),
      ),
    ];
  } catch {
    throw new Error(
      "CORS_ORIGINS는 경로가 없는 http(s) origin을 쉼표로 구분해야 합니다.",
    );
  }
}
