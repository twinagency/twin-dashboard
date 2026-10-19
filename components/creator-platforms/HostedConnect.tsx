'use client';
import {useCallback,useEffect,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {ArrowRight,CheckCircle2,LoaderCircle,RefreshCw} from 'lucide-react';
import type {SignInAttempt} from '@/lib/onlyfans-sign-in/backend';
import styles from './HostedConnect.module.css';

const route='/creator-auth/platforms/onlyfans/sign-in';
class SignInRequestError extends Error{constructor(readonly status:number,message:string){super(message);}}
export default function HostedConnect({profileId,accountId,disabled,onChanged}:{profileId:string;accountId:string|null;disabled:boolean;onChanged:()=>Promise<boolean>}){
  const [attempt,setAttempt]=useState<SignInAttempt|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const live=useRef(false),current=useRef<SignInAttempt|null>(null),started=useRef(false),startKey=useRef('');
  const canvas=useRef<HTMLCanvasElement>(null),keyboard=useRef<HTMLInputElement>(null),queue=useRef(Promise.resolve());
  const generation=useRef(0),pointer=useRef<{x:number;y:number}|null>(null),changed=useRef(onChanged);changed.current=onChanged;
  const save=useCallback((value:SignInAttempt)=>{if(live.current){current.current=value;setAttempt(value);}},[]);
  const command=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
    const response=await fetch(route,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,profileId,...extra}),signal:AbortSignal.timeout(12000)});
    const result=await response.json();if(!response.ok||!result.ok||!result.attempt)throw new SignInRequestError(response.status,result.error||'Your sign-in could not be confirmed. Please try again.');return result.attempt as SignInAttempt;
  },[profileId]);
  const start=useCallback(async()=>{
    if(disabled)return;setBusy(true);setNotice('');const version=++generation.current;
    try{if(!startKey.current)startKey.current=crypto.randomUUID();const result=await command('start',{startKey:startKey.current,accountId});if(live.current&&version===generation.current)save(result);}
    catch(error){if(live.current)setNotice(error instanceof Error?error.message:'Sign-in is temporarily unavailable.');}
    finally{if(live.current)setBusy(false);}
  },[accountId,command,disabled,save]);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{if(!started.current&&!disabled){started.current=true;void start();}},[disabled,start]);
  useEffect(()=>{
    if(!attempt||!['opening','waiting','submitted'].includes(attempt.phase)||disabled)return;
    let active=true,running=false;const controller=new AbortController();
    const poll=async()=>{if(running)return;running=true;try{
      const response=await fetch(route+'?attempt='+attempt.id,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});const body=await response.json();
      if(!response.ok||!body.ok)throw new Error(body.error||'Your sign-in status could not be loaded.');
      if(active){save(body.attempt);if(body.attempt.phase==='submitted')await changed.current();}
    }catch(error){if(active)setNotice(error instanceof Error?error.message:'Your sign-in status could not be loaded.');}finally{running=false;}};
    const timer=window.setInterval(()=>void poll(),1500);void poll();return()=>{active=false;controller.abort();clearInterval(timer);};
  },[attempt?.id,attempt?.phase,disabled,save]);
  useEffect(()=>{
    if(!attempt||attempt.phase!=='waiting'||disabled)return;
    let active=true;const controller=new AbortController();let timer:number;
    const draw=async()=>{try{
      const r=await fetch(route+'?attempt='+attempt.id+'&frame=1',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
      if(r.ok&&r.headers.get('content-type')?.startsWith('image/jpeg')){const blob=await r.blob();const image=await createImageBitmap(blob);if(active&&canvas.current)canvas.current.getContext('2d')?.drawImage(image,0,0,432,720);image.close();}
    }catch{/* Status polling owns the recoverable error message. */}finally{if(active)timer=window.setTimeout(()=>void draw(),800);}};
    void draw();return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[attempt?.id,attempt?.phase,disabled]);
  function send(input:Record<string,unknown>){
    if(disabled||current.current?.phase!=='waiting')return;
    const identity=current.current.id,version=generation.current;
    queue.current=queue.current.then(async()=>{
      if(!live.current||version!==generation.current)return;
      try{save(await command('input',{attempt:identity,input}));}
      catch{if(live.current){setNotice('That input was not confirmed. Restart sign-in to continue.');save({...current.current!,phase:'failed'});generation.current++;}}
    });
  }
  function type(event:KeyboardEvent<HTMLInputElement>){
    if(['Enter','Tab','Backspace','Delete','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();send({type:'key',key:event.key});}
  }
  function press(event:PointerEvent<HTMLCanvasElement>){pointer.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);keyboard.current?.focus({preventScroll:true});}
  function release(event:PointerEvent<HTMLCanvasElement>){const p=pointer.current;pointer.current=null;if(!p)return;const box=event.currentTarget.getBoundingClientRect(),dy=p.y-event.clientY;if(Math.abs(dy)>18)send({type:'scroll',delta:Math.max(-1000,Math.min(1000,dy*720/box.height))});else send({type:'click',x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))});}
  async function confirm(){if(!attempt||busy)return;setBusy(true);setNotice('');try{save(await command('confirm',{attempt:attempt.id}));await changed.current();}catch(error){setNotice(error instanceof Error?error.message:'Your connection could not be confirmed. Retry the same confirmation.');}finally{if(live.current)setBusy(false);}}
  async function restart(){if(busy)return;setBusy(true);generation.current++;try{if(current.current){try{await command('cancel',{attempt:current.current.id});}catch(error){if(!(error instanceof SignInRequestError&&[404,410].includes(error.status)))throw error;}}current.current=null;setAttempt(null);startKey.current=crypto.randomUUID();await start();}catch{setNotice('Your previous sign-in could not be closed. Please try again.');}finally{if(live.current)setBusy(false);}}
  const failed=attempt&&['failed','wrong_account','expired','cancelled'].includes(attempt.phase);
  return <section className={styles.root} data-hosted-connect>
    {(!attempt||attempt.phase==='opening')&&<div className={styles.loading}><LoaderCircle className={styles.spinner} size={22}/><p>Opening your OnlyFans sign-in…</p></div>}
    {attempt?.phase==='waiting'&&<>
      <p className={styles.intro}>Sign in to your OnlyFans below. Complete any verification shown by OnlyFans.</p>
      <div className={styles.viewer}>
        <canvas ref={canvas} width={432} height={720} className={styles.screen} aria-label="OnlyFans sign-in screen" onPointerDown={press} onPointerUp={release} onPointerCancel={()=>{pointer.current=null;}} onWheel={event=>{event.preventDefault();send({type:'scroll',delta:Math.max(-1000,Math.min(1000,event.deltaY))});}}/>
        <input ref={keyboard} className={styles.keyboard} aria-label="Type in the selected OnlyFans field" type={attempt.keyboard==='password'?'password':attempt.keyboard==='email'?'email':'text'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onKeyDown={type} onBeforeInput={event=>{if((event.nativeEvent as InputEvent).inputType==='deleteContentBackward'){event.preventDefault();send({type:'key',key:'Backspace'});}}} onChange={event=>{if((event.nativeEvent as InputEvent).isComposing)return;const value=event.currentTarget.value;event.currentTarget.value='';if(value)send({type:'text',text:value});}} onCompositionEnd={event=>{const value=event.currentTarget.value;event.currentTarget.value='';if(value)send({type:'text',text:value});}}/>
      </div>
      <div className={styles.tools}><button type="button" onClick={()=>{send({type:'key',key:'Tab'});keyboard.current?.focus({preventScroll:true});}}>Next field</button><button type="button" onClick={()=>send({type:'key',key:'Backspace'})}>⌫</button><button type="button" onClick={()=>send({type:'key',key:'Enter'})}>Enter ↵</button></div>
    </>}
    {attempt?.phase==='ready'&&<div className={styles.ready}><CheckCircle2 size={28}/><h3>Connect @{attempt.handle}?</h3><p>This account will join your existing creator profile.</p><button className={styles.primary} disabled={busy||disabled} onClick={()=>void confirm()}>{busy?'Connecting…':'Connect this account'}<ArrowRight size={17}/></button></div>}
    {attempt?.phase==='submitted'&&<p role="status" className={styles.loading}><LoaderCircle className={styles.spinner} size={21}/>Checking your account. You’ll return here when it’s connected.</p>}
    {failed&&<p role="status">{attempt.phase==='wrong_account'?'That is a different OnlyFans account. Restart and sign in to the selected account.':'Your sign-in ended. Start again to connect.'}</p>}
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    {(notice||failed)&&<button className={styles.secondary} disabled={busy||disabled} onClick={()=>void restart()}><RefreshCw size={15}/>Restart sign-in</button>}
    <p className={styles.privacy}>Your sign-in opens in a private, temporary browser run by Twin. We don’t save your password.</p>
  </section>;
}
