// Burns the visible part of a story (caption text, a button, a dark scrim)
// into a 1080x1920 photo. The Bot API has no link sticker and no text layer,
// so this is the only way a story can show a button; lib/posting.ts then
// shrinks the invisible link area to sit exactly over the rect computed here.
//
// Server-side, with sharp only:
//   - the scrim and the button shape are SVG with NO text in it, so they need
//     no fonts at all;
//   - every glyph is drawn by sharp's own text renderer (Pango) from the TTF
//     bundled in public/fonts. The prod image is node:alpine with no system
//     fonts, so nothing here may depend on one. FONT_FILE is resolved from
//     process.cwd() (the standalone server runs from /app, and the Dockerfile
//     already copies public/ to /app/public), so NO Dockerfile change is needed.
//
// Layout (computeLayout) is pure arithmetic on measured text sizes, so the
// checks can prove the geometry without rendering a pixel.

import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  PostingInputError,
  STORY_H,
  STORY_W,
  overlayLinkArea,
  type OverlayButton,
  type OverlayCaption,
  type OverlaySlot,
  type OverlaySpec,
  type PxRect,
} from "./posting-validate";

// ── font ─────────────────────────────────────────────────────────────────────
const FONT_REL = path.join("public", "fonts", "LiberationSans-Bold.ttf");
const FONT_FAMILY = "Liberation Sans Bold";

export function fontFile(): string {
  // STORY_FONT_FILE overrides for odd deployments; otherwise public/fonts under
  // the working directory (/app in the image, the repo root for scripts).
  const candidates = [process.env.STORY_FONT_FILE, path.join(process.cwd(), FONT_REL)].filter((c): c is string => Boolean(c));
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`story overlay font missing, looked for ${candidates.join(" and ")}`);
}

// ── layout constants (1080x1920 canvas, measured from the finished stories) ──
export const LAYOUT = {
  marginX: 24,
  maxButtonW: Math.round(STORY_W * 0.9),
  maxCaptionW: Math.round(STORY_W * 0.86),
  minButtonSize: 32,
  minCaptionSize: 28,
  gap: 40, // caption ink bottom to button top
  // Safe zones: Telegram draws its header over the top ~230px and the reply
  // bar over the bottom ~130px. The finished look sits its pill at 1670-1790.
  topEdge: 230,
  bottomEdge: 1790,
  middleCentre: 960,
  captionMaxLines: 3,
};

export type TextBox = { w: number; h: number };
export type Layout = {
  button: (PxRect & { radius: number; fontPx: number; textX: number; textY: number }) | null;
  caption: (PxRect & { fontPx: number }) | null;
  scrim: PxRect | null;
};

const radiusFor = (shape: OverlayButton["shape"], h: number) => (shape === "pill" ? h / 2 : shape === "rounded" ? Math.round(h * 0.28) : 6);
export const buttonHeight = (fontPx: number) => Math.round(fontPx * 2.4);
export const buttonPadX = (fontPx: number) => Math.round(fontPx * 1.2);

// Pure. `btn` and `cap` are the measured ink sizes of the label and caption at
// the font sizes in `sizes` (the render loop shrinks them until they fit).
export function computeLayout(
  spec: OverlaySpec,
  m: { label?: TextBox; caption?: TextBox },
  sizes: { button?: number; caption?: number },
): Layout {
  const btn = spec.button;
  const cap = spec.caption;
  let button: Layout["button"] = null;
  let caption: Layout["caption"] = null;

  const bFont = sizes.button ?? btn?.size ?? 0;
  const bW = btn && m.label ? m.label.w + 2 * buttonPadX(bFont) : 0;
  const bH = btn ? buttonHeight(bFont) : 0;
  const cW = cap && m.caption ? m.caption.w : 0;
  const cH = cap && m.caption ? m.caption.h : 0;

  // Stacks per slot: caption above button when both sit in the same slot.
  const sameSlot = btn && cap && btn.position === cap.position;
  const stackH = sameSlot ? cH + LAYOUT.gap + bH : 0;

  const placeStack = (slot: OverlaySlot, height: number): number => {
    if (slot === "top") return LAYOUT.topEdge;
    if (slot === "bottom") return LAYOUT.bottomEdge - height;
    return Math.round(LAYOUT.middleCentre - height / 2);
  };

  if (sameSlot) {
    const top = placeStack(btn!.position, stackH);
    caption = { x: Math.round((STORY_W - cW) / 2), y: top, w: cW, h: cH, fontPx: sizes.caption ?? cap!.size };
    button = placeButton(btn!, bW, bH, top + cH + LAYOUT.gap, bFont, m.label!);
  } else {
    if (btn) button = placeButton(btn, bW, bH, placeStack(btn.position, bH), bFont, m.label!);
    if (cap) caption = { x: Math.round((STORY_W - cW) / 2), y: placeStack(cap.position, cH), w: cW, h: cH, fontPx: sizes.caption ?? cap.size };
  }

  let scrim: PxRect | null = null;
  if (spec.scrim) {
    const h = Math.round((STORY_H * spec.scrim.heightPct) / 100);
    scrim = { x: 0, y: spec.scrim.position === "bottom" ? STORY_H - h : 0, w: STORY_W, h };
  }
  return { button, caption, scrim };
}

function placeButton(b: OverlayButton, w: number, h: number, y: number, fontPx: number, label: TextBox): NonNullable<Layout["button"]> {
  const x = Math.round((STORY_W - w) / 2);
  return {
    x,
    y,
    w,
    h,
    radius: radiusFor(b.shape, h),
    fontPx,
    textX: x + Math.round((w - label.w) / 2),
    textY: y + Math.round((h - label.h) / 2),
  };
}

// Every rect the layout produced stays on the canvas, inside the side margins.
export function layoutInBounds(l: Layout): string | null {
  for (const [name, r] of [["button", l.button], ["caption", l.caption]] as const) {
    if (!r) continue;
    if (r.x < LAYOUT.marginX || r.x + r.w > STORY_W - LAYOUT.marginX) return `${name} runs off the side of the story`;
    if (r.y < 0 || r.y + r.h > STORY_H) return `${name} runs off the top or bottom of the story`;
  }
  return null;
}

// ── text drawing ─────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type TextImage = { png: Buffer; w: number; h: number };

async function drawText(text: string, px: number, color: string, wrapWidth?: number): Promise<TextImage> {
  const markup = `<span foreground="${color}">${esc(text)}</span>`;
  const { data, info } = await sharp({
    text: {
      text: markup,
      font: `${FONT_FAMILY} ${px}`,
      fontfile: fontFile(),
      rgba: true,
      dpi: 72,
      ...(wrapWidth ? { width: wrapWidth, align: "centre" as const, wrap: "word" as const } : {}),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { png: data, w: info.width, h: info.height };
}

// Outline and soft shadow behind a caption, all from the same glyphs.
async function drawOutlined(c: OverlayCaption, px: number, wrapWidth: number): Promise<{ png: Buffer; pad: number; w: number; h: number }> {
  const fill = await drawText(c.text, px, c.color, wrapWidth);
  const stroke = c.strokeWidth > 0 || c.shadow ? await drawText(c.text, px, c.strokeColor, wrapWidth) : null;
  const sw = c.strokeWidth;
  const shadowReach = c.shadow ? Math.round(px * 0.12) + 8 : 0;
  const pad = Math.max(sw, 0) + shadowReach + 2;
  const W = fill.w + 2 * pad;
  const H = fill.h + 2 * pad;
  const layers: sharp.OverlayOptions[] = [];

  if (stroke && c.shadow) {
    const sigma = Math.max(2, px * 0.05);
    const blurred = await sharp(stroke.png)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .blur(sigma)
      .linear([1, 1, 1, 0.75], [0, 0, 0, 0])
      .png()
      .toBuffer();
    layers.push({ input: blurred, left: 0, top: Math.round(px * 0.06) });
  }
  if (stroke && sw > 0) {
    const steps = Math.max(16, sw * 8);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      layers.push({ input: stroke.png, left: pad + Math.round(Math.cos(a) * sw), top: pad + Math.round(Math.sin(a) * sw) });
    }
  }
  layers.push({ input: fill.png, left: pad, top: pad });

  const png = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
  return { png, pad, w: fill.w, h: fill.h };
}

const labelText = (b: OverlayButton) => (b.arrow ? `${b.label}  ›` : b.label);

// ── render ───────────────────────────────────────────────────────────────────
export type OverlayGeometry = {
  canvas: { w: number; h: number };
  button: { x: number; y: number; w: number; h: number; radius: number; fontPx: number } | null;
  caption: { x: number; y: number; w: number; h: number; fontPx: number } | null;
  scrim: PxRect | null;
  // The Bot API StoryArea to send. null when the overlay has no button (the
  // caller then keeps the plain default link area).
  linkArea: ReturnType<typeof overlayLinkArea> | null;
};

export type RenderedStory = { bytes: Buffer; geometry: OverlayGeometry };

// Crop (or verify) the photo to 1080x1920, then burn the overlay in the same
// sharp pipeline so the JPEG is only encoded once. `linkUrl` is needed to build
// the link area; pass "" when there is no button.
export async function renderStoryOverlay(input: Buffer, spec: OverlaySpec, opts: { fit: boolean; linkUrl: string | null }): Promise<RenderedStory> {
  let base = sharp(input).rotate();
  if (opts.fit) {
    base = base.resize(STORY_W, STORY_H, { fit: "cover", position: sharp.strategy.attention });
  } else {
    const meta = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
    if (meta.info.width !== STORY_W || meta.info.height !== STORY_H) {
      throw new PostingInputError(`overlay with fit=false needs an exact ${STORY_W}x${STORY_H} image, this one is ${meta.info.width}x${meta.info.height}; leave fit on to crop it`);
    }
  }

  // Measure at the requested sizes, shrink until it fits the width.
  let bFont = spec.button?.size ?? 0;
  let label: TextImage | null = null;
  if (spec.button) {
    for (;;) {
      label = await drawText(labelText(spec.button), bFont, spec.button.textColor);
      const w = label.w + 2 * buttonPadX(bFont);
      if (w <= LAYOUT.maxButtonW) break;
      if (bFont <= LAYOUT.minButtonSize) {
        throw new PostingInputError(`overlay.button label "${spec.button.label}" is too wide even at ${LAYOUT.minButtonSize}px, shorten it`);
      }
      bFont = Math.max(LAYOUT.minButtonSize, bFont - 2);
    }
  }

  let cFont = spec.caption?.size ?? 0;
  let cap: { png: Buffer; pad: number; w: number; h: number } | null = null;
  if (spec.caption) {
    for (;;) {
      cap = await drawOutlined(spec.caption, cFont, LAYOUT.maxCaptionW);
      const lines = Math.round(cap.h / (cFont * 1.15));
      if (cap.w <= LAYOUT.maxCaptionW && lines <= LAYOUT.captionMaxLines) break;
      if (cFont <= LAYOUT.minCaptionSize) {
        throw new PostingInputError(`overlay.caption is too long for ${LAYOUT.captionMaxLines} lines even at ${LAYOUT.minCaptionSize}px, shorten it`);
      }
      cFont = Math.max(LAYOUT.minCaptionSize, cFont - 2);
    }
  }

  const layout = computeLayout(spec, { label: label ?? undefined, caption: cap ?? undefined }, { button: bFont, caption: cFont });
  const oob = layoutInBounds(layout);
  if (oob) throw new PostingInputError(`overlay does not fit: ${oob}`);

  const layers: sharp.OverlayOptions[] = [];

  if (spec.scrim && layout.scrim) {
    const s = spec.scrim;
    // Smooth ramp: transparent at the photo side, `opacity` at the edge.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.scrim.w}" height="${layout.scrim.h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${s.color}" stop-opacity="${s.position === "bottom" ? 0 : s.opacity}"/>
<stop offset="1" stop-color="${s.color}" stop-opacity="${s.position === "bottom" ? s.opacity : 0}"/>
</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    layers.push({ input: Buffer.from(svg), left: layout.scrim.x, top: layout.scrim.y });
  }

  if (spec.button && layout.button && label) {
    const b = layout.button;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}"><rect width="${b.w}" height="${b.h}" rx="${b.radius}" ry="${b.radius}" fill="${spec.button.background}"/></svg>`;
    layers.push({ input: Buffer.from(svg), left: b.x, top: b.y });
    layers.push({ input: label.png, left: b.textX, top: b.textY });
  }

  if (spec.caption && layout.caption && cap) {
    layers.push({ input: cap.png, left: layout.caption.x - cap.pad, top: layout.caption.y - cap.pad });
  }

  const bytes = await base.composite(layers).jpeg({ quality: 90 }).toBuffer();

  const geometry: OverlayGeometry = {
    canvas: { w: STORY_W, h: STORY_H },
    button: layout.button
      ? { x: layout.button.x, y: layout.button.y, w: layout.button.w, h: layout.button.h, radius: layout.button.radius, fontPx: layout.button.fontPx }
      : null,
    caption: layout.caption,
    scrim: layout.scrim,
    linkArea: layout.button ? overlayLinkArea(layout.button, layout.button.radius, opts.linkUrl ?? "") : null,
  };
  return { bytes, geometry };
}
