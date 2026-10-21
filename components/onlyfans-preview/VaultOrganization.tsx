"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls } from "@/components/clone/fields";
import { parseVaultResource,parseVaultEditAck,validVaultEdit,type FolderSummary,type FolderMetadata,type VaultEditRequest,type FolderPatch } from "@/lib/onlyfans/vault-editing";
const button="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-accent disabled:opacity-50";
type Pending={resource:string;body:VaultEditRequest};
export default function VaultOrganization({accountId,selectedIds,folderId,onFolderChange,onChanged,onBusy}:{
  accountId:string;selectedIds:string[];folderId:string;
  onFolderChange:(id:string)=>void;onChanged:()=>void;onBusy:(value:boolean)=>void;
}){
  const [targetId,setTargetId]=useState(folderId);
  const router=useRouter();const active=useRef(false),submitting=useRef(false),generation=useRef(0);
  const [folders,setFolders]=useState<FolderSummary[]|null>(null),[folder,setFolder]=useState<FolderMetadata|null>(null);
  const [name,setName]=useState("");
  const [busy,setBusy]=useState(true),[denied,setDenied]=useState(false),[notice,setNotice]=useState("Loading vault organization…"),[retry,setRetry]=useState<Pending|null>(null);
  const base=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/manage/`;
  const load=useCallback(async()=>{
    const stamp=++generation.current;
    const resources=["folders",...(targetId?[`folders/${targetId}`]:[])];
    try{
      const results=await Promise.all(resources.map(async resource=>{
        const response=await fetch(base+resource,{cache:"no-store",redirect:"error",credentials:"same-origin",signal:AbortSignal.timeout(15000)});
        return {resource,status:response.status,data:response.ok?parseVaultResource(await response.json(),accountId,resource):null};
      }));
      if(!active.current||stamp!==generation.current)return false;
      if(results.some(r=>[401,403].includes(r.status))){setDenied(true);setFolder(null);setFolders(null);setName("");setRetry(null);setNotice("Your session cannot manage this vault. Sign in again.");router.refresh();return false;}
      if(results.some(r=>r.data===null))throw new Error("Metadata unavailable");
      setFolders(results[0].data as FolderSummary[]);
      const nextFolder=results.find(r=>r.resource.startsWith("folders/"))?.data as FolderMetadata|undefined;setFolder(nextFolder??null);
      return true;
    }catch{if(active.current&&stamp===generation.current){setFolder(null);setFolders(null);setNotice("Vault organization could not be read. Refresh to try again.");}return false;}
  },[accountId,base,targetId,router]);
  useEffect(()=>{active.current=true;setBusy(true);void load().then(ok=>{if(active.current){setBusy(false);if(ok)setNotice("");}});return()=>{active.current=false;generation.current++;};},[load]);
  useEffect(()=>{onBusy(busy||!!retry);return()=>onBusy(false);},[busy,retry,onBusy]);
  async function save(command:Pending){
    if(submitting.current||!validVaultEdit(command.resource,command.body))return;
    submitting.current=true;setBusy(true);setNotice("Saving vault organization…");
    let pending:Pending|null=command,message="Outcome not confirmed. Refresh or retry the same request.",changedScope=false,sessionLost=false;
    try{
      const response=await fetch(base+command.resource,{method:"POST",cache:"no-store",redirect:"error",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(command.body)});
      if(!active.current)return;
      if([401,403].includes(response.status)){sessionLost=true;setDenied(true);setFolder(null);setFolders(null);setName("");setRetry(null);setNotice("Your session cannot manage this vault. Sign in again.");router.refresh();return;}
      const ack=response.ok?parseVaultEditAck(await response.json(),accountId,command.resource):null;
      if(ack){pending=null;message="Vault change recorded.";onChanged();
        if("action" in command.body&&["create","archive"].includes(command.body.action)){changedScope=true;setTargetId(command.body.action==="create"?ack.targetId:"");
          if(command.body.action==="archive"&&folderId===ack.targetId)onFolderChange("");setName("");}
      }else if([400,404,409,413,503].includes(response.status)){pending=null;message=response.status===409?"Vault metadata changed. Review the refreshed values before saving again.":"The edit was refused. Review the current asset or folder.";}
    }catch{/* Keep the exact original command for an explicit retry. */}
    finally{
      if(active.current&&!sessionLost){if(!changedScope)await load();if(active.current){setRetry(pending);setNotice(message);if(!changedScope)setBusy(false);}}
      if(active.current&&sessionLost)setBusy(false);submitting.current=false;
    }
  }
  function folderCommand(action:FolderPatch["action"]){
    const creating=action==="create";
    const body:VaultEditRequest={requestId:crypto.randomUUID(),action,name:["create","rename"].includes(action)?name:null,
      mediaIds:["add","remove"].includes(action)?selectedIds:null,expectedFingerprint:creating?null:folder?.fingerprint??null};
    const resource=creating?"folders":`folders/${targetId}`;
    if(!validVaultEdit(resource,body)){setNotice("Choose a current folder, a valid name or between 1 and 40 selected assets for this action.");return;}
    void save({resource,body});
  }
  return <section className="mt-4 rounded-lg border border-line p-3" data-of-vault-organization>
    <h3 className="text-sm font-semibold">Folders</h3>
    <p className="mt-1 text-xs text-muted">Create your own categories with folders. These folders organize your Twin library; OnlyFans folders are not imported.</p>
    {notice?<p className="mt-2 text-xs" role="status" data-of-vault-edit-notice>{notice}</p>:null}
    {folders?.length === 0 ? <p className="mt-2 text-xs text-muted">No folders yet. Open Manage folders to create your first category.</p> : null}
    {!denied ? <label className="mt-3 block text-sm">Browse folder<select data-of-vault-folder-filter className={`${inputCls} mt-1 w-full`} disabled={busy || !!retry || folders === null} value={folderId} onChange={event => onFolderChange(event.target.value)}><option value="">All folders</option>{folders?.map(item => <option key={item.folderId} value={item.folderId}>{item.name} ({item.count})</option>)}</select></label> : null}
    {!denied?<details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Manage folders{folders ? ` (${folders.length})` : ""}</summary><fieldset disabled={busy||!!retry} className="mt-3 space-y-3 min-w-0">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs">Folder to manage<select data-of-vault-folder className={`${inputCls} mt-1`} disabled={folders===null} value={targetId} onChange={e=>setTargetId(e.target.value)}>
          <option value="">Choose a folder</option>{folders?.map(f=><option key={f.folderId} value={f.folderId}>{f.name} ({f.count})</option>)}
        </select></label>
        <label className="min-w-0 text-xs">Folder name<input data-of-vault-folder-name className={`${inputCls} mt-1`} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
      </div>
      <p className="text-xs text-muted">Current view: {folderId?(folders?.find(f=>f.folderId===folderId)?.name??"Selected folder"):"All assets"}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-of-vault-folder-show className={button} disabled={!folder||folderId===targetId} onClick={()=>onFolderChange(targetId)}>Show selected folder</button>
        <button type="button" className={button} disabled={!folderId} onClick={()=>onFolderChange("")}>Show all assets</button>
        <button type="button" data-of-vault-folder-create className={button} disabled={!folders||!name.trim()} onClick={()=>folderCommand("create")}>Create folder</button>
        <button type="button" className={button} disabled={!folder||!name.trim()||name.trim()===folder.name} onClick={()=>folderCommand("rename")}>Rename selected folder</button>
        <button type="button" data-of-vault-folder-add className={button} disabled={!folder||!selectedIds.length} onClick={()=>folderCommand("add")}>Add selected assets</button>
        <button type="button" className={button} disabled={!folder||!selectedIds.length} onClick={()=>folderCommand("remove")}>Remove selected assets</button>
        <button type="button" className={button} disabled={!folder} onClick={()=>folderCommand("archive")}>Archive selected folder</button>
      </div>

    </fieldset></details>:null}
    {retry&&!denied?<div className="mt-3 flex flex-wrap gap-2"><button type="button" data-of-vault-edit-retry className={button} disabled={busy} onClick={()=>void save(retry)}>Retry same edit</button><button type="button" className={button} disabled={busy} onClick={()=>{setRetry(null);setNotice("Review the refreshed metadata. The previous command may already have committed.");}}>Use refreshed metadata</button></div>:null}
    {!denied?<button type="button" className={`${button} mt-3`} disabled={busy||!!retry} onClick={()=>{setBusy(true);void load().then(()=>active.current&&setBusy(false));}}>Refresh organization</button>:null}
  </section>;
}
