import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type OrModel = { id: string; name: string; prompt: number; completion: number };

// Cache the OpenRouter catalogue in-process for an hour (it's ~300 models).
let cache: { at: number; models: OrModel[] } | null = null;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 3_600_000) {
      const r = await fetch("https://openrouter.ai/api/v1/models");
      const j = await r.json();
      // Cache only a real catalogue: a 429/5xx body has no `data` and must not pin [] for an hour.
      if (!r.ok || !Array.isArray(j?.data) || !j.data.length) throw new Error(`OpenRouter models ${r.status}`);
      const models: OrModel[] = (j.data ?? [])
        .map((m: any) => ({
          id: m.id,
          name: m.name ?? m.id,
          prompt: Number(m.pricing?.prompt ?? 0),
          completion: Number(m.pricing?.completion ?? 0),
        }))
        .sort((a: OrModel, b: OrModel) => a.name.localeCompare(b.name));
      cache = { at: Date.now(), models };
    }
    return NextResponse.json(cache.models);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to load models" },
      { status: 502 },
    );
  }
}
