// Keep sign-in usable on browsers without AbortSignal.any/timeout.
export function signInRequestSignal(timeoutMs:number,signals:readonly AbortSignal[]=[]){
  const controller=new AbortController();
  const listeners:Array<()=>void>=[];
  let timer:ReturnType<typeof setTimeout>|undefined;
  const dispose=()=>{
    if(timer!==undefined){clearTimeout(timer);timer=undefined;}
    for(const remove of listeners.splice(0))remove();
  };
  const abort=(reason?:unknown)=>{
    if(!controller.signal.aborted)controller.abort(reason);
    dispose();
  };
  for(const signal of signals){
    if(signal.aborted){abort(signal.reason);break;}
    const listener=()=>abort(signal.reason);
    signal.addEventListener('abort',listener,{once:true});
    listeners.push(()=>signal.removeEventListener('abort',listener));
  }
  if(!controller.signal.aborted)timer=setTimeout(()=>abort(new DOMException('The request timed out.','TimeoutError')),timeoutMs);
  return {signal:controller.signal,dispose};
}
