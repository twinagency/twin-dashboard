"use client";

import {useEffect, useId, useMemo, useRef, useState} from "react";
import {ChevronDown, ChevronUp, Check, CheckCheck, RotateCcw, Network, Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Save, Layers, ArrowRight} from "lucide-react";
import {CONTROLS, allocate, canShowIntelligence, defaultValues, fieldKey, issues, restoreValues, storageKey, type Control, type Domain, type Field, type Row, type Scalar, type Value, type Values} from "./model";
import styles from "./IntelligenceControls.module.css";

type Props={tab:Domain;cloneId:string;audience:string;creatorName:string;onTabChange:(tab:Domain)=>void};
type EditorProps={field:Field;value:Value;onChange:(value:Value)=>void;prefix:string};

function Switch({label,value,onChange}:{label:string;value:boolean;onChange:(next:boolean)=>void}){
 return <button type="button" role="switch" aria-label={label} aria-checked={value} className={`${styles.switch} ${value?styles.on:""}`} onClick={()=>onChange(!value)}><span/></button>;
}

function ScalarEditor({field,value,onChange,prefix}:EditorProps){
 const id=`${prefix}-${field.key}`;
 if(field.kind==="toggle")return <div className={styles.toggle}><span id={`${id}-label`}>{field.label}</span><Switch label={field.label} value={Boolean(value)} onChange={onChange}/></div>;
 if(field.kind==="range")return <div className={styles.sliderField}><div className={styles.fieldHeading}><label htmlFor={id}>{field.label}</label><output htmlFor={id}>{String(value)}{field.unit}</output></div><input id={id} aria-label={field.label} type="range" min={field.min} max={field.max} step={field.step??1} value={Number(value)} onChange={e=>onChange(Number(e.target.value))}/><div className={styles.rangeEnds}><span>{field.min??0}{field.unit}</span><span>{field.max??100}{field.unit}</span></div></div>;
 if(field.kind==="choice")return <label className={styles.field} htmlFor={id}><span>{field.label}</span><select id={id} value={String(value)} onChange={e=>onChange(e.target.value)}>{field.options?.map(option=><option key={option}>{option}</option>)}</select></label>;
 return <label className={styles.field} htmlFor={id}><span>{field.label}{field.unit?<small> · {field.unit}</small>:null}</span><input id={id} type={field.kind==="date"?"date":field.kind==="number"?"number":"text"} value={typeof value==="boolean"?String(value):value as string|number} min={field.min} max={field.max} step={field.kind==="number"&&(field.min??0)%1!==0?0.001:field.step??1} maxLength={500} onChange={e=>onChange(field.kind==="number"?Math.min(field.max??999,Math.max(field.min??0,Number(e.target.value))):e.target.value)}/></label>;
}

function ReorderEditor({field,value,onChange,prefix}:EditorProps){
 const entries=value as Row[];const moving=useRef<number|null>(null);
 function move(from:number,to:number){if(to<0||to>=entries.length||from===to)return;const next=[...entries];next.splice(to,0,next.splice(from,1)[0]);onChange(next);}
 return <div className={styles.full}><p className={styles.subLabel}>{field.label}</p><ol className={styles.orderList}>{entries.map((row,i)=><li key={String(row.label)} draggable onDragStart={()=>{moving.current=i;}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(moving.current!==null)move(moving.current,i);moving.current=null;}} onDragEnd={()=>{moving.current=null;}}><GripVertical size={15} aria-hidden="true"/><span className={styles.ordinal}>{i+1}</span><span>{String(row.label)}</span><div className={styles.orderActions}><button type="button" className={styles.iconButton} aria-label={`Move ${row.label} up`} disabled={i===0} onClick={()=>move(i,i-1)}><ArrowUp size={14}/></button><button type="button" className={styles.iconButton} aria-label={`Move ${row.label} down`} disabled={i===entries.length-1} onClick={()=>move(i,i+1)}><ArrowDown size={14}/></button></div></li>)}</ol><p className={styles.help}>Drag to reorder, or use the arrow controls.</p></div>;
}

function RowsEditor({field,value,onChange,prefix}:EditorProps){
 const entries=value as Row[];const columns=field.columns??[];
 function edit(index:number,key:string,next:Value){onChange(entries.map((row,i)=>{if(i!==index)return row;const updated={...row,[key]:next as Scalar};if(updated.mode==="Fixed"&&"min"in updated&&"max"in updated){if(key==="max")updated.min=updated.max;else updated.max=updated.min;}return updated;}));}
 return <div className={styles.full}><div className={styles.fieldHeading}><p className={styles.subLabel}>{field.label}</p><span className={styles.muted}>{entries.length} {entries.length===1?"entry":"entries"}</span></div><div className={styles.rowList}>{entries.map((row,index)=><div className={styles.dataRow} key={index}>{columns.map(column=><ScalarEditor key={column.key} field={column} value={row[column.key]} prefix={`${prefix}-${index}`} onChange={next=>edit(index,column.key,next)}/>)}{field.addable?<button type="button" className={styles.remove} aria-label={`Remove ${field.label} row ${index+1}`} disabled={entries.length<=1} onClick={()=>onChange(entries.filter((_,i)=>i!==index))}><Trash2 size={15}/></button>:null}</div>)}</div>{field.addable?<button type="button" disabled={entries.length>=50} className={styles.secondary} onClick={()=>onChange([...entries,Object.fromEntries(columns.map(col=>[col.key,col.value as Scalar]))])}><Plus size={14}/>Add {field.label==="Conditional policies"?"rule":"entry"}</button>:null}</div>;
}

const nodes=[{key:"identity",title:"Creator identity",sub:"Approved facts & voice"},{key:"memory",title:"Relationship memory",sub:"Relevant, sourced context"},{key:"purchases",title:"Purchase ownership",sub:"Linked platform history"},{key:"catalogue",title:"Content catalogue",sub:"Eligible assets & offers"}];
function DependencyGraph({values,impact=false}:{values:Values;impact?:boolean}){
 const [selected,setSelected]=useState("memory");
 const setting=String(values["impact.setting"]);
 const impacts:Record<string,string[]>={"Cross-platform context sharing":["memory","purchases"],"Memory consolidation":["memory"],"Partial bundle ownership":["purchases","catalogue"],"Independent response review":["identity","memory","purchases","catalogue"],"Platform delivery profiles":["catalogue"]};
 const active=impact?(impacts[setting]??[]):nodes.filter(n=>Boolean(values[`layers.${n.key}`])).map(n=>n.key);
 const chosen=nodes.find(n=>n.key===selected)!;
 return <div className={styles.full}><div className={styles.graph}><div className={styles.graphSources}>{nodes.map(n=><button type="button" aria-pressed={selected===n.key} key={n.key} className={`${styles.node} ${active.includes(n.key)?styles.nodeActive:styles.nodeMuted} ${selected===n.key?styles.nodeSelected:""}`} onClick={()=>setSelected(n.key)}><Layers size={16}/><span><b>{n.title}</b><small>{n.sub}</small></span></button>)}</div><div className={styles.graphBridge} aria-hidden="true"><span/><ArrowRight size={18}/></div><div className={styles.graphStages}><div className={styles.stage}><Network size={19}/><b>Context assembly</b><span>{active.length} selected sources</span></div><ArrowDown size={16} aria-hidden="true"/><div className={styles.stage}><CheckCheck size={19}/><b>{impact&&setting==="Platform delivery profiles"?"Platform delivery":"Response & validation"}</b><span>Policy dependencies</span></div></div></div><div className={styles.graphDetail}><b>{chosen.title}</b><p>{selected==="identity"?"Supplies approved creator facts, protected identity details, and writing guidance.":selected==="memory"?"Supplies relevant relationship details and unresolved topics under the retrieval and retention policies.":selected==="purchases"?"Supplies ownership and entitlement context used before an offer is considered.":"Supplies eligible assets, metadata, pricing references, and delivery preferences."}</p></div></div>;
}

function RuleDiagram({values}:{values:Values}){
 const rules=values["rules.rules"] as Row[];
 return <div className={styles.full}>{rules.map((r,i)=><div className={`${styles.ruleFlow} ${r.enabled?"":styles.dimmed}`} key={i}><span className={styles.ruleNumber}>Rule {i+1}</span><div><small>WHEN</small><b>{String(r.when)}</b></div><div><small>IF</small><b>{String(r.condition)}</b></div><div><small>THEN</small><b>{String(r.then)}</b></div><div><small>OTHERWISE</small><b>{String(r.otherwise)}</b></div></div>)}</div>;
}

function Visual({control,values,onChange,onNavigate}:{control:Control;values:Values;onChange:(key:string,value:Value)=>void;onNavigate:(id:number)=>void}){
 const [scene,setScene]=useState(0);
 const [similarityDecision,setSimilarityDecision]=useState("");
 if(control.visual==="allocation")return <div className={styles.full}><div className={styles.allocation} aria-label="Context allocation, 100 percent">{control.fields.map((f,i)=><div key={f.key} style={{width:`${values[fieldKey(control,f)]}%`,background:["#0b2b4b","#2f6fed","#688bc7","#138a63","#9bb3d5"][i]}} title={`${f.label}: ${values[fieldKey(control,f)]}%`}>{Number(values[fieldKey(control,f)])>=10?<span>{String(values[fieldKey(control,f)])}%</span>:null}</div>)}</div><div className={styles.legend}>{control.fields.map((f,i)=><span key={f.key}><i style={{background:["#0b2b4b","#2f6fed","#688bc7","#138a63","#9bb3d5"][i]}}/>{f.label}</span>)}</div><p className={styles.help}>Adjusting one allocation redistributes the remaining budget proportionally.</p></div>;
 if(control.visual==="layers"||control.visual==="impact")return <DependencyGraph values={values} impact={control.visual==="impact"}/>;
 if(control.visual==="rules")return <RuleDiagram values={values}/>;
 if(control.visual==="conflicts"){
  const findings=issues(values);
  return <div className={styles.full}><div className={styles.statusBlock}><CheckCheck size={20}/><div><b>{findings.length?`${findings.length} policy conflicts need attention`:"Policy controls are consistent"}</b><p>Checks cover context allocation, time ranges, ownership credits, and shared offer reservations.</p></div></div>{findings.map((finding,i)=><button type="button" key={i} className={styles.finding} onClick={()=>onNavigate(finding.id)}><span>{finding.message}</span><span>Open control <ArrowRight size={14}/></span></button>)}</div>;
 }
 if(control.visual==="assets"){
  const mappings=values["asset-mapping.mappings"] as Row[];
  return <div className={styles.full}><div className={styles.platformLink}><span className={styles.platform}>OF</span><div><b>Shared asset identity</b><p>{mappings.filter(r=>r.linked).length} selected links · one ownership reference</p></div><span className={styles.platform}>TG</span></div></div>;
 }
 if(control.visual==="similarity")return <div className={styles.full}><div className={styles.similarity}><div><Layers size={22}/><b>Original asset</b><span>Source edition</span></div><ArrowRight size={18}/><div><Layers size={22}/><b>Alternate export</b><span>Crop or re-encode</span></div></div><div className={styles.inlineActions}><button type="button" className={styles.secondary} aria-pressed={similarityDecision==="Group as variants"} onClick={()=>setSimilarityDecision("Group as variants")}>Group as variants</button><button type="button" className={styles.secondary} aria-pressed={similarityDecision==="Keep distinct editions"} onClick={()=>setSimilarityDecision("Keep distinct editions")}>Keep distinct editions</button>{similarityDecision?<span role="status" className={styles.good}>{similarityDecision} selected</span>:null}</div><p className={styles.help}>Operator decisions remain subject to the duplicate-handling policy above.</p></div>;
 if(control.visual==="scenes"){
  const entries=values["scenes.scenes"] as Row[];const active=entries[Math.min(scene,entries.length-1)];const duration=Math.max(1,...entries.map(r=>Number(r.end)));
  return <div className={styles.full}><div className={styles.timelineHead}><b>Scene index</b><span>{duration}s · {entries.length} segments</span></div><div className={styles.sceneTimeline}>{entries.map((r,i)=><button type="button" key={i} aria-label={`Select scene ${r.label}`} aria-pressed={i===scene} style={{flex:Math.max(1,Number(r.end)-Number(r.start))}} onClick={()=>setScene(i)}><span>{String(r.label)}</span><small>{String(r.start)}–{String(r.end)}s</small></button>)}</div>{active?<p className={styles.help}>Selected: <b>{String(active.label)}</b> · {String(active.start)}–{String(active.end)} seconds. Edit its label or timestamps below.</p>:null}</div>;
 }
 if(control.visual==="caption"){
  const caption=String(values["caption-checks.caption"]);const match=caption.match(/(\d+)\s*[- ]?\s*second/i);const check=Boolean(values["caption-checks.duration"]);const mismatch=check&&match&&Number(match[1])!==Number(values["caption-checks.seconds"]);
  return <div className={`${styles.statusBlock} ${styles.full} ${mismatch?styles.warning:""}`}><CheckCheck size={20}/><div><b>{!check?"Duration check disabled":!match?"No duration claim to compare":mismatch?"Duration claim needs review":"Duration claim matches the entered metadata"}</b><p>{mismatch?`Caption states ${match[1]} seconds; entered metadata states ${values["caption-checks.seconds"]} seconds.`:"Comparison uses the caption and recorded duration fields in this control."}</p></div></div>;
 }
 return null;
}

function summary(control:Control,values:Values){
 const f=control.fields[0];const value=values[fieldKey(control,f)];
 if(Array.isArray(value))return `${value.length} ${f.kind==="order"?"ordered steps":"configured entries"}`;
 if(typeof value==="boolean")return `${f.label}: ${value?"On":"Off"}`;
 return `${f.kind==="choice"?"":`${f.label}: `}${value}${f.unit?` ${f.unit}`:""}`;
}

export default function IntelligenceControls(props:Props){
 if(!canShowIntelligence(props.audience,props.cloneId))return null;
 return <Workspace key={props.cloneId} {...props}/>;
}

function Workspace({tab,cloneId,onTabChange}:Props){
 const instance=useId().replace(/:/g,"");
 const [values,setValues]=useState<Values>(defaultValues);
 const [saved,setSaved]=useState<Values>(defaultValues);
 const [loaded,setLoaded]=useState(false);
 const [status,setStatus]=useState("");
 const [open,setOpen]=useState<number[]>([30]);
 const [resetOpen,setResetOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  try{const next=restoreValues(window.localStorage.getItem(storageKey(cloneId)));setValues(next);setSaved(structuredClone(next));}
  catch{setStatus("Browser storage is unavailable. Changes remain available for this session.");}
  setLoaded(true);
 },[cloneId]);
 useEffect(()=>{setResetOpen(false);},[tab]);
 const controls=CONTROLS;
 const problems=useMemo(()=>issues(values),[values]);
 const changed=CONTROLS.filter(c=>c.fields.some(f=>JSON.stringify(values[fieldKey(c,f)])!==JSON.stringify(saved[fieldKey(c,f)])));
 function change(key:string,value:Value){setValues(current=>key.startsWith("context-budget.")?allocate(current,key,Number(value)):{...current,[key]:value});setStatus("");}
 function save(){if(problems.length){setStatus("Resolve the highlighted policy conflicts before saving.");return;}try{window.localStorage.setItem(storageKey(cloneId),JSON.stringify({version:1,values}));setSaved(structuredClone(values));setStatus("Controls saved.");}catch{setStatus("Could not save in this browser. Your changes are still here.");}}
 function reset(){const defaults=defaultValues();setValues(current=>({...current,...Object.fromEntries(controls.flatMap(c=>c.fields.map(f=>[fieldKey(c,f),defaults[fieldKey(c,f)]])))}));setResetOpen(false);setStatus("Page controls reset. Save to keep these values.");}
 function navigate(id:number){const c=CONTROLS.find(c=>c.id===id)!;setOpen(current=>current.includes(id)?current:[...current,id]);onTabChange("advanced");window.setTimeout(()=>root.current?.querySelector(`[data-intelligence-control="${id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}),100);}
 if(tab!=="advanced")return null;
 return <div ref={root} className={styles.root} aria-label="Advanced settings" data-intelligence-workspace>
  <fieldset disabled={!loaded} className={styles.controlSet}>{controls.map(control=>{
   const expanded=open.includes(control.id);const findings=problems.filter(p=>p.id===control.id);
   return <article className={`${styles.card} ${expanded?styles.expanded:""}`} key={control.id} data-intelligence-control={control.id}><button type="button" className={styles.cardHead} aria-expanded={expanded} aria-controls={`${instance}-control-${control.id}`} onClick={()=>setOpen(current=>current.includes(control.id)?current.filter(id=>id!==control.id):[...current,control.id])}><span className={styles.cardTitle}><b>{control.title}</b><span>{summary(control,values)}</span></span>{findings.length?<span className={styles.issueBadge}>{findings.length} to review</span>:null}{expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
    {expanded?<div className={styles.cardBody} id={`${instance}-control-${control.id}`}><p className={styles.description}>{control.description}</p><div className={styles.fields}>
     {control.visual&&!["layers","impact","conflicts","caption"].includes(control.visual)?<Visual control={control} values={values} onChange={change} onNavigate={navigate}/>:null}
     {control.fields.map(field=>{const props={field,value:values[fieldKey(control,field)],onChange:(next:Value)=>change(fieldKey(control,field),next),prefix:`${instance}-${control.key}`};return field.kind==="rows"?<RowsEditor key={field.key} {...props}/>:field.kind==="order"?<ReorderEditor key={field.key} {...props}/>:<ScalarEditor key={field.key} {...props}/>;})}
     {control.visual&&["layers","impact","conflicts","caption"].includes(control.visual)?<Visual control={control} values={values} onChange={change} onNavigate={navigate}/>:null}
    </div>{findings.map((finding,i)=><p key={i} role="alert" className={styles.validation}>{finding.message}</p>)}</div>:null}
   </article>;
  })}</fieldset>
  {resetOpen?<div className={styles.resetConfirm} role="group" aria-label="Reset page controls"><span>Restore the initial values for these {controls.length} controls?</span><button type="button" className={styles.secondary} onClick={()=>setResetOpen(false)}>Cancel</button><button type="button" className={styles.primary} onClick={reset}>Reset this tab</button></div>:null}
  <div className={styles.saveBar}><div><b>{changed.length?`${changed.length} ${changed.length===1?"control":"controls"} changed`:"Controls up to date"}</b><p role="status" aria-live="polite">{status}</p></div><div className={styles.inlineActions}><button type="button" className={styles.secondary} disabled={!loaded} onClick={()=>setResetOpen(!resetOpen)}><RotateCcw size={14}/>Reset tab</button><button type="button" className={styles.primary} disabled={!loaded||!changed.length||Boolean(problems.length)} onClick={save}>{changed.length?<Save size={14}/>:<Check size={14}/>}Save controls</button></div></div>
 </div>;
}
