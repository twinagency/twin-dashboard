import type { Creator, Fan, HistoryEvent, Memory, Message, Purchase } from '../fans/types';
import { DEMO_HISTORY, DEMO_OWNED, DEMO_PRICE, demoTotals, type DemoState } from './movie-night-model';

// Fictional presentation records only, kept out of authoredFans and the ledger.
export const RONAN_DEMO_ID = 'briana-ronan-demo';
export const RONAN_DEMO_CREATORS: Creator[] = [{id:'briana',name:'Bri',initials:'BR',color:'#3972f1'}];
const prepared: Message[] = [
  {id:'ronan-introduction',platform:'onlyfans',direction:'in',at:'2026-08-02T10:15:00Z',text:'Hey Bri, I’m Ronan. Brisbane boy. Usually around late because I work evening shifts in logistics.'},
  {id:'ronan-birthday',platform:'onlyfans',direction:'in',at:'2026-08-05T11:20:00Z',text:'May 17, 1991. Turned 35 this year. My younger brother Ethan still thinks that makes me ancient 😂'},
  {id:'ronan-work',platform:'onlyfans',direction:'in',at:'2026-08-12T12:10:00Z',text:'I’m an operations supervisor at a distribution centre. Mostly evening shifts. James is on my team, we cover for each other when we need to.'},
  {id:'ronan-study',platform:'onlyfans',direction:'in',at:'2026-08-20T09:45:00Z',text:'Been doing a Diploma of Project Management part time while working. Last assessment is finally done. Hoping to move into a project role next year.'},
  {id:'ronan-weekends',platform:'onlyfans',direction:'in',at:'2026-08-24T08:30:00Z',text:'Gym three times a week when the roster lets me. Hiking on a free Sunday. Otherwise it’s me, Milo and a film. Milo’s my rescue kelpie, absolute menace.'},
  {id:'ronan-favourites',platform:'onlyfans',direction:'in',at:'2026-09-02T11:10:00Z',text:'Flat white in the morning, ramen after a late shift. Mostly alternative rock in the car. I’m a thriller guy when I actually stay awake long enough to watch one.'},
  {id:'ronan-style',platform:'onlyfans',direction:'in',at:'2026-09-10T12:30:00Z',text:'I like these little check-ins with you. Short messages after work suit me. You remembering the small things is what gets me smiling. Candid pics always feel more like you.'},
  {id:'ronan-graduation',platform:'onlyfans',direction:'in',at:'2026-09-18T10:05:00Z',text:'Officially graduated today! Diploma of Project Management done. Ethan took me out for dinner. Feels good finishing something I’ve worked at for ages.'},
  {id:'history-video',platform:'onlyfans',direction:'out',at:'2026-10-04T12:25:00Z',text:DEMO_HISTORY.find(item=>item.id==='history-video')!.text},
  {id:'history-work',platform:'onlyfans',direction:'out',at:'2026-10-11T08:20:00Z',text:DEMO_HISTORY.find(item=>item.id==='history-work')!.text},
];
const purchaseInfo: Record<string,{at:string;kind:Purchase['kind']}> = {
  outdoor:{at:'2026-08-10T11:15:00Z',kind:'Photo'},
  shower:{at:'2026-10-04T12:25:00Z',kind:'Video'},
  coffee:{at:'2026-09-12T11:45:00Z',kind:'Video'},
  weekend:{at:'2026-09-25T12:10:00Z',kind:'Bundle'},
};

export function buildRonanProfile(state: DemoState): Fan {
  const messages: Message[] = [...prepared];
  const purchases: Purchase[] = DEMO_OWNED.map(item=>{
    const details=purchaseInfo[item.id];
    const sourceMessageId=item.id==='shower'?'history-video':`receipt-${item.id}`;
    if(item.id!=='shower')messages.push({id:sourceMessageId,platform:'onlyfans',direction:'out',at:details.at,text:`Prepared purchase record: ${item.title}, US$${item.amount.toFixed(2)}. Owned by Ronan.`});
    return {...item,...details,id:`ronan-${item.id}`,platform:'onlyfans',currency:'USD',sourceMessageId};
  });
  state.messages.forEach((item,index)=>messages.push({id:item.id,platform:'onlyfans',direction:item.role==='fan'?'in':'out',text:item.text,at:new Date(Date.UTC(2026,9,11,13,42)+index*15000).toISOString()}));
  messages.sort((a,b)=>a.at.localeCompare(b.at));
  const source=(id:string)=>messages.find(item=>item.id===id)!;
  const memories: Memory[]=[];
  const remember=(id:string,category:string,label:string,value:string,sourceMessageId:string)=>memories.push({id,category,label,value,source:'onlyfans',updatedAt:source(sourceMessageId).at,sourceMessageId});
  remember('birthday','Personal','Birthday','17 May 1991 · Age 35','ronan-birthday');
  remember('graduation','Milestones','Recent graduation','Graduated with a Diploma of Project Management on 18 September 2026. Celebrated with Ethan.','ronan-graduation');
  remember('work-plan','Conversation context','Earlier work plans','May need to stay back at work tonight.','history-work');
  remember('previous-video','Content & purchases','Previous purchase','Shower video purchased on 4 October 2026, last week.','history-video');
  remember('home','Personal','Home','Brisbane, Queensland, Australia','ronan-introduction');
  remember('timezone','Personal','Time zone','Australia/Brisbane · AEST (UTC+10)','ronan-introduction');
  remember('family','Personal','Family','Younger brother Ethan; close enough to celebrate milestones together.','ronan-graduation');
  remember('pet','Personal','Pet','Milo, a rescue kelpie.','ronan-weekends');
  remember('role','Work & routine','Work','Operations supervisor at a distribution centre.','ronan-work');
  remember('shift','Work & routine','Schedule','Usually works evening shifts; often chats after getting home.','ronan-work');
  remember('colleague','Work & routine','Colleague','James is on his team. They cover shifts for each other.','ronan-work');
  remember('study','Milestones','Study journey','Completed the diploma part time alongside work. Final assessment finished in August.','ronan-study');
  remember('career','Milestones','Next career step','Would like to move into a project role in 2027.','ronan-study');
  remember('graduation-follow-up','Follow-ups','Career follow-up','Ask how he is finding life after graduation and whether he has looked at project roles.','ronan-study');
  remember('gym','Interests','Fitness','Gym three times a week when his roster allows.','ronan-weekends');
  remember('outdoors','Interests','Weekends','Enjoys hiking on a free Sunday.','ronan-weekends');
  remember('films','Interests','Movies','Enjoys thrillers; sometimes falls asleep after a long shift.','ronan-favourites');
  remember('music','Interests','Music','Alternative rock on the drive home.','ronan-favourites');
  remember('coffee','Everyday favourites','Coffee order','Flat white.','ronan-favourites');
  remember('food','Everyday favourites','After-work food','Ramen after a late shift.','ronan-favourites');
  remember('reply-style','Communication','Reply style','Short, warm check-ins suit him after work.','ronan-style');
  remember('continuity','Communication','What feels personal','Appreciates small details being remembered without having to repeat himself.','ronan-style');
  remember('photos','Content & purchases','Photo preference','Candid, personal-feeling photos.','ronan-style');

  const history: HistoryEvent[]=[];
  const milestone=(id:string,title:string,summary:string,sourceMessageId:string)=>history.push({id,title,summary,platform:'onlyfans',at:source(sourceMessageId).at,sourceMessageId});
  milestone('joined','First conversation with Bri','Introduced himself and his evening work routine.','ronan-introduction');
  milestone('birthday','Birthday and family remembered','17 May 1991; younger brother Ethan.','ronan-birthday');
  milestone('work','Work context established','Operations supervisor, evening shifts and colleague James.','ronan-work');
  milestone('study','Working towards graduation','Part-time study completed alongside his job.','ronan-study');
  milestone('preferences','Communication preferences learned','Likes short check-ins, remembered details and candid photos.','ronan-style');
  milestone('graduated','Graduated on 18 September','Diploma of Project Management completed; celebrated with Ethan.','ronan-graduation');
  milestone('prior-purchase','Last week’s video purchase','Shower video added to owned content for US$29.00.','history-video');
  milestone('work-plan','Tonight’s earlier work plan','May need to stay back; this is the context for Bri’s opening question.','history-work');
  const covered=messages.some(item=>item.id==='movie-0-3');
  if(covered){
    remember('tonight-shift','Conversation context','Tonight’s late shift','James had to leave, so Ronan covered. He has just arrived home tired.','movie-0-3');
    milestone('late-shift','Late shift confirmed','Ronan explains that he covered for James and has just got home.','movie-0-3');
  }
  if(messages.some(item=>item.id==='movie-1-2'))remember('rewatched','Content & purchases','Recent purchase feedback','Confirmed he has watched last week’s video more than once.','movie-1-2');
  const offer=state.messages.find(item=>item.offer);
  if(offer)milestone('photo-offered','Private photo offered',`One photo offered for US$${DEMO_PRICE.toFixed(2)} after Ronan’s request.`,offer.id);
  if(state.purchased){
    const receipt=state.messages.find(item=>item.role==='system')!;
    purchases.push({id:'ronan-new-photo',platform:'onlyfans',title:'Private photo',kind:'Photo',amount:DEMO_PRICE,currency:'USD',at:source(receipt.id).at,sourceMessageId:receipt.id});
    remember('tonight-purchase','Content & purchases','Tonight’s purchase',`Private photo unlocked for US$${DEMO_PRICE.toFixed(2)}. Already owned; do not offer it again.`,receipt.id);
    milestone('photo-purchased','Private photo purchased','Payment simulated; ownership and relationship spend updated together.',receipt.id);
  }
  if(state.memorySaved){
    const goodbye=state.messages.at(-1)!;
    remember('rest-follow-up','Follow-ups','Next natural check-in','Ask whether he got some rest after covering the late shift. Keep the next message warm and brief.',goodbye.id);
    milestone('follow-up','Conversation closed with a follow-up','Late shift and new purchase retained for the next conversation.',goodbye.id);
  }
  history.sort((a,b)=>a.at.localeCompare(b.at));
  purchases.sort((a,b)=>a.at.localeCompare(b.at));
  const totals=demoTotals(state);
  return {
    id:RONAN_DEMO_ID,creatorId:'briana',name:'Ronan',initials:'R',color:'#3972f1',firstSeen:prepared[0].at,unread:0,
    summary:`Ronan is 35 and lives in Brisbane. He works evening shifts as an operations supervisor and graduated with a Diploma of Project Management on 18 September 2026 after studying part time. He values Bri’s warm, familiar check-ins and the small details she remembers. ${covered?'Tonight he covered for James and arrived home tired.':'Earlier today he mentioned he might need to stay back at work.'} ${state.purchased?'Tonight’s private photo is now owned.':state.offered?'Tonight’s photo offer is awaiting purchase.':'Last week’s video purchase is available as context.'} His relationship record includes ${totals.purchases} purchases totalling US$${totals.spent.toFixed(2)}.${state.memorySaved?' Next check-in: ask whether he got some rest.':''}`,
    accounts:[{platform:'onlyfans',username:'ronan',linkedAt:prepared[0].at}],messages,purchases,memories,history,
    notes:[
      {id:'ronan-note-career',at:'2026-09-18T10:10:00Z',text:'Graduation is a meaningful milestone. Remember the effort it took to finish while working evenings.'},
      {id:'ronan-note-style',at:'2026-09-10T12:35:00Z',text:'Prefers a few personal messages over long replies. Use details naturally rather than listing everything remembered.'},
      {id:'ronan-note-ownership',at:'2026-10-04T12:30:00Z',text:'Check owned content before offering anything new. Earlier purchases remain part of the relationship history.'},
    ],
  };
}
