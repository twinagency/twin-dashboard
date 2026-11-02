import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVideoPreview, createVideoPoster, probeVideoSource, MAX_VIDEO_PREVIEW_BYTES } from '../lib/catalogue-video-transform';
import { formatVideoDuration, parseVideoSourceMetadata } from '../lib/catalogue-video-duration';
import sharp from 'sharp';
const run=promisify(execFile);
async function main(){
 const dir=await mkdtemp(join(tmpdir(),'catalogue-video-test-'));
 try {
  // Synthetic moving colour pattern + sound; no creator media or credentials involved.
  for(const [name,size,seconds] of [['portrait','300x400',24],['landscape','640x360',4]] as const){
   const input=join(dir,`${name}.mp4`),output=join(dir,`${name}-preview.mp4`);
   await run('ffmpeg',['-v','error','-y','-f','lavfi','-i',`testsrc2=size=${size}:rate=12`,'-f','lavfi','-i','sine=frequency=440','-t',String(seconds),'-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-metadata','comment=private-original-marker',input]);
   const originalDuration = await createVideoPreview(input,output,11);
   assert(Math.abs(originalDuration-seconds)<.1,'return full original duration, not five-second preview length');
   assert(Math.abs(await probeVideoSource(input)-seconds)<.1,'cached previews can retrieve original length without another encode');
   assert.equal(formatVideoDuration(originalDuration),name==='portrait'?'0:24':'0:04');
   const probe=JSON.parse((await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',output])).stdout);
   assert.equal(probe.streams.length,1,'no original audio or extra streams');
   const stream=probe.streams[0];assert.equal(stream.codec_name,'h264');assert.equal(stream.pix_fmt,'yuv420p');
   assert(stream.width<=420&&stream.height<=560);assert.equal(stream.sample_aspect_ratio,'1:1');
   assert(Math.abs(stream.width/stream.height-(name==='portrait'?.75:16/9))<.02,'keep original proportions');
   assert(Math.abs(Number(probe.format.duration)-5)<.1,'exactly five seconds, including looping shorter sources');
   assert(!JSON.stringify(probe).includes('private-original-marker'),'strip original metadata');
   const bytes=await readFile(output);assert(bytes.length<MAX_VIDEO_PREVIEW_BYTES);assert(bytes.indexOf('moov')<bytes.indexOf('mdat'),'fast-start MP4');
   const poster=join(dir,`${name}.webp`);await createVideoPoster(output,poster);const posterMeta=await sharp(poster).metadata();
   assert.equal(posterMeta.format,'webp');assert.equal(posterMeta.width,stream.width);assert.equal(posterMeta.height,stream.height);assert.equal(posterMeta.exif,undefined);
   // Both blur settings render actual moving frames, with different protected pixels.
   const heavy=join(dir,`${name}-heavy.mp4`);await createVideoPreview(input,heavy,30);assert.notDeepEqual(bytes,await readFile(heavy));
   const hashes=(await run('ffmpeg',['-v','error','-i',output,'-f','framemd5','-'])).stdout.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').pop());
   assert(new Set(hashes).size>2,'a moving clip rather than a repeated poster');
   await assert.rejects(createVideoPreview(input,output,0));
  }
  await assert.rejects(createVideoPreview(join(dir,'missing'),join(dir,'none.mp4'),11),/Preview unavailable/);
  assert.deepEqual(parseVideoSourceMetadata({version:1,durationSeconds:124.4}),{version:1,durationSeconds:124.4});
  for(const duration of [null,undefined,NaN,Infinity,0,-1,'125']) {
   assert.equal(parseVideoSourceMetadata({version:1,durationSeconds:duration}),null);
   assert.equal(formatVideoDuration(duration),null);
  }
  assert.equal(parseVideoSourceMetadata({version:2,durationSeconds:124}),null);
  assert.equal(formatVideoDuration(124.4),'2:04');assert.equal(formatVideoDuration(59.9),'1:00');assert.equal(formatVideoDuration(3605),'1:00:05');
  console.log('Video previews passed: moving H.264 excerpts, bounded duration/size, silent, blurred, metadata stripped, portrait/landscape proportions.');
 }finally{await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
