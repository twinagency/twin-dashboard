import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { validBlur } from './catalogue-core';
import { validVideoDuration } from './catalogue-video-duration';

const run = promisify(execFile);
export const MAX_VIDEO_PREVIEW_BYTES = 2 * 1024 * 1024;

// Local files only: uploaded media cannot make ffmpeg fetch another URL or playlist.
const inputOptions = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi'];
export async function probeVideoSource(input: string): Promise<number> {
  let stage = 'probe';
  try {
    const probe = await run('ffprobe', ['-v', 'error', ...inputOptions, '-select_streams', 'v:0',
      '-show_entries', 'format=duration:stream=width,height', '-of', 'json', input],
      { timeout: 15_000, maxBuffer: 64 * 1024 });
    stage = 'metadata';
    const metadata = JSON.parse(probe.stdout);
    const duration = Number(metadata.format?.duration), stream = metadata.streams?.[0];
    if (!validVideoDuration(duration) || !stream || stream.width * stream.height > 40_000_000)
      throw new Error('Invalid video');
    return duration;
  } catch (error) {
    const details = error as { killed?: boolean; signal?: string; code?: string };
    const reason = details.signal === 'SIGKILL' ? 'killed' : details.killed || details.code === 'ETIMEDOUT' ? 'timeout' : 'invalid';
    throw new Error('Preview unavailable.', { cause: { stage, reason } });
  }
}

export async function createVideoPreview(input: string, output: string, blur: number): Promise<number> {
  if (!validBlur(blur)) throw new Error('Preview unavailable.');
  let stage = 'probe';
  try {
    const duration = await probeVideoSource(input);
    // Fixed excerpt, never fan-selected offsets: repeated requests cannot reconstruct the full video.
    // Always five seconds. Very short originals loop, with the same server-side blur.
    const seconds = 5, start = Math.min(duration * 0.2, Math.max(0, duration - seconds));
    const scale = "scale=w='max(2,if(gt(dar,0.75),420,trunc(560*dar/2)*2))':h='max(2,if(gt(dar,0.75),trunc(420/dar/2)*2,560))',setsar=1";
    stage = 'encode';
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      ...inputOptions, '-threads', '1', '-stream_loop', '-1', '-ss', String(start), '-i', input,
      '-t', String(seconds), '-map', '0:v:0', '-an', '-sn', '-dn',
      '-map_metadata', '-1', '-map_chapters', '-1', '-filter_threads', '1',
      '-vf', `fps=12,${scale},gblur=sigma=${blur}:steps=2`,
      '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast', '-crf', '27',
      '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level', '3.0',
      '-movflags', '+faststart', '-fs', String(MAX_VIDEO_PREVIEW_BYTES), output],
      { timeout: 60_000, maxBuffer: 64 * 1024 });
    stage = 'output';
    const result = await stat(output);
    if (result.size < 100 || result.size > MAX_VIDEO_PREVIEW_BYTES) throw new Error('Invalid preview');
    return duration;
  } catch (error) {
    if (error instanceof Error && error.cause) throw error;
    const details = error as { killed?: boolean; signal?: string; code?: string };
    const reason = details.signal === 'SIGKILL' ? 'killed' : details.killed || details.code === 'ETIMEDOUT' ? 'timeout' : 'invalid';
    throw new Error('Preview unavailable.', { cause: { stage, reason } });
  }
}

export async function createVideoPoster(input: string, output: string): Promise<void> {
  try {
    // The poster comes from the already blurred excerpt, never from an original frame.
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...inputOptions,
      '-threads', '1', '-i', input, '-frames:v', '1', '-an', '-map_metadata', '-1',
      '-c:v', 'libwebp', '-quality', '75', '-threads', '1', output], { timeout: 8_000, maxBuffer: 64 * 1024 });
  } catch { throw new Error('Preview unavailable.'); }
}
