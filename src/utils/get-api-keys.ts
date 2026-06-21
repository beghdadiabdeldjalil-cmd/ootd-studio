import { db } from "@/lib/db";

export type ApiKeys = {
  tavily?: string;
  serper?: string;
  apiserpent?: string;
  openrouter?: string;
};

const VALID_PROVIDERS = ["tavily", "serper", "apiserpent", "openrouter"] as const;

/**
 * Fetch API keys from the database.
 * Env vars take priority — if an env var is set, it overrides the DB value.
 */
export async function getApiKeys(): Promise<ApiKeys> {
  let dbKeys: ApiKeys = {};

  try {
    const rows = await db.apiKey.findMany();
    for (const row of rows) {
      if ((VALID_PROVIDERS as readonly string[]).includes(row.provider)) {
        (dbKeys as Record<string, string>)[row.provider] = row.keyValue;
      }
    }
  } catch {
    // DB might not be available, just use env vars
  }

  return {
    tavily: process.env.TAVILY_API_KEY || dbKeys.tavily,
    serper: process.env.SERPER_API_KEY || dbKeys.serper,
    apiserpent: process.env.APISERPENT_API_KEY || dbKeys.apiserpent,
    openrouter: process.env.OPENROUTER_API_KEY || dbKeys.openrouter,
  };
}
