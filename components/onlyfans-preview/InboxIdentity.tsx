"use client";
import {createContext, useContext, useMemo, useState, type ReactNode} from "react";
type Identity = {creatorId:string; creatorName:string; handle:string} | null;
const Context = createContext<{identity:Identity; setIdentity:(identity:Identity)=>void}>({identity:null,setIdentity:()=>{}});
export function InboxIdentityProvider({children}:{children:ReactNode}) {
 const [identity,setIdentity]=useState<Identity>(null);
 const value=useMemo(()=>({identity,setIdentity}),[identity]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useInboxIdentity=()=>useContext(Context);
