import React, { useMemo, useSyncExternalStore } from 'react';
const subscribe=(fn:()=>void)=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};
const locationSnapshot=()=>window.location.pathname+window.location.search;
export const usePathname=()=>useSyncExternalStore(subscribe,locationSnapshot).split('?')[0].replace(/\/$/,'')||'/';
export function useSearchParams(){const value=useSyncExternalStore(subscribe,locationSnapshot);return useMemo(()=>new URLSearchParams(value.split('?')[1]||''),[value]);}
const navigate=(href:string,replace=false)=>{window.history[replace?'replaceState':'pushState']({},'',href);window.dispatchEvent(new PopStateEvent('popstate'));};
const router={push:(href:string)=>navigate(href),replace:(href:string)=>navigate(href,true),refresh:()=>{},prefetch:()=>{}};
export const useRouter=()=>router;
export const setCloneScope=async()=>{};
export default React.forwardRef<HTMLAnchorElement,any>(function Link({href,children,onClick,prefetch,replace,scroll,...props},ref){return <a {...props} ref={ref} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey&&String(href).startsWith('/')){event.preventDefault();navigate(href,replace);}}}>{children}</a>;});
export const useLinkStatus=()=>({pending:false});
