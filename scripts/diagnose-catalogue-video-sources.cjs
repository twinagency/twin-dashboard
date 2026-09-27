// Read-only diagnosis of the four preview failures. No media or credentials are logged.
const {mkdtemp,writeFile,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const ids=['939f5799-692e-4feb-ab88-ec75e0fbcf56','a55c1149-7f81-43e2-9b4a-9d523dfe35fb','b5a18847-7c8a-43ee-8200-86b1c957436e','e0ea6098-1628-4365-b276-d559f3a1cbbd'];
async function main(){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_KEY;
 const headers={apikey:key,Authorization:`Bearer ${key}`};
 const inventory=await fetch(`${base}/rest/v1/videos?select=id,storage_path&id=in.(${ids.join(',')})`,{headers});
 if(!inventory.ok)throw Error('Inventory failed');
 for(const item of await inventory.json()){
  const dir=await mkdtemp(join(tmpdir(),'video-diagnosis-'));
  try{
   const response=await fetch(`${base}/storage/v1/object/authenticated/media/${item.storage_path.split('/').map(encodeURIComponent).join('/')}`,{headers,signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error('Download failed');
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>50*1024*1024)throw Error('Source oversized');
   const input=join(dir,'source');await writeFile(input,bytes,{mode:0o600});
   let result={id:item.id,bytes:bytes.length,header:bytes.subarray(0,16).toString('hex')};
   for(const [label,formats] of [['current','mov,matroska,webm,avi'],['videoFormats','mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,mpegts,mpeg,mjpeg']]){
    try{
     const data=await run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-format_whitelist',formats,'-select_streams','v:0','-show_entries','format=format_name,duration:stream=codec_name,width,height','-of','json',input],{timeout:15000,maxBuffer:64000});
     result[label]=JSON.parse(data.stdout);
    }catch(error){
     const err=String(error.stderr||'');
     result[label]={failed:true,timeout:!!error.killed,missingMoov:/moov atom not found/i.test(err),notWhitelisted:/not on whitelist/i.test(err),invalidData:/Invalid data found/i.test(err),decoderMissing:/Unknown decoder|Decoder.*not found|Unsupported codec/i.test(err),ioError:/Input\/output error|End of file/i.test(err)};
    }
   }
   console.log(JSON.stringify(result));
  }finally{await rm(dir,{recursive:true,force:true});}
 }
}
main().catch(()=>{console.error('Video source diagnosis failed');process.exitCode=1;});
