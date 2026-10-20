'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent,type KeyboardEvent,type PointerEvent} from 'react';
import {ArrowRight,CheckCircle2,LoaderCircle,RefreshCw} from 'lucide-react';
import type {SignInAttempt} from '@/lib/onlyfans-sign-in/backend';
import styles from './HostedConnect.module.css';

const route='/creator-auth/platforms/onlyfans/sign-in';
class SignInRequestError extends Error{constructor(readonly status:number,message:string){super(message);}}
export default function HostedConnect({profileId,accountId,disabled,onChanged}:{profileId:string;accountId:string|null;disabled:boolean;onChanged:()=>Promise<boolean>}){
  const [attempt,setAttempt]=useState<SignInAttempt|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[showScreen,setShowScreen]=useState(false),[screenReady,setScreenReady]=useState(false),[keyboardOpen,setKeyboardOpen]=useState(false);
  const live=useRef(false),current=useRef<SignInAttempt|null>(null),started=useRef(false),startKey=useRef('');
  const canvas=useRef<HTMLCanvasElement>(null),keyboard=useRef<HTMLInputElement>(null),queue=useRef(Promise.resolve()),pendingInputs=useRef<Array<{input:Record<string,unknown>;identity:string;version:number}>>([]);
  const inputVersion=useRef(0),refreshFrame=useRef<(()=>void)|null>(null);
  const generation=useRef(0),pointer=useRef<{x:number;y:number;left:number;top:number;width:number;height:number}|null>(null),changed=useRef(onChanged);changed.current=onChanged;
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
    if(!attempt||attempt.phase!=='waiting'||disabled||!showScreen)return;
    let active=true,badFrames=0,running=false;const controller=new AbortController();let timer:number;setScreenReady(false);
    const schedule=(delay=0)=>{clearTimeout(timer);timer=window.setTimeout(()=>void draw(),delay);};
    refreshFrame.current=()=>schedule();
    const screenError='Your sign-in screen could not be loaded. Restart sign-in to continue.';
    const draw=async()=>{if(running)return;running=true;const version=inputVersion.current;try{
      await queue.current;if(!active)return;
      const r=await fetch(route+'?attempt='+attempt.id+'&frame=1',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
      if(!r.ok||!['image/jpeg','image/png'].includes(r.headers.get('content-type')?.split(';')[0]??''))throw new Error('frame_unavailable');
      const blob=await r.blob(),image=await createImageBitmap(blob);if(active&&version===inputVersion.current&&canvas.current){if(canvas.current.width!==image.width||canvas.current.height!==image.height){canvas.current.width=image.width;canvas.current.height=image.height;}canvas.current.getContext('2d')?.drawImage(image,0,0);badFrames=0;setScreenReady(true);setNotice(value=>value===screenError?'':value);}image.close();
    }catch{if(active&&++badFrames>=3)setNotice(screenError);}finally{running=false;if(active)schedule(600);}};
    void draw();return()=>{active=false;controller.abort();refreshFrame.current=null;clearTimeout(timer);};
  },[attempt?.id,attempt?.phase,disabled,showScreen]);
  function send(input:Record<string,unknown>){
    if(disabled||current.current?.phase!=='waiting')return;
    const identity=current.current.id,version=generation.current;inputVersion.current++;
    pendingInputs.current.push({input,identity,version});
    queue.current=queue.current.then(async()=>{
      const next=pendingInputs.current.shift();if(!next)return;
      if(!live.current||next.version!==generation.current)return;
      let payload=next.input;
      // Merge only adjacent text; clicks and field changes retain their order.
      while(payload.type==='text'&&pendingInputs.current[0]?.input.type==='text'&&pendingInputs.current[0].identity===next.identity&&pendingInputs.current[0].version===next.version){
        const text=String(payload.text)+String(pendingInputs.current[0].input.text);
        if(new TextEncoder().encode(text).length>512)break;
        pendingInputs.current.shift();payload={type:'text',text};
      }
      try{save(await command('input',{attempt:next.identity,input:payload}));refreshFrame.current?.();}
      catch{if(live.current){setNotice('That input was not confirmed. Restart sign-in to continue.');save({...current.current!,phase:'failed'});generation.current++;}}
    });
  }
  function type(event:KeyboardEvent<HTMLInputElement>){
    if(['Enter','Tab','Backspace','Delete','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();send({type:'key',key:event.key});}
  }
  function press(event:PointerEvent<HTMLCanvasElement>){event.preventDefault();const box=event.currentTarget.getBoundingClientRect();pointer.current={x:event.clientX,y:event.clientY,left:box.left,top:box.top,width:box.width,height:box.height};event.currentTarget.setPointerCapture(event.pointerId);keyboard.current?.blur();}
  function release(event:PointerEvent<HTMLCanvasElement>){event.preventDefault();const p=pointer.current;pointer.current=null;if(!p)return;const box=p,dy=p.y-event.clientY;if(Math.abs(dy)>18)send({type:'scroll',delta:Math.max(-1000,Math.min(1000,dy*720/box.height)),x:Math.max(0,Math.min(1,(p.x-box.left)/box.width)),y:Math.max(0,Math.min(1,(p.y-box.top)/box.height))});else if(Math.abs(p.x-event.clientX)<18)send({type:'click',x:Math.max(0,Math.min(1,(p.x-box.left)/box.width)),y:Math.max(0,Math.min(1,(p.y-box.top)/box.height))});}
  async function login(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||disabled||current.current?.phase!=='waiting')return;
    const form=event.currentTarget,values=new FormData(form);
    const input={type:'login',email:String(values.get('email')??'').trim(),password:String(values.get('password')??'')};
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    setBusy(true);setNotice('');
    try{save(await command('input',{attempt:current.current.id,input}));form.reset();setShowScreen(true);}
    catch{setNotice('OnlyFans sign-in could not be submitted. Please try again.');}
    finally{input.password='';if(live.current)setBusy(false);}
  }
  async function confirm(){if(!attempt||busy)return;setBusy(true);setNotice('');try{save(await command('confirm',{attempt:attempt.id}));await changed.current();}catch(error){setNotice(error instanceof Error?error.message:'Your connection could not be confirmed. Retry the same confirmation.');}finally{if(live.current)setBusy(false);}}
  async function restart(){if(busy)return;setBusy(true);generation.current++;try{if(current.current){try{await command('cancel',{attempt:current.current.id});}catch(error){if(!(error instanceof SignInRequestError&&[404,410].includes(error.status)))throw error;}}current.current=null;setAttempt(null);setShowScreen(false);startKey.current=crypto.randomUUID();await start();}catch{setNotice('Your previous sign-in could not be closed. Please try again.');}finally{if(live.current)setBusy(false);}}
  const failed=attempt&&['failed','wrong_account','expired','cancelled'].includes(attempt.phase);
  return <section className={styles.root} data-hosted-connect data-stage={showScreen&&attempt?.phase==='waiting'?'verification':'form'}>
    {(!attempt||attempt.phase==='opening')&&<div className={styles.loading}><LoaderCircle className={styles.spinner} size={22}/><p>Opening your OnlyFans sign-in…</p></div>}
    {attempt?.phase==='waiting'&&<>
      {!showScreen?<form className={styles.loginForm} aria-label="OnlyFans login" onSubmit={event=>void login(event)}>
        <div className={styles.welcome}><span className={styles.step}>YOUR ACCOUNT</span><h3>Bring your OnlyFans<br/>into your space.</h3><p>Sign in once to connect your account.</p></div>
        <label>Email address<input name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" required disabled={busy}/></label>
        <label>OnlyFans password<input name="password" type="password" autoComplete="current-password" required disabled={busy}/></label>
        <button type="submit" className={styles.primary} disabled={busy||disabled}>{busy?<><LoaderCircle className={styles.spinner} size={18}/>Signing in…</>:<>Sign in<ArrowRight size={17}/></>}</button>
        <p className={styles.privacy}>OnlyFans may ask you to complete verification.</p>
        <button type="button" className={styles.otherOptions} onClick={()=>setShowScreen(true)}>Other sign-in options</button>
      </form>:<>
      <p className={styles.intro}>Complete the verification below.</p>
      <div className={styles.viewer} aria-busy={!screenReady}>
        {!screenReady&&<div className={styles.screenLoading} role="status"><LoaderCircle size={22} className={styles.spinner}/>Loading your sign-in…</div>}
        <canvas ref={canvas} width={432} height={720} className={styles.screen} data-ready={screenReady} aria-label="OnlyFans sign-in screen" onPointerDown={press} onPointerUp={release} onPointerCancel={()=>{pointer.current=null;}} onWheel={event=>{event.preventDefault();const box=event.currentTarget.getBoundingClientRect();send({type:'scroll',delta:Math.max(-1000,Math.min(1000,event.deltaY)),x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))});}}/>
        <input ref={keyboard} className={styles.keyboard} aria-label="Type in the selected OnlyFans field" type={attempt.keyboard==='password'?'password':attempt.keyboard==='email'?'email':'text'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onFocus={()=>setKeyboardOpen(true)} onBlur={()=>setKeyboardOpen(false)} onKeyDown={type} onBeforeInput={event=>{if((event.nativeEvent as InputEvent).inputType==='deleteContentBackward'){event.preventDefault();send({type:'key',key:'Backspace'});}}} onChange={event=>{if((event.nativeEvent as InputEvent).isComposing)return;const value=event.currentTarget.value;event.currentTarget.value='';if(value)send({type:'text',text:value});}} onCompositionEnd={event=>{const value=event.currentTarget.value;event.currentTarget.value='';if(value)send({type:'text',text:value});}}/>
      </div>
      <div className={styles.tools}><button type="button" onClick={()=>{keyboard.current?.blur();setShowScreen(false);}}>Back to sign-in</button><button type="button" onClick={()=>keyboardOpen?keyboard.current?.blur():keyboard.current?.focus({preventScroll:true})}>{keyboardOpen?'Hide keyboard':'Show keyboard'}</button>{keyboardOpen&&<><button type="button" onPointerDown={event=>event.preventDefault()} onClick={()=>{send({type:'key',key:'Tab'});keyboard.current?.focus({preventScroll:true});}}>Next field</button><button type="button" onPointerDown={event=>event.preventDefault()} onClick={()=>send({type:'key',key:'Enter'})}>Enter ↵</button></>}</div>
      </>}
    </>}
    {attempt?.phase==='ready'&&<div className={styles.ready}><CheckCircle2 size={28}/><h3>Connect @{attempt.handle}?</h3><p>This account will join your existing creator profile.</p><button className={styles.primary} disabled={busy||disabled} onClick={()=>void confirm()}>{busy?'Connecting…':'Connect this account'}<ArrowRight size={17}/></button></div>}
    {attempt?.phase==='submitted'&&<p role="status" className={styles.loading}><LoaderCircle className={styles.spinner} size={21}/>Checking your account. You’ll return here when it’s connected.</p>}
    {failed&&<p role="status">{attempt.phase==='wrong_account'?'That is a different OnlyFans account. Restart and sign in to the selected account.':'Your sign-in ended. Start again to connect.'}</p>}
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    {(notice||failed)&&<button className={styles.secondary} disabled={busy||disabled} onClick={()=>void restart()}><RefreshCw size={15}/>Restart sign-in</button>}
    {!showScreen&&<p className={styles.privacy}>Your password is used to connect and isn’t saved by Twin.</p>}
  </section>;
}
