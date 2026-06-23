import { NextRequest, NextResponse } from "next/server";

const VALID_PROVIDERS = ["tavily", "serper", "apiserpent", "openrouter"] as const;

function maskKey(key: string): string {
  if (!key || key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

export async function GET() {
  const result: Record<string, { masked: string; configured: boolean }> = {};

  for (const provider of VALID_PROVIDERS) {
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    result[provider] = {
      masked: envKey ? maskKey(envKey) : "",
      configured: !!envKey,
    };
  }

  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  return NextResponse.json({
    success: false,
    error: "API keys are managed via Vercel environment variables. Update them in the Vercel dashboard.",
  });
}
