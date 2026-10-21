import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { serviceClient } from '../lib/supabase-service';
import { videoPreviewSources } from '../lib/catalogue-video-preview';
import { readCatalogueInventory, auditCataloguePreviews, type AuditVideo } from '../lib/catalogue-preview-audit';
const run=promisify(execFile);
async function main(){
 // This smoke check only prepares/reads private preview derivatives. It never sends media or charges a fan.
 const db=serviceClient();
 const inventory=await readCatalogueInventory(db),inventoryOnly=process.argv.includes('--inventory-only');
 const maxRunMs=Number(process.env.CATALOGUE_PREVIEW_MAX_MS||360000);
 if(!Number.isFinite(maxRunMs)||maxRunMs<1000||maxRunMs>1800000)throw new Error('Invalid audit duration');
 async function check(item:AuditVideo,blur:number){
   const dir=await mkdtemp(join(tmpdir(),'preview-check-'));
   try{
    const sources=await videoPreviewSources(item.storage_path,blur);
    if(!Number.isFinite(sources.durationSeconds)||sources.durationSeconds!<=0)throw new Error('Full video duration unavailable');
    const range=await fetch(sources.url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(20_000)});
    await range.body?.cancel();if(range.status!==206)throw new Error('Video range request failed');
    const [clip,poster]=await Promise.all([fetch(sources.url,{signal:AbortSignal.timeout(20_000)}),fetch(sources.posterUrl,{signal:AbortSignal.timeout(20_000)})]);
    if(!clip.ok||!poster.ok)throw new Error('Preview delivery failed');
    if(!clip.headers.get('content-type')?.includes('video/mp4'))throw new Error('Wrong video content type');
    const filename=join(dir,'preview.mp4');await writeFile(filename,Buffer.from(await clip.arrayBuffer()));
    const meta=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',filename],{timeout:8_000})).stdout);
    if(meta.streams.length!==1||meta.streams[0].codec_name!=='h264'||Math.abs(Number(meta.format.duration)-5)>.1)throw new Error('Invalid preview encoding');
    const image=await sharp(Buffer.from(await poster.arrayBuffer())).metadata();if(image.format!=='webp')throw new Error('Invalid poster');
   }
   finally{await rm(dir,{recursive:true,force:true});}
 }
 let checked=0;
 const report=await auditCataloguePreviews(inventory,check,{inventoryOnly,maxRunMs,onProgress:()=>{if(++checked%20===0)console.log(JSON.stringify({event:'audit_progress',checked,total:inventory.videos.length}));}});
 const reportFile=join(tmpdir(),'catalogue-preview-audit.json');
 await writeFile(reportFile,JSON.stringify(report),{mode:0o600});
 const {results,failures,...summary}=report;
 console.log(JSON.stringify({...summary,reportFile,creatorsWithFailures:results.filter(row=>row.failed).length,failures:failures.slice(0,20),failuresTruncated:failures.length>20}));
 if(report.failed||!inventoryOnly&&!report.verificationComplete)process.exitCode=1;
}
if(process.env.CATALOGUE_PREVIEW_CHECK_LOAD_ONLY!=='1'){
 main().catch(()=>{console.error('Live video preview check could not complete');process.exitCode=1;});
}
