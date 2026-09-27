import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { validBlur } from './catalogue-core';

const run = promisify(execFile);
export const MAX_VIDEO_PREVIEW_BYTES = 2 * 1024 * 1024;

// Local files only: uploaded media cannot make ffmpeg fetch another URL or playlist.
const inputOptions = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi'];
export async function createVideoPreview(input: string, output: string, blur: number): Promise<void> {
  if (!validBlur(blur)) throw new Error('Preview unavailable.');
  try {
    const probe = await run('ffprobe', ['-v', 'error', ...inputOptions, '-select_streams', 'v:0',
      '-show_entries', 'format=duration:stream=width,height', '-of', 'json', input],
      { timeout: 8_000, maxBuffer: 64 * 1024 });
    const metadata = JSON.parse(probe.stdout);
    const duration = Number(metadata.format?.duration), stream = metadata.streams?.[0];
    if (!Number.isFinite(duration) || duration <= 0 || !stream || stream.width * stream.height > 40_000_000)
      throw new Error('Invalid video');
    // Fixed excerpt, never fan-selected offsets: repeated requests cannot reconstruct the full video.
    // A short upload exposes at most one quarter of its running time, still blurred.
    const seconds = Math.min(5, duration / 4);
    const scale = "scale=w='max(2,if(gt(dar,0.75),420,trunc(560*dar/2)*2))':h='max(2,if(gt(dar,0.75),trunc(420/dar/2)*2,560))',setsar=1";
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      ...inputOptions, '-threads', '1', '-ss', String(duration * 0.2), '-i', input,
      '-t', String(seconds), '-map', '0:v:0', '-an', '-sn', '-dn',
      '-map_metadata', '-1', '-map_chapters', '-1', '-filter_threads', '1',
      '-vf', `fps=12,${scale},gblur=sigma=${blur}:steps=2`,
      '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast', '-crf', '27',
      '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level', '3.0',
      '-movflags', '+faststart', '-fs', String(MAX_VIDEO_PREVIEW_BYTES), output],
      { timeout: 25_000, maxBuffer: 64 * 1024 });
    const result = await stat(output);
    if (result.size < 100 || result.size > MAX_VIDEO_PREVIEW_BYTES) throw new Error('Invalid preview');
  } catch { throw new Error('Preview unavailable.'); }
}
