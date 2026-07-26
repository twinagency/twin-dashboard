import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { orVision } from "./openrouter";
import { MEDIA_TAGS } from "./pricing";

const execFileAsync = promisify(execFile);

export type Caption = {
  caption: string;          // factual description for AI matching
  teaser_caption: string;   // flirty message shown to the fan (varied emoji)
  is_nude: boolean;
  explicitness: "none" | "suggestive" | "explicit";
  // AI auto-tags — drive both live media matching and category pricing.
  nsfw: boolean;            // is it sexually explicit?
  tags: string[];          // subset of MEDIA_TAGS describing what's shown
  auto_desc: string;       // very short description, e.g. "bikini pool"
};

const TAG_SET = new Set<string>(MEDIA_TAGS);

const PROMPT = `You are tagging a photo for an AI girlfriend content bot. Return JSON only:
{
  "caption": "Factual description for AI matching, max 18 words. Note clothing/nudity/pose plainly. E.g. 'topless brunette kneeling on bed, hand in hair, looking at camera'",
  "teaser_caption": "A flirty first-person message she'd send WITH this photo, max 12 words. End with ONE emoji that FITS this specific photo's mood - vary it (a heart 💕, a flirt 😏😈, a fire 🔥, a kiss 😘, etc). Do NOT default to the same emoji every time.",
  "is_nude": true or false (true if breasts/genitals/buttocks are exposed),
  "explicitness": "none" | "suggestive" | "explicit"  (none = fully clothed/safe, suggestive = lingerie/implied/teasing, explicit = nudity or sexual),
  "nsfw": true or false (true if it is sexually explicit content),
  "tags": ["subset of this FIXED vocabulary that applies, or []: ${MEDIA_TAGS.join(", ")}"],
  "auto_desc": "2-4 word summary of what's shown, e.g. 'bikini pool' or 'topless bed'"
}
Only use tags from the vocabulary above; never invent new ones.`;

const FALLBACK: Caption = {
  caption: "",
  teaser_caption: "",
  is_nude: false,
  explicitness: "none",
  nsfw: false,
  tags: [],
  auto_desc: "",
};

async function visionCaption(jpegBytes: Buffer, model: string): Promise<Caption> {
  const dataUrl = `data:image/jpeg;base64,${jpegBytes.toString("base64")}`;
  const raw = await orVision({ model, dataUrl, prompt: PROMPT, json: true });
  try {
    const j = JSON.parse(raw);
    const explicitness: Caption["explicitness"] =
      j.explicitness === "explicit" || j.explicitness === "suggestive" ? j.explicitness : "none";
    // Keep only known-vocabulary tags (deduped) so the pricing/matching stays clean.
    const rawTags: unknown[] = Array.isArray(j.tags) ? j.tags : [];
    const tags = [...new Set(rawTags.filter((t): t is string => typeof t === "string" && TAG_SET.has(t)))];
    return {
      caption: typeof j.caption === "string" ? j.caption : "",
      teaser_caption: typeof j.teaser_caption === "string" ? j.teaser_caption : "",
      is_nude: !!j.is_nude,
      explicitness,
      nsfw: typeof j.nsfw === "boolean" ? j.nsfw : explicitness === "explicit",
      tags,
      auto_desc: typeof j.auto_desc === "string" ? j.auto_desc : "",
    };
  } catch {
    return FALLBACK;
  }
}

// Caption a photo: downscale to 768px, then vision.
export async function captionPhoto(bytes: Buffer, model: string): Promise<Caption> {
  const resized = await sharp(bytes).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return visionCaption(resized, model);
}

// Caption a video: pull one frame ~1s in via ffmpeg, then vision on that frame.
export async function captionVideo(bytes: Buffer, model: string): Promise<Caption> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const inPath = path.join(tmpdir(), `cap-${stamp}.mp4`);
  const outPath = path.join(tmpdir(), `cap-${stamp}.jpg`);
  try {
    await writeFile(inPath, bytes);
    await execFileAsync("ffmpeg", ["-y", "-ss", "00:00:01", "-i", inPath, "-vframes", "1", "-vf", "scale=768:-1", outPath]);
    const frame = await readFile(outPath);
    return await visionCaption(frame, model);
  } catch {
    return FALLBACK;
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}
