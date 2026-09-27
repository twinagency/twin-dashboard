import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { serviceClient } from '../lib/supabase-service';
import { videoPreviewSources } from '../lib/catalogue-video-preview';
const run=promisify(execFile);
async function main(){
 // This smoke check only prepares/reads private preview derivatives. It never sends media or charges a fan.
 const db=serviceClient();
 const clone=await db.from('clones').select('id').eq('slug','briana-redd').single();
 if(clone.error)throw new Error('Creator lookup failed');
 const [settings,videos]=await Promise.all([
  db.from('creator_catalogue_settings').select('blur_strength').eq('clone_id',clone.data.id).single(),
  db.from('videos').select('id,storage_path').eq('clone_id',clone.data.id).limit(1000),
 ]);
 if(settings.error||videos.error||!videos.data?.length)throw new Error('Preview inventory unavailable');
 let next=0,passed=0,failed=0;
 async function worker(){
  for(;;){const index=next++;const item=videos.data![index];if(!item)return;
   const dir=await mkdtemp(join(tmpdir(),'preview-check-'));
   try{
    const sources=await videoPreviewSources(item.storage_path,settings.data!.blur_strength);
    const range=await fetch(sources.url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(20_000)});
    await range.body?.cancel();if(range.status!==206)throw new Error('Video range request failed');
    const [clip,poster]=await Promise.all([fetch(sources.url,{signal:AbortSignal.timeout(20_000)}),fetch(sources.posterUrl,{signal:AbortSignal.timeout(20_000)})]);
    if(!clip.ok||!poster.ok)throw new Error('Preview delivery failed');
    if(!clip.headers.get('content-type')?.includes('video/mp4'))throw new Error('Wrong video content type');
    const filename=join(dir,'preview.mp4');await writeFile(filename,Buffer.from(await clip.arrayBuffer()));
    const meta=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',filename],{timeout:8_000})).stdout);
    if(meta.streams.length!==1||meta.streams[0].codec_name!=='h264'||Math.abs(Number(meta.format.duration)-5)>.1)throw new Error('Invalid preview encoding');
    const image=await sharp(Buffer.from(await poster.arrayBuffer())).metadata();if(image.format!=='webp')throw new Error('Invalid poster');
    passed++;console.log(`Video preview verified ${passed}/${videos.data!.length}: 5s, H.264, poster and HTTP 206`);
   }catch(error){
    failed++;
    const cause=error instanceof Error ? error.cause as {stage?:string;reason?:string}|undefined : undefined;
    const stage=['download','probe','metadata','encode','output','poster','upload'].includes(cause?.stage||'')?cause!.stage:'verification';
    const reason=['timeout','killed','invalid'].includes(cause?.reason||'')?cause!.reason:'failed';
    console.error(`Video preview failed for item ${item.id}: ${stage}/${reason}`);
   }
   finally{await rm(dir,{recursive:true,force:true});}
  }
 }
 await Promise.all([worker(),worker()]);console.log(`Live video preview check: ${passed} passed, ${failed} failed`);
 if(failed)process.exitCode=1;
}
if(process.env.CATALOGUE_PREVIEW_CHECK_LOAD_ONLY!=='1'){
 main().catch(()=>{console.error('Live video preview check could not complete');process.exitCode=1;});
}
