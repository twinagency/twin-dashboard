#!/usr/bin/env python3
"""Read-only dashboard capacity and four-video diagnosis, through the existing SSM connection."""
import json, shutil, subprocess
VIDEO_CHECK = "// Read-only diagnosis of the four preview failures. No media or credentials are logged.\nconst {mkdtemp,writeFile,readFile,rm}=require('node:fs/promises');\nconst {tmpdir}=require('node:os');\nconst {join}=require('node:path');\nconst {execFile}=require('node:child_process');\nconst {promisify}=require('node:util');\nconst run=promisify(execFile);\nconst ids=['939f5799-692e-4feb-ab88-ec75e0fbcf56','a55c1149-7f81-43e2-9b4a-9d523dfe35fb','b5a18847-7c8a-43ee-8200-86b1c957436e','e0ea6098-1628-4365-b276-d559f3a1cbbd'];\nasync function main(){\n const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_KEY;\n const headers={apikey:key,Authorization:`Bearer ${key}`};\n const inventory=await fetch(`${base}/rest/v1/videos?select=id,storage_path&id=in.(${ids.join(',')})`,{headers});\n if(!inventory.ok)throw Error('Inventory failed');\n for(const item of await inventory.json()){\n  const dir=await mkdtemp(join(tmpdir(),'video-diagnosis-'));\n  try{\n   const response=await fetch(`${base}/storage/v1/object/authenticated/media/${item.storage_path.split('/').map(encodeURIComponent).join('/')}`,{headers,signal:AbortSignal.timeout(60000)});\n   if(!response.ok)throw Error('Download failed');\n   const bytes=Buffer.from(await response.arrayBuffer());\n   if(bytes.length>50*1024*1024)throw Error('Source oversized');\n   const input=join(dir,'source');await writeFile(input,bytes,{mode:0o600});\n   let result={id:item.id,bytes:bytes.length,header:bytes.subarray(0,16).toString('hex')};\n   for(const [label,formats] of [['current','mov,matroska,webm,avi'],['videoFormats','mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,mpegts,mpeg,mjpeg']]){\n    try{\n     const data=await run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-format_whitelist',formats,'-select_streams','v:0','-show_entries','format=format_name,duration:stream=codec_name,width,height','-of','json',input],{timeout:15000,maxBuffer:64000});\n     result[label]=JSON.parse(data.stdout);\n    }catch(error){\n     const err=String(error.stderr||'');\n     result[label]={failed:true,timeout:!!error.killed,missingMoov:/moov atom not found/i.test(err),notWhitelisted:/not on whitelist/i.test(err),invalidData:/Invalid data found/i.test(err),decoderMissing:/Unknown decoder|Decoder.*not found|Unsupported codec/i.test(err),ioError:/Input\\/output error|End of file/i.test(err)};\n    }\n   }\n   console.log(JSON.stringify(result));\n  }finally{await rm(dir,{recursive:true,force:true});}\n }\n}\nmain().catch(()=>{console.error('Video source diagnosis failed');process.exitCode=1;});\n"
def run(args, timeout=90):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode: raise RuntimeError("Diagnostic failed: " + args[0])
    return result.stdout
def main():
    disk=shutil.disk_usage("/")
    print(json.dumps({"disk_bytes":{"total":disk.total,"used":disk.used,"free":disk.free}}), flush=True)
    print(run(["docker","system","df"]), flush=True)
    ids=run(["docker","ps","-aq"]).split()
    containers=json.loads(run(["docker","inspect",*ids])) if ids else []
    print(json.dumps({"containers":[{"name":c["Name"],"id":c["Id"][:12],"image":c["Image"],"status":c["State"]["Status"],"created":c["Created"],"mount_count":len(c.get("Mounts",[]))} for c in containers]}), flush=True)
    used={c["Image"] for c in containers}
    images=run(["docker","image","ls","-q","--no-trunc"]).split()
    info=json.loads(run(["docker","image","inspect",*dict.fromkeys(images)])) if images else []
    print(json.dumps({"unreferenced_images":[{"id":i["Id"],"tags":i.get("RepoTags"),"digests":i.get("RepoDigests"),"bytes":i["Size"],"created":i["Created"]} for i in info if i["Id"] not in used]}), flush=True)
    for directory in ["/var/lib/docker","/var/log","/home/ubuntu","/tmp"]:
        result=subprocess.run(["du","-x","-B1","-d1",directory],capture_output=True,text=True,timeout=90)
        rows=[]
        for line in result.stdout.splitlines():
            size,path=line.split("\t",1)
            if int(size)>100*1024**2: rows.append({"path":path,"bytes":int(size)})
        print(json.dumps({"disk_directory":directory,"entries":rows}),flush=True)
    for name in ["next-app","flirt-dashboard"]:
        sha=run(["docker","exec",name,"printenv","GIT_SHA"]).strip()
        print(json.dumps({"runtime":name,"commit":sha}),flush=True)
    result=subprocess.run(["docker","exec","-i","next-app","node"],input=VIDEO_CHECK,capture_output=True,text=True,timeout=280)
    print(result.stdout,flush=True)
    if result.returncode: raise RuntimeError("Video diagnosis did not complete")
if __name__=="__main__": main()
