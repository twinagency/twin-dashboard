import type { Fan, Handling, Platform, WorkspaceState } from '../fans/types';
import { channelKey, compatibleChannelKeys, normalizePlatform, normalizePlatformText } from '../fans/model';
export const INBOX_STORAGE = 'twin-unified-inbox-v1';
export const operators = ['Unassigned', 'Jesse', 'Sarah', 'Alex'] as const;
export type ThreadState = { unread?: boolean; resolved?: boolean; assignee?: string; followUp?: { at: string; note: string; paused: boolean }; activity?: { at: string; text: string }[] };
export type Offer = { id: string; messageId: string; fanId: string; platform: Platform; itemId: string; title: string; amount: number; currency: 'USD' | 'Stars'; at: string };
export type InboxState = { version: 1; threads: Record<string, ThreadState>; defaults: Record<string, Handling>; offers: Offer[]; voiceDrafts: Record<string, string> };
export const emptyInbox = (): InboxState => ({version:1,threads:{},defaults:{},offers:[],voiceDrafts:{}});
export const inboxHref = (fan: Fan, platform?: Platform, source?: string) => `/inbox?${new URLSearchParams({creator:fan.creatorId,fan:fan.id,platform:platform || fan.accounts[0].platform,...(source?{source}:{})})}`;
export function effectiveMode(fan: Fan, platform: Platform, workspace: WorkspaceState, inbox: InboxState): Handling {
 return workspace.modes[channelKey(fan.id,platform)] || inbox.defaults[`${fan.creatorId}:${platform}`] || 'Copilot';
}
export function isUnread(fan:Fan,platform:Platform,inbox:InboxState){return inbox.threads[channelKey(fan.id,platform)]?.unread ?? (fan.unread>0&&platform===fan.accounts[0].platform);}
export function takeOver(inbox: InboxState, key: string, at: string): InboxState {
 const t=inbox.threads[key]||{};return {...inbox,threads:{...inbox.threads,[key]:{...t,followUp:t.followUp?{...t.followUp,paused:true}:undefined,activity:[...(t.activity||[]),{at,text:'Human takeover. Automated replies and scheduled follow-ups paused.'}].slice(-60)}}};
}
export function restoreInbox(raw:string|null,fans:Fan[]):InboxState{
 const out=emptyInbox();if(!raw||raw.length>2_000_000)return out;
 try{const v=JSON.parse(raw);if(v?.version!==1)return out;
  for(const fan of fans)for(const a of fan.accounts){const key=channelKey(fan.id,a.platform),aliases=compatibleChannelKeys(fan.id,a.platform),t=aliases.map(alias=>v.threads?.[alias]).find(t=>t&&typeof t==='object');
   if(t&&typeof t==='object'){const follow=t.followUp;out.threads[key]={unread:typeof t.unread==='boolean'?t.unread:undefined,resolved:typeof t.resolved==='boolean'?t.resolved:undefined,assignee:operators.includes(t.assignee)?t.assignee:undefined,followUp:follow&&typeof follow.note==='string'&&follow.note.length<=1000&&Number.isFinite(Date.parse(follow.at))?{at:follow.at,note:normalizePlatformText(follow.note),paused:!!follow.paused}:undefined,activity:Array.isArray(t.activity)?t.activity.filter((x:any)=>typeof x.text==='string'&&x.text.length<=1000&&Number.isFinite(Date.parse(x.at))).slice(-60).map((x:any)=>({...x,text:normalizePlatformText(x.text)})):[]};}
   const voice=aliases.map(alias=>v.voiceDrafts?.[alias]).find(value=>typeof value==='string');if(typeof voice==='string')out.voiceDrafts[key]=normalizePlatformText(voice.slice(0,2000));
   const defaultKey=`${fan.creatorId}:${a.platform}`,mode=compatibleChannelKeys(fan.creatorId,a.platform).map(alias=>v.defaults?.[alias]).find(mode=>['Human','Copilot','Autonomous'].includes(mode));if(mode)out.defaults[defaultKey]=mode;
  }
  if(Array.isArray(v.offers))out.offers=v.offers.filter((o:any)=>o&&typeof o==='object').map((o:any)=>({...o,platform:normalizePlatform(o.platform),title:typeof o.title==='string'?normalizePlatformText(o.title):o.title})).filter((o:any)=>typeof o.id==='string'&&typeof o.messageId==='string'&&typeof o.itemId==='string'&&typeof o.title==='string'&&o.title.length<=140&&Number.isFinite(o.amount)&&o.amount>0&&o.amount<=1_000_000&&(o.platform==='telegram'?o.currency==='Stars'&&Number.isInteger(o.amount):o.currency==='USD')&&Number.isFinite(Date.parse(o.at))&&fans.some(f=>f.id===o.fanId&&f.accounts.some(a=>a.platform===o.platform))).slice(-200);
 }catch{}return out;
}
