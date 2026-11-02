// Reads a video's display size and duration straight from its MP4 header, so
// sendPaidMedia can tell Telegram the real shape. Without width/height a paid
// video renders as a small square locked box instead of a full portrait card
// (2026-09-26, Dan/Alanna JOI parts). Pure byte walk, no ffprobe on the box.
// Returns null on anything it cannot read; callers then send without dims.

export interface VideoDims {
  width: number;
  height: number;
  duration: number;
}

const CONTAINERS = new Set(["moov", "trak", "mdia"]);

function boxes(buf: Buffer, start: number, end: number): Array<{ type: string; body: number; end: number }> {
  const out: Array<{ type: string; body: number; end: number }> = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = Number(buf.readBigUInt64BE(p + 8));
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) break;
    out.push({ type, body: p + header, end: p + size });
    p += size;
  }
  return out;
}

export function readMp4Dims(buf: Buffer): VideoDims | null {
  try {
    const moov = boxes(buf, 0, buf.length).find((b) => b.type === "moov");
    if (!moov) return null;
    let duration = 0;
    for (const b of boxes(buf, moov.body, moov.end)) {
      if (b.type === "mvhd") {
        const v = buf[b.body];
        const timescale = v === 1 ? buf.readUInt32BE(b.body + 20) : buf.readUInt32BE(b.body + 12);
        const dur = v === 1 ? Number(buf.readBigUInt64BE(b.body + 24)) : buf.readUInt32BE(b.body + 16);
        if (timescale > 0) duration = Math.round(dur / timescale);
      }
      if (b.type !== "trak") continue;
      const trak = boxes(buf, b.body, b.end);
      const mdia = trak.find((x) => x.type === "mdia");
      const hdlr = mdia && boxes(buf, mdia.body, mdia.end).find((x) => x.type === "hdlr");
      if (!hdlr || buf.toString("latin1", hdlr.body + 8, hdlr.body + 12) !== "vide") continue;
      const tkhd = trak.find((x) => x.type === "tkhd");
      if (!tkhd) continue;
      let width = buf.readUInt32BE(tkhd.end - 8) >>> 16;
      let height = buf.readUInt32BE(tkhd.end - 4) >>> 16;
      // Matrix sits 36 bytes before width/height; a 90/270 rotation has a=0.
      const a = buf.readInt32BE(tkhd.end - 8 - 36);
      if (a === 0) [width, height] = [height, width];
      if (width > 0 && height > 0) return { width, height, duration };
    }
    return null;
  } catch {
    return null;
  }
}

