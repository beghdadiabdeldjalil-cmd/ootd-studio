import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const VALID_PROVIDERS = ["tavily", "serper", "apiserpent", "openrouter"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

// GET /api/keys — return all stored keys (masked)
export async function GET() {
  try {
    const keys = await db.apiKey.findMany({
      where: { provider: { in: VALID_PROVIDERS as unknown as string[] } },
    });

    const result: Record<string, { masked: string; configured: boolean }> = {};
    for (const p of VALID_PROVIDERS) {
      const found = keys.find((k) => k.provider === p);
      result[p] = {
        masked: found ? maskKey(found.keyValue) : "",
        configured: !!found,
      };
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/keys error", e);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// PUT /api/keys — save one or more API keys
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: Partial<Record<Provider, string>> = body?.keys;

    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "keys object is required" }, { status: 400 });
    }

    const results: string[] = [];

    for (const [provider, keyValue] of Object.entries(updates)) {
      if (!VALID_PROVIDERS.includes(provider as Provider)) {
        continue;
      }

      const value = String(keyValue).trim();

      // If value is empty, delete the key
      if (!value) {
        await db.apiKey.deleteMany({ where: { provider } });
        results.push(`${provider}: removed`);
        continue;
      }

      // Upsert the key
      await db.apiKey.upsert({
        where: { provider },
        update: { keyValue: value },
        create: { provider, keyValue: value },
      });
      results.push(`${provider}: saved`);
    }

    return NextResponse.json({ ok: true, updated: results });
  } catch (e) {
    console.error("PUT /api/keys error", e);
    return NextResponse.json({ error: "Failed to save keys" }, { status: 500 });
  }
}
