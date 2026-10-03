'use strict';
const menuButton=document.querySelector('.menu-button');
const menu=document.querySelector('#mobile-nav');
menuButton?.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');menu.hidden=!open;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu&&!menu.hidden){menu.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation');menuButton.focus();}});
menu?.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation');}));
const features={
chat:{title:'Built around<br>how you speak.',body:'Your personality is the starting point. Your AI uses your conversational style to chat with fans on Telegram, even when you’re offline.',messages:[['outgoing','Finally finished that workout 😅'],['incoming','Okay, I see you! Was it the leg session you were putting off?'],['outgoing','You remembered 😂'],['incoming','Of course. So… stairs tomorrow might be interesting.']]},
remember:{title:'Pick up where<br>you left off.',body:'Your AI can remember details from previous conversations. A favourite song, a big day, an inside joke. Little things that make the next conversation feel more personal.',messages:[['incoming','Hey, how did your first day at the new job go?'],['outgoing','You remembered! Really good actually.'],['incoming','I knew you’d settle in. Did you find a coffee spot nearby yet?'],['outgoing','Priorities 😂 working on it.']]},
earn:{title:'Your content.<br>More possibility.',body:'Give the content you choose another place to sell. Paid messages, content and tips create new ways for fans to support you through the conversation.',messages:[['outgoing','Loved the behind-the-scenes shoot!'],['incoming','That was such a fun day. I have a few more from that set.'],['incoming','Exclusive photo set · US$10\nExample content offer'],['outgoing','Would love to see those.']]}
};
const tabs=[...document.querySelectorAll('[data-feature]')];
function showFeature(tab){const item=features[tab.dataset.feature];tabs.forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;});document.querySelector('#feature-title').innerHTML=item.title;document.querySelector('#feature-body').textContent=item.body;document.querySelector('#feature-panel').setAttribute('aria-labelledby',tab.id);const chat=document.querySelector('#chat-messages');chat.replaceChildren();const date=document.createElement('p');date.className='chat-date';date.textContent='TODAY';chat.append(date);for(const[type,content]of item.messages){const bubble=document.createElement('div');bubble.className='bubble '+type;bubble.textContent=content;chat.append(bubble);}}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>showFeature(tab));tab.addEventListener('keydown',event=>{let target;if(event.key==='ArrowRight')target=tabs[(index+1)%tabs.length];if(event.key==='ArrowLeft')target=tabs[(index+tabs.length-1)%tabs.length];if(event.key==='Home')target=tabs[0];if(event.key==='End')target=tabs.at(-1);if(target){event.preventDefault();target.focus();showFeature(target);}});});
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
function bounded(input){const raw=Number(input.value);return Number.isFinite(raw)?Math.min(Number(input.max),Math.max(Number(input.min),raw)):0;}
function calculate(){const audience=bounded(document.querySelector('#audience'));const join=bounded(document.querySelector('#join'));const payers=bounded(document.querySelector('#payers'));const spend=bounded(document.querySelector('#spend'));const fans=audience*join/100;const paying=fans*payers/100;document.querySelector('#revenue').textContent=number.format(paying*spend);document.querySelector('#joining-result').textContent=number.format(fans);document.querySelector('#paying-result').textContent=number.format(paying);document.querySelector('#spend-result').textContent='US$'+number.format(spend);for(const id of['audience','join']){const range=document.querySelector('#'+id+'-range');range.value=String(bounded(document.querySelector('#'+id)));const percent=(Number(range.value)-Number(range.min))/(Number(range.max)-Number(range.min))*100;range.style.background=`linear-gradient(to right, #efefed ${percent}%, #3b3b3a ${percent}%)`;}}
if(document.querySelector('.calculator')){for(const id of['audience','join','payers','spend']){const input=document.querySelector('#'+id);input.addEventListener('input',calculate);input.addEventListener('change',()=>{input.value=String(bounded(input));calculate();});const range=document.querySelector('#'+id+'-range');range?.addEventListener('input',()=>{input.value=range.value;calculate();});}document.querySelector('#reset-calculator').addEventListener('click',()=>{for(const[id,value]of Object.entries({audience:100000,join:1,payers:5,spend:30}))document.querySelector('#'+id).value=value;calculate();});calculate();}
const inviteForm=document.querySelector('#invite-form');
inviteForm?.addEventListener('submit',event=>{event.preventDefault();const input=document.querySelector('#invite-code');const error=document.querySelector('#invite-error');let code=input.value.trim();if(/^https?:/i.test(code)){try{const link=new URL(code);if(link.protocol!=='https:'||!['dashboard.lynqai.co','dashboard.tgaiclone.xyz'].includes(link.hostname)||link.pathname!=='/creator/signup')throw new Error();code=link.searchParams.get('code')||'';}catch{error.textContent='Please use the creator signup invitation sent by Moxy, or paste just your invitation code.';error.hidden=false;input.setAttribute('aria-invalid','true');return;}}if(!/^[a-zA-Z0-9_-]{6,256}$/.test(code)){error.textContent='Enter the complete invitation code or signup link sent by Moxy.';error.hidden=false;input.setAttribute('aria-invalid','true');return;}error.hidden=true;input.removeAttribute('aria-invalid');window.location.assign('https://dashboard.lynqai.co/creator/signup?code='+encodeURIComponent(code));});
document.querySelector('#invite-code')?.addEventListener('input',event=>{document.querySelector('#invite-error').hidden=true;event.target.removeAttribute('aria-invalid');});

const homeDemos={
chat:[['fan','Do you remember my big day tomorrow?'],['ai','Your first day at the new job 🤍 How are you feeling?']],
memory:[['fan','You remembered my favourite song?'],['ai','Of course. The one you had on repeat after our last chat.']],
content:[['fan','Got any more from that shoot?'],['ai','A few favourites you haven’t seen yet. Exclusive photo set · US$10.']]
};
const homeDemoButtons=[...document.querySelectorAll('[data-home-demo]')];
homeDemoButtons.forEach(button=>button.addEventListener('click',()=>{
const panel=document.querySelector('#home-demo-messages');panel.replaceChildren();
for(const[type,content]of homeDemos[button.dataset.homeDemo]){const item=document.createElement('p');item.className='home-bubble home-'+type;item.textContent=content;panel.append(item);}
homeDemoButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
}));

const heroSpeech=document.querySelector('.hero-speech');
const heroPortrait=document.querySelector('.hero-portrait');
const heroPortraitFrame=document.querySelector('.hero-portrait-frame');
if(heroSpeech&&heroPortrait&&heroPortraitFrame){
  const positionHeroSpeech=()=>{
    const photo=heroPortrait.getBoundingClientRect();
    const frame=heroPortraitFrame.getBoundingClientRect();
    if(!photo.width||!photo.height)return;
    const phoneX=photo.left-frame.left+photo.width*.496;
    const phoneY=photo.top-frame.top+photo.height*.406;
    const faceLeft=photo.left-frame.left+photo.width*.625;
    const width=Math.min(184,Math.max(112,faceLeft-20),frame.width-16);
    heroSpeech.style.width=width+'px';
    const maxLeft=Math.min(frame.width-width-8,faceLeft-width-10);
    const left=Math.max(8,Math.min(phoneX-width*.55,maxLeft));
    const top=Math.max(8,phoneY-heroSpeech.offsetHeight-14);
    heroSpeech.style.left=left+'px';
    heroSpeech.style.top=top+'px';
    heroSpeech.setAttribute('data-positioned','');
  };
  heroPortrait.addEventListener('load',positionHeroSpeech);
  window.addEventListener('resize',positionHeroSpeech);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(positionHeroSpeech).observe(heroPortraitFrame);
  document.fonts?.ready.then(positionHeroSpeech);
  positionHeroSpeech();
}
