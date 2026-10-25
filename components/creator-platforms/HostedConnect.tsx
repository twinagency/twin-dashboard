'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent,type KeyboardEvent,type PointerEvent} from 'react';
import {ArrowRight,CheckCircle2,LoaderCircle,RefreshCw} from 'lucide-react';
import {currentSignInAttempt,parseSignInAttempt,type SignInAttempt} from '@/lib/onlyfans-sign-in/model';
import {parsePublicProxy,type PublicProxy} from '@/lib/onlyfans-managed-proxy/public';
import {ProxySummary} from '@/components/onlyfans-preview/ProxyDetails';
import styles from './HostedConnect.module.css';

const creatorRoute='/creator-auth/platforms/onlyfans/sign-in';
class SignInRequestError extends Error{constructor(readonly status:number,message:string){super(message);}}
export default function HostedConnect({profileId,accountId,disabled,onChanged,endpoint=creatorRoute,connection,sessionMessage='Sign in to your creator account again.'}:{profileId:string;accountId:string|null;disabled:boolean;onChanged:(enrollmentId?:string|null)=>Promise<boolean>;endpoint?:string;connection?:{accountId:string|null;proxyUrl:string|null;managedProxy?:{countryCode:string;handle:string}};sessionMessage?:string}){
  const route=endpoint;
  const [proxy,setProxy]=useState<PublicProxy|null>(null),pendingProxy=useRef<PublicProxy|null>(null);
  const [attempt,setAttempt]=useState<SignInAttempt|null>(null),[notice,setNotice]=useState(''),[statusNotice,setStatusNotice]=useState(''),[busy,setBusy]=useState(false),[sessionLost,setSessionLost]=useState(false),[showScreen,setShowScreen]=useState(false),[screenReady,setScreenReady]=useState(false),[keyboardOpen,setKeyboardOpen]=useState(false);
  const [screenUpdating,setScreenUpdating]=useState(false);
  const screenBlocked=useRef(true),cancelFrame=useRef<(()=>void)|null>(null),paintFrame=useRef<((blob:Blob,version:number,fromInput?:boolean)=>Promise<boolean>)|null>(null);
  const live=useRef(false),current=useRef<SignInAttempt|null>(null),started=useRef(false),startKey=useRef('');
  const canvas=useRef<HTMLCanvasElement>(null),keyboard=useRef<HTMLInputElement>(null),queue=useRef(Promise.resolve()),pendingInputs=useRef<Array<{input:Record<string,unknown>;identity:string;version:number}>>([]);
  const lastPaint=useRef({version:-1,time:0});
  const inputVersion=useRef(0),refreshFrame=useRef<(()=>void)|null>(null),commands=useRef(0),loginForm=useRef<HTMLFormElement>(null);
  const generation=useRef(0),pointer=useRef<{id:number;version:number;kind:string;x:number;y:number;left:number;top:number;width:number;height:number}|null>(null),changed=useRef(onChanged);changed.current=onChanged;
  const save=useCallback((value:SignInAttempt)=>{if(live.current){const next=currentSignInAttempt(value);current.current=next;setAttempt(next);if(next.phase!=='waiting'){loginForm.current?.reset();keyboard.current?.blur();setKeyboardOpen(false);}}},[]);
  const requestError=useCallback((error:unknown)=>{
    if(!live.current)return;
    if(error instanceof SignInRequestError&&[401,403].includes(error.status)){
      generation.current++;pendingInputs.current=[];loginForm.current?.reset();keyboard.current?.blur();current.current=null;setAttempt(null);setShowScreen(false);setProxy(null);setSessionLost(true);setNotice(sessionMessage);void changed.current();
    }else if(error instanceof SignInRequestError&&[404,410].includes(error.status)){
      generation.current++;pendingInputs.current=[];if(current.current)save({...current.current,phase:'expired',keyboard:null});setShowScreen(false);setNotice('Your sign-in expired. Start again.');setStatusNotice('');
    }
  },[save,sessionMessage]);
  const command=useCallback(async(action:string,extra:Record<string,unknown>={},receiveFrame?: (blob:Blob)=>Promise<void>)=>{
    commands.current++;
    try{
      const response=await fetch(route,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json',...(receiveFrame?{Accept:'image/png'}:{})},body:JSON.stringify({action,profileId,...extra,...(connection&&['start','confirm'].includes(action)?{connection}:{})}),signal:AbortSignal.timeout(12000)});
      if(response.ok&&receiveFrame&&['image/png','image/jpeg'].includes(response.headers.get('content-type')?.split(';')[0]??'')){
        let value:SignInAttempt|null=null;
        try{value=parseSignInAttempt(JSON.parse(decodeURIComponent(response.headers.get('x-twin-sign-in-attempt')??'')));}catch{}
        if(!value||value.id!==extra.attempt)throw new Error('Your sign-in response could not be confirmed.');
        // A decode/download failure must not replay an already accepted input.
        try{await receiveFrame(await response.blob());}catch{}
        return value;
      }
      const result=await response.json().catch(()=>null),value=result?.ok===true?parseSignInAttempt(result.attempt):null;
      if(!response.ok||!value)throw new SignInRequestError(response.status,result?.error||'Your sign-in could not be confirmed. Please try again.');if(action==='start')pendingProxy.current=parsePublicProxy(result.proxy);return value;
    }finally{commands.current--;}
  },[profileId,route,connection]);
  const start=useCallback(async()=>{
    if(disabled||sessionLost)return;setBusy(true);setNotice('');setStatusNotice('');const version=++generation.current;
    try{if(!startKey.current)startKey.current=crypto.randomUUID();const result=await command('start',{startKey:startKey.current,accountId});if(live.current&&version===generation.current){setProxy(pendingProxy.current);save(result);}}
    catch(error){if(live.current&&version===generation.current){setNotice(error instanceof Error?error.message:'Sign-in is temporarily unavailable.');requestError(error);}}
    finally{if(live.current)setBusy(false);}
  },[accountId,command,disabled,save,sessionLost,requestError]);
  useEffect(()=>{live.current=true;return()=>{live.current=false;pendingInputs.current=[];};},[]);
  useEffect(()=>{if(!started.current&&!disabled){started.current=true;void start();}},[disabled,start]);
  useEffect(()=>{
    if(!attempt||!['opening','waiting','submitted'].includes(attempt.phase)||disabled||sessionLost)return;
    let active=true,running=false;const controller=new AbortController();
    const poll=async()=>{if(running||commands.current||document.visibilityState==='hidden')return;running=true;const version=generation.current,input=inputVersion.current;try{
      const response=await fetch(route+'?attempt='+attempt.id,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});const body=await response.json().catch(()=>null),value=body?.ok===true?parseSignInAttempt(body.attempt):null;
      if(!response.ok||!value)throw new SignInRequestError(response.status,body?.error||'Your sign-in status could not be loaded.');
      if(active&&version===generation.current&&input===inputVersion.current&&!commands.current){save(value);setStatusNotice('');if(value.phase==='submitted')await changed.current(value.enrollmentId);}
    }catch(error){if(active&&version===generation.current){setStatusNotice(error instanceof Error?error.message:'Your sign-in status could not be loaded.');requestError(error);}}finally{running=false;}};
    const timer=window.setInterval(()=>void poll(),1500);void poll();return()=>{active=false;controller.abort();clearInterval(timer);};
  },[attempt?.id,attempt?.phase,disabled,sessionLost,save,requestError]);
  useEffect(()=>{
    if(!attempt||!['opening','waiting','ready'].includes(attempt.phase))return;
    const timer=window.setTimeout(()=>{if(current.current?.id===attempt.id){generation.current++;pendingInputs.current=[];save({...attempt,phase:'expired',keyboard:null});setShowScreen(false);setNotice('Your sign-in expired. Start again.');}},Math.max(0,Date.parse(attempt.expiresAt)-Date.now()));
    return()=>window.clearTimeout(timer);
  },[attempt?.id,attempt?.expiresAt,attempt?.phase,save]);
  useEffect(()=>{
    if(!attempt||attempt.phase!=='waiting'||disabled||sessionLost||!showScreen)return;
    let active=true,badFrames=0,running=false,redraw=false;const controller=new AbortController();let timer:number,frameRequest:AbortController|null=null;screenBlocked.current=true;lastPaint.current={version:-1,time:0};setScreenReady(false);setScreenUpdating(false);
    const schedule=(delay=0)=>{clearTimeout(timer);timer=window.setTimeout(()=>void draw(),delay);};
    cancelFrame.current=()=>{clearTimeout(timer);frameRequest?.abort();redraw=true;};
    refreshFrame.current=()=>{if(running)redraw=true;else schedule();};
    const screenError='Your sign-in screen could not be loaded. Restart sign-in to continue.';
    const paint=async(blob:Blob,version:number,fromInput=false)=>{
      const image=await createImageBitmap(blob);
      try{
        if(!active||version!==inputVersion.current||pendingInputs.current.length||(!fromInput&&commands.current)||!canvas.current)return false;
        const context=canvas.current.getContext('2d');if(!context)throw new Error('canvas_unavailable');
        if(canvas.current.width!==image.width||canvas.current.height!==image.height){canvas.current.width=image.width;canvas.current.height=image.height;}
        context.drawImage(image,0,0);lastPaint.current={version,time:performance.now()};badFrames=0;screenBlocked.current=false;setScreenReady(true);setScreenUpdating(false);setNotice(value=>value===screenError?'':value);
        return true;
      }finally{image.close();}
    };
    paintFrame.current=paint;
    const draw=async()=>{if(running)return;running=true;redraw=false;const version=inputVersion.current;try{
      await queue.current;if(!active)return;if(version!==inputVersion.current){redraw=true;return;}
      if(lastPaint.current.version===version&&performance.now()-lastPaint.current.time<1000){redraw=false;return;}
      // Only a frame requested after the input queue drained can unlock clicks.
      frameRequest=new AbortController();
      const r=await fetch(route+'?attempt='+attempt.id+'&frame=1',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.any([controller.signal,frameRequest.signal,AbortSignal.timeout(12000)])});
      if([401,403,404,410].includes(r.status))throw new SignInRequestError(r.status,'Your sign-in screen could not be loaded.');
      if(!r.ok||!['image/jpeg','image/png'].includes(r.headers.get('content-type')?.split(';')[0]??''))throw new Error('frame_unavailable');
      await paint(await r.blob(),version);
    }catch(error){if(active&&!frameRequest?.signal.aborted){if(error instanceof SignInRequestError)requestError(error);else if(++badFrames>=3){screenBlocked.current=true;setScreenReady(false);setNotice(screenError);}}}finally{frameRequest=null;running=false;if(active)schedule(redraw?0:1000);}};
    void draw();return()=>{active=false;screenBlocked.current=true;pointer.current=null;controller.abort();frameRequest?.abort();cancelFrame.current=null;refreshFrame.current=null;paintFrame.current=null;clearTimeout(timer);};
  },[attempt?.id,attempt?.phase,disabled,sessionLost,showScreen,requestError]);
  function send(input:Record<string,unknown>){
    if(disabled||sessionLost||current.current?.phase!=='waiting')return;
    // A queued pointer action could land on a page the user has not seen yet.
    if((input.type==='click'||input.type==='scroll')&&screenBlocked.current)return;
    screenBlocked.current=true;setScreenUpdating(true);cancelFrame.current?.();
    const identity=current.current.id,version=generation.current;inputVersion.current++;
    pendingInputs.current.push({input,identity,version});
    queue.current=queue.current.then(async()=>{
      const next=pendingInputs.current.shift();if(!next)return;
      if(!live.current||next.version!==generation.current)return;
      // Briefly collect a typing burst before the network request, preserving field changes.
      if(next.input.type==='text')await new Promise(resolve=>window.setTimeout(resolve,35));
      if(!live.current||next.version!==generation.current)return;
      let payload=next.input;
      // Merge only adjacent text; clicks and field changes retain their order.
      while(payload.type==='text'&&pendingInputs.current[0]?.input.type==='text'&&pendingInputs.current[0].identity===next.identity&&pendingInputs.current[0].version===next.version){
        const text=String(payload.text)+String(pendingInputs.current[0].input.text);
        if(new TextEncoder().encode(text).length>512)break;
        pendingInputs.current.shift();payload={type:'text',text};
      }
      const frameVersion=inputVersion.current,paint=paintFrame.current;
      const receiveFrame=paint&&pendingInputs.current.length===0?async(blob:Blob)=>{
        if(live.current&&next.version===generation.current)await paint(blob,frameVersion,true);
      }:undefined;
      try{const result=await command('input',{attempt:next.identity,input:payload},receiveFrame);if(live.current&&next.version===generation.current){save(result);refreshFrame.current?.();}}
      catch(error){if(live.current&&next.version===generation.current){setNotice('That input was not confirmed. Restart sign-in to continue.');if(current.current)save({...current.current,phase:'failed'});requestError(error);generation.current++;pendingInputs.current=[];}}
    });
  }
  function type(event:KeyboardEvent<HTMLInputElement>){
    if(['Enter','Tab','Backspace','Delete','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();send({type:'key',key:event.key});}
  }
  function press(event:PointerEvent<HTMLCanvasElement>){event.preventDefault();if(screenBlocked.current||pointer.current)return;const box=event.currentTarget.getBoundingClientRect();pointer.current={id:event.pointerId,version:inputVersion.current,kind:event.pointerType,x:event.clientX,y:event.clientY,left:box.left,top:box.top,width:box.width,height:box.height};event.currentTarget.setPointerCapture(event.pointerId);if(event.pointerType!=='mouse'||!window.matchMedia('(hover: hover) and (pointer: fine)').matches)keyboard.current?.blur();}
  function release(event:PointerEvent<HTMLCanvasElement>){event.preventDefault();const p=pointer.current;if(!p||p.id!==event.pointerId)return;pointer.current=null;if(screenBlocked.current||p.version!==inputVersion.current)return;const box=p,dy=p.y-event.clientY;if(Math.abs(dy)>18)send({type:'scroll',delta:Math.max(-1000,Math.min(1000,dy*720/box.height)),x:Math.max(0,Math.min(1,(p.x-box.left)/box.width)),y:Math.max(0,Math.min(1,(p.y-box.top)/box.height))});else if(Math.abs(p.x-event.clientX)<18){send({type:'click',x:Math.max(0,Math.min(1,(p.x-box.left)/box.width)),y:Math.max(0,Math.min(1,(p.y-box.top)/box.height))});if(p.kind==='mouse'&&window.matchMedia('(hover: hover) and (pointer: fine)').matches)keyboard.current?.focus({preventScroll:true});}}
  async function login(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||disabled||sessionLost||current.current?.phase!=='waiting')return;
    const form=event.currentTarget,values=new FormData(form);
    const input={type:'login',email:String(values.get('email')??'').trim(),password:String(values.get('password')??'')};
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    setBusy(true);setNotice('');setStatusNotice('');inputVersion.current++;const version=generation.current,identity=current.current.id;
    try{const result=await command('input',{attempt:identity,input});if(live.current&&version===generation.current){save(result);setShowScreen(result.phase==='waiting');}}
    catch(error){if(live.current&&version===generation.current){setNotice('OnlyFans sign-in could not be submitted. Please try again.');requestError(error);}}
    finally{input.password='';form.reset();if(live.current)setBusy(false);}
  }
  async function confirm(){if(!attempt||busy||sessionLost)return;setBusy(true);setNotice('');inputVersion.current++;const version=generation.current;try{const result=await command('confirm',{attempt:attempt.id});if(live.current&&version===generation.current){save(result);await changed.current(result.enrollmentId);}}catch(error){if(live.current&&version===generation.current){setNotice(error instanceof Error?error.message:'Your connection could not be confirmed. Retry the same confirmation.');requestError(error);}}finally{if(live.current)setBusy(false);}}
  async function restart(){if(busy||sessionLost)return;setBusy(true);generation.current++;pendingInputs.current=[];setStatusNotice('');loginForm.current?.reset();try{if(current.current){try{await command('cancel',{attempt:current.current.id});}catch(error){if(!(error instanceof SignInRequestError&&[404,410].includes(error.status)))throw error;}}if(!live.current)return;current.current=null;setAttempt(null);setProxy(null);setShowScreen(false);startKey.current=crypto.randomUUID();await start();}catch(error){if(live.current){setNotice('Your previous sign-in could not be closed. Please try again.');requestError(error);}}finally{if(live.current)setBusy(false);}}
  const failed=attempt&&['failed','wrong_account','expired','cancelled'].includes(attempt.phase);
  return <section className={styles.root} data-hosted-connect data-stage={showScreen&&attempt?.phase==='waiting'?'verification':'form'}>
    {proxy&&!sessionLost&&<ProxySummary proxy={proxy}/>}
    {!sessionLost&&((!attempt&&!notice)||attempt?.phase==='opening')&&<div className={styles.loading}><LoaderCircle className={styles.spinner} size={22}/><p>Opening your OnlyFans sign-in…</p></div>}
    {attempt?.phase==='waiting'&&<>
      {!showScreen?<form ref={loginForm} className={styles.loginForm} aria-label="OnlyFans login" onSubmit={event=>void login(event)}>
        <div className={styles.welcome}><span className={styles.step}>YOUR ACCOUNT</span><h3>Bring your OnlyFans<br/>into your space.</h3><p>Sign in once to connect your account.</p></div>
        <label>Email address<input name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" required disabled={busy}/></label>
        <label>OnlyFans password<input name="password" type="password" autoComplete="current-password" required disabled={busy}/></label>
        <button type="submit" className={styles.primary} disabled={busy||disabled}>{busy?<><LoaderCircle className={styles.spinner} size={18}/>Signing in…</>:<>Sign in<ArrowRight size={17}/></>}</button>
        <p className={styles.privacy}>OnlyFans may ask you to complete verification.</p>
        <button type="button" className={styles.otherOptions} onClick={()=>setShowScreen(true)}>Other sign-in options</button>
      </form>:<>
      <p className={styles.intro}>Complete the verification below.</p>
      <div className={styles.viewer} aria-busy={!screenReady||screenUpdating}>
        {!screenReady&&<div className={styles.screenLoading} role="status"><LoaderCircle size={22} className={styles.spinner}/>Loading your sign-in…</div>}
        {screenReady&&screenUpdating&&<div className={styles.screenUpdating} role="status"><span><LoaderCircle size={17} className={styles.spinner}/>Updating…</span></div>}
        <canvas ref={canvas} width={432} height={720} className={styles.screen} data-ready={screenReady} aria-disabled={!screenReady||screenUpdating} aria-label="OnlyFans sign-in screen" onPointerDown={press} onPointerUp={release} onPointerCancel={()=>{pointer.current=null;}} onWheel={event=>{event.preventDefault();const box=event.currentTarget.getBoundingClientRect();send({type:'scroll',delta:Math.max(-1000,Math.min(1000,event.deltaY)),x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))});}}/>
        <input ref={keyboard} className={styles.keyboard} aria-label="Type in the selected OnlyFans field" type={attempt.keyboard==='password'?'password':attempt.keyboard==='email'?'email':'text'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onFocus={()=>setKeyboardOpen(true)} onBlur={()=>setKeyboardOpen(false)} onKeyDown={type} onBeforeInput={event=>{if((event.nativeEvent as InputEvent).inputType==='deleteContentBackward'){event.preventDefault();send({type:'key',key:'Backspace'});}}} onChange={event=>{if((event.nativeEvent as InputEvent).isComposing)return;const value=event.currentTarget.value;event.currentTarget.value='';if(value)send({type:'text',text:value});}} onCompositionEnd={event=>{const value=event.currentTarget.value;event.currentTarget.value='';if(value)send({type:'text',text:value});}}/>
      </div>
      <div className={styles.tools}><button type="button" onClick={()=>{keyboard.current?.blur();setShowScreen(false);}}>Back to sign-in</button><button type="button" onClick={()=>keyboardOpen?keyboard.current?.blur():keyboard.current?.focus({preventScroll:true})}>{keyboardOpen?'Hide keyboard':'Show keyboard'}</button>{keyboardOpen&&<><button type="button" onPointerDown={event=>event.preventDefault()} onClick={()=>{send({type:'key',key:'Tab'});keyboard.current?.focus({preventScroll:true});}}>Next field</button><button type="button" onPointerDown={event=>event.preventDefault()} onClick={()=>send({type:'key',key:'Enter'})}>Enter ↵</button></>}</div>
      </>}
    </>}
    {attempt?.phase==='ready'&&<div className={styles.ready}><CheckCircle2 size={28}/><h3>Connect @{attempt.handle}?</h3><p>This account will join your existing creator profile.</p><button className={styles.primary} disabled={busy||disabled} onClick={()=>void confirm()}>{busy?'Connecting…':'Connect this account'}<ArrowRight size={17}/></button></div>}
    {attempt?.phase==='submitted'&&<p role="status" className={styles.loading}><LoaderCircle className={styles.spinner} size={21}/>Checking your account. You’ll return here when it’s connected.</p>}
    {failed&&!notice&&<p role="status">{attempt.phase==='wrong_account'?'That is a different OnlyFans account. Restart and sign in to the selected account.':'Your sign-in ended. Start again to connect.'}</p>}
    {statusNotice&&!notice&&<p role="status" className={styles.notice}>{statusNotice}</p>}
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    {!sessionLost&&(notice||failed)&&<button className={styles.secondary} disabled={busy||disabled} onClick={()=>void restart()}><RefreshCw size={15}/>Restart sign-in</button>}
    {!showScreen&&<p className={styles.privacy}>Your password is used to connect and isn’t saved by Twin.</p>}
  </section>;
}

