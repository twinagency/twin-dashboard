"use client";
import { useEffect, useState } from 'react';
import InboxView from '@/components/onlyfans-preview/InboxView';
import { availableActions, canSubmitCommand, commandForAction, createCommandRequest } from '@/lib/onlyfans-preview/actions';
import type { AvailableAction, CommandPayload, CommandResult, PreviewViewer, ConversationDetail } from '@/lib/onlyfans-preview/types';
import { demoNow, demoId, money } from '@/lib/agency-demo/model';
import { Button, Empty, useWorkspace } from './WorkspaceContext';

export default function DemoInbox(){
 const {state,ids,canEdit,focusedFan,focusFan,openFan,update,notify}=useWorkspace();
 const accounts=state.accounts.filter(a=>ids.includes(a.binding.creatorId));
 const [accountId,setAccountId]=useState(accounts[0]?.accountId||''),[selected,setSelected]=useState(''),[result,setResult]=useState<CommandResult|null>(null),[sent,setSent]=useState(0);
 const active=accounts.find(a=>a.accountId===accountId)||accounts[0]||null;
 const fan=state.fans.find(f=>f.id===focusedFan&&ids.includes(f.creatorId)&&f.conversationId);
 useEffect(()=>{if(fan){setAccountId(fan.accountId);setSelected(fan.conversationId);setResult(null)}},[fan?.id]);
 const details=Object.values(state.conversations).filter(d=>d.accountId===active?.accountId);
 const detail=details.find(d=>d.conversationId===selected)||details[0]||null;
 const currentFan=state.fans.find(f=>f.conversationId===detail?.conversationId);
 const viewer:PreviewViewer={kind:'operator',label:canEdit?'Demonstration manager':'Read-only demonstration',canManage:canEdit,scopedAccountIds:accounts.map(a=>a.accountId)};
 function selectConversation(id:string){setSelected(id);setResult(null);const f=state.fans.find(f=>f.conversationId===id);if(f)focusFan(f.id);}
 function command(action:AvailableAction,payload:CommandPayload){
  if(!active||!detail)return;
  const request=createCommandRequest({command:commandForAction(action),accountId:active.accountId,conversationId:detail.conversationId,expectedRevision:detail.summary.revision,payload});
  const actionSet=availableActions({account:active,summary:detail.summary,viewer,deliveryIncident:detail.deliveryIncident});
  const accepted=canSubmitCommand(viewer,actionSet,action);
  setResult({simulated:true,applied:false,accepted,refusalReason:accepted?null:(actionSet.blocked.find(e=>e.action===action)?.reason||'Read-only access'),request,note:accepted?'The demonstration has been updated locally. No provider action was performed.':'This action is unavailable in the current demonstration state.'});
  if(!accepted)return;
  update(s=>{const next=structuredClone(s),d=next.conversations[detail.conversationId];d.summary.revision++;
   if(action==='pause_automation')d.summary.automationMode='paused';
   if(action==='resume_automation'||action==='release_takeover'){d.summary.automationMode='automated';d.summary.takeoverState='none';}
   if(action==='request_takeover'){d.summary.automationMode='human_controlled';d.summary.takeoverState='effective';}
   if(action==='mark_no_contact'){d.summary.automationMode='no_contact';d.summary.takeoverState='none';}
   if(action==='resolve_delivery_evidence'){d.deliveryIncident=null;d.summary.delivery=payload.kind==='delivery_resolution'&&payload.decision==='not_delivered'?'failed':'sent';}
   if(action==='send_manual_message'&&payload.kind==='manual_message'){const at=demoNow();d.messages.push({messageId:demoId(),conversationId:d.conversationId,direction:'outbound',origin:'human',body:payload.body,occurredAt:at,delivery:'sent',evidenceRef:null});d.summary.lastMessagePreview=payload.body;d.summary.lastActivityAt=at;d.summary.unreadCount=0;}
   return next;
  },action==='send_manual_message'?'Sample manual reply added':'Conversation handling updated','inbox');
  if(action==='send_manual_message')setSent(v=>v+1);
 }
 function demonstrate(){
  if(!detail||!active||!currentFan||!canEdit)return;
  if(detail.summary.automationMode!=='automated')return notify('Hand this conversation back to automation before playing the sample event.');
  const media=state.media.find(m=>m.creatorId===active.binding.creatorId&&m.status==='Approved');
  update(s=>{const next=structuredClone(s),d=next.conversations[detail.conversationId],at=demoNow();const body='I remembered you enjoy weekend updates. The new collection is ready whenever you would like it.';
   d.messages.push({messageId:demoId(),conversationId:d.conversationId,direction:'outbound',origin:'ai',body,occurredAt:at,delivery:'sent',evidenceRef:null},{messageId:demoId(),conversationId:d.conversationId,direction:'inbound',origin:'fan',body:'Perfect, just picked it up. Thank you!',occurredAt:at,delivery:'sent',evidenceRef:null});
   d.summary.lastMessagePreview='Perfect, just picked it up. Thank you!';d.summary.lastActivityAt=at;d.summary.revision++;
   if(media){next.sales.unshift({id:demoId(),mediaId:media.id,creatorId:active.binding.creatorId,fanId:currentFan.id,staffId:currentFan.staffId,amount:media.price,at,kind:media.kind});d.ownedMedia.push({mediaId:media.id,label:media.title,purchasedAt:at,price:{minorUnits:media.price,currency:'USD'}});}
   return next;
  },'Sample autonomous reply and '+(media?money(media.price)+' purchase':'fan reply')+' added. Reports updated.','reports');
 }
 if(!active)return <Empty title="No channel in this creator scope" detail="Choose another creator to explore the sample inbox."/>;
 return <><div className="demo-inbox-tools"><span className="demo-muted">OnlyFans · sample conversation</span><div><Button small disabled={!currentFan} onClick={()=>currentFan&&openFan(currentFan.id)}>Fan profile & notes</Button><Button small disabled={!canEdit||!detail} onClick={demonstrate}>Play autonomous sale</Button></div></div><div className="demo-inbox"><InboxView key={active.accountId+':'+sent} showPreviewChrome accountsState={{status:'ready',data:accounts}} activeAccount={active} activeAccountId={active.accountId} onSelectAccount={id=>{setAccountId(id);setSelected('');setResult(null)}} conversations={{status:'ready',data:{items:details.map(d=>d.summary),nextCursor:null}}} selectedConversationId={detail?.conversationId||null} onSelectConversation={selectConversation} detailState={detail?{status:'ready',data:detail}:null} viewer={viewer} onCommand={command} commandResult={null} nextCursor={null} loadingMore={false} onLoadMore={()=>notify('All sample conversations are loaded.')}/></div></>;
}
