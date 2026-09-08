import { requireManagedClone } from "@/lib/agency-management";
import { trustedFormOrigin } from "@/lib/form-origin";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { orVision } from "@/lib/openrouter";

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return NextResponse.json({error:"Untrusted request origin"},{status:403});
  const fd = await req.formData();
  const file = fd.get("file") as File | null;
  const cloneId = fd.get("clone_id") as string | null;
  try { await requireManagedClone(cloneId); } catch { return NextResponse.json({error:"Creator access denied"},{status:403}); }
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

  let model = "qwen/qwen2.5-vl-72b-instruct";
  if (cloneId) {
    const { data } = await supabaseAdmin
      .from("clones")
      .select("vision_model")
      .eq("id", cloneId)
      .maybeSingle();
    if (data?.vision_model) model = data.vision_model;
  }

  // Resize to max 768px before sending — vision models don't need full res
  const bytes = Buffer.from(await file.arrayBuffer());
  const resized = await sharp(bytes).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${resized.toString("base64")}`;

  const text = await orVision({
    model,
    dataUrl,
    prompt: `Caption this photo for an AI girlfriend content bot. Return JSON only.
{
  "caption": "Brief factual description for AI matching, max 15 words. E.g. 'brunette in red lingerie lying on bed smiling seductively'",
  "teaser_caption": "Flirty first-person message she'd send with this photo, max 12 words, include one emoji. E.g. 'thought you'd like this one 😈'"
}`,
    json: true,
  });

  try {
    const { caption, teaser_caption } = JSON.parse(text);
    return NextResponse.json({ caption: caption ?? "", teaser_caption: teaser_caption ?? "" });
  } catch {
    return NextResponse.json({ error: "parse failed", text }, { status: 500 });
  }
}
