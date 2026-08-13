import { supabaseAdmin } from "@/lib/supabase";

// The Twin version the operator sees (migration 117).
//
// OPERATOR ASK, 2026-08-13: "somewhere in sidebar or dash screen to show what
// version of twin were on... and a pop up saying twin update x v x, and the
// small description there too, for the first time a user opens the dash after
// an update. Updates go up in format 0.0.0."
//
// ONE SOURCE OF TRUTH, and it is the database, not a constant in this repo.
// A version baked into the code would say whatever the last dashboard BUILD
// said, which is a different thing from what is actually live: the bot ships
// separately, and this project has already served two boxes 25-hour-old images
// while believing otherwise. A row written by tools/twin-release.ts when a
// release is actually cut cannot drift that way.
//
// ORDERED BY THE INTEGER COLUMNS, never the string: '0.10.0' sorts before
// '0.9.0' as text, and showing the wrong number is the single thing this
// module exists to prevent.

export type TwinVersion = {
  version: string;
  name: string;
  summary: string;
  body: string;
  releasedAt: string;
};

export async function getTwinVersion(): Promise<TwinVersion | null> {
  try {
    const { data } = await supabaseAdmin
      .from("twin_versions")
      .select("version,name,summary,body,released_at")
      .order("major", { ascending: false })
      .order("minor", { ascending: false })
      .order("patch", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      version: data.version,
      name: data.name ?? "",
      summary: data.summary ?? "",
      body: data.body ?? "",
      releasedAt: data.released_at,
    };
  } catch {
    // Never break the app shell over a version chip. No row, no table yet, or a
    // Supabase blip all render as "no version", which is what the chip already
    // handles.
    return null;
  }
}
