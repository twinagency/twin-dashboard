'use strict';
/* Mobile adapter only. Source: components/TwinAssistant.tsx, blob
   83bb5068a6d4ab517a9ce810c16d4bdccaa515a7. The dashboard mobile dock uses
   a 118 x 86 canvas. Keep those logical units, original palette, additive
   blending, geometry, glints and shell arcs, scaled uniformly, without the
   explorer's added solid volume. No image-generated asset is used. */
(() => {
  const media = matchMedia('(max-width:720px)');
  const savedBrand = $('home').innerHTML;
  const savedPlaceholder = $('query').placeholder;
  const baseRender = render;
  const baseDraw = draw;
  const baseRestart = restart;
  const miniWrap = node('span', undefined, 'mini-orb-wrap');
  const mini = node('canvas'); mini.id = 'mini-orb'; mini.setAttribute('aria-hidden','true');
  miniWrap.setAttribute('aria-hidden','true'); miniWrap.append(mini);
  const miniCtx = mini.getContext('2d', {alpha:true});
  let miniVisible = false;
  const markerOrder = ['identity','communication','automation','sales','crm','privacy'];
  const captions = {
    identity:['Identity & Memory'], communication:['Voice Cloning','& Communication'],
    automation:['Business','Automation'], sales:['Sales & Customer','Automation'],
    crm:['CRM &','Integrations'], privacy:['Private','Intelligence']
  };
  const motionControl = button('Pause animation', () => {
    $('motion').click(); syncMotion();
  }, 'mobile-motion-button');
  motionControl.id = 'mobile-motion';
  function syncMotion() {
    motionControl.textContent = paused ? 'Resume animation' : 'Pause animation';
    motionControl.setAttribute('aria-pressed', String(paused));
  }
  function layout() {
    if (!media.matches || state.category || state.view !== 'core') return;
    const stage = $('stage'); const w = stage.getBoundingClientRect().width;
    const radius = Math.min(164, w * .365);
    const radiusY = Math.max(178, radius * 1.09);
    const h = radiusY * 2 + 156;
    stage.style.setProperty('--mobile-radius', radius + 'px');
    stage.style.setProperty('--mobile-radius-y', radiusY + 'px');
    stage.style.setProperty('--mobile-stage-height', h + 'px');
    stage.style.setProperty('--mobile-orb-size', Math.min(290, w*.70) + 'px');
    for (const b of $('nodes').children) {
      const i = markerOrder.indexOf(b.dataset.id);
      if (i < 0) continue;
      const angle = -Math.PI/2 + i*Math.PI/3;
      // The ring and marker use this exact same radius and centre.
      const x = w/2 + Math.cos(angle)*radius;
      b.style.setProperty('--mx', x + 'px');
      const labelWidth = w <= 350 ? 108 : 124;
      b.style.setProperty('--label-width', (i === 0 || i === 3 ? Math.min(220, w - 36) : labelWidth) + 'px');
      const side = b.dataset.side === 'left' ? -12 : b.dataset.side === 'right' ? 12 : 0;
      const centre = Math.max(labelWidth/2 + 6, Math.min(w - labelWidth/2 - 6, x + side));
      b.style.setProperty('--label-shift', (i === 0 || i === 3 ? 0 : centre-x) + 'px');
      b.style.setProperty('--my', (h/2 + Math.sin(angle)*radiusY) + 'px');
    }
  }
  function refresh() {
    const active = media.matches;
    document.body.classList.toggle('mobile-design', active);
    document.body.classList.toggle('mobile-root', active && !state.category);
    if (!active) {
      $('home').innerHTML = savedBrand;
      $('query').placeholder = savedPlaceholder;
      miniWrap.remove(); motionControl.remove(); miniVisible=false;
      return;
    }
    $('home').innerHTML='<span class="mobile-brand">Twin<b>.</b></span><span class="mobile-technologies">TECHNOLOGIES</span>';
    $('query').placeholder='Ask Twin…';
    if (!miniWrap.isConnected) $('command').prepend(miniWrap);
    if (!motionControl.isConnected) $('browse-dialog').insertBefore(motionControl, $('browse-close').parentElement);
    syncMotion();
    if (!state.category) {
      $('title').innerHTML='Twin <span>Intelligence Core</span>';
      $('subtitle').textContent='Twin Technologies builds its own autonomous AI, digital identity, commercial infrastructure and connected systems within one unified technology platform.';
      if (state.view==='core') for (const b of $('nodes').children) {
        const mark=node('span',undefined,'mobile-marker');mark.setAttribute('aria-hidden','true');
        const label=node('span',undefined,'node-title');
        (captions[b.dataset.id]||[b.getAttribute('aria-label')]).forEach((s,i)=>{if(i)label.append(document.createElement('br'));label.append(document.createTextNode(s));});
        const caption=node('span',undefined,'mobile-label');
        const item=CATALOGUE.find(c=>c.id===b.dataset.id);
        const order=markerOrder.indexOf(b.dataset.id)+1;
        const meta=node('span',`${String(order).padStart(2,'0')} · ${item.features.length} capabilities`,'mobile-meta');
        meta.setAttribute('aria-hidden','true');
        caption.append(label,meta);
        b.replaceChildren(mark,caption);
      }
    }
    layout();
  }
  render = function(previous) { baseRender(previous); refresh(); };
  const satelliteData=Array.from({length:14},(_,i)=>({angle:(i/14)*Math.PI*2+((i*7)%5)*.11,distance:1.38+((i*13)%7)*.12,elevation:Math.sin(i*2.17)*.72,phase:((i*37)%101)/101,size:.1+((i*11)%5)*.012,speed:(i%2===0?1:-1)*(.000035+(i%4)*.000009)}));

  function paint(context, pixelW, pixelH, ratio, time, rotation, frozen, energy, impulse, isMini) {
    if (!context || pixelW <= 0 || pixelH <= 0) return;
    const c=context, s=Math.min(pixelW,pixelH)/86;
    // Preserve the real dock's proportions, not the size of a generated picture.
    const W=118,H=86,cx=W/2,cy=H*.47;
    c.setTransform(ratio,0,0,ratio,0,0); c.clearRect(0,0,pixelW,pixelH);
    c.translate(pixelW/2-cx*s,pixelH/2-cy*s); c.scale(s,s);
    const yaw=isMini?0:pointer.x*(hover?.28:.06),tilt=-.16+(isMini?0:pointer.y*(hover?.2:.04));
    const breathe=frozen?1:1+Math.sin(time*.0018)*.018;
    const radius=Math.min(W*.345,H*.405)*breathe*(isMini?1:scale)*(1+energy*.105+Math.sin(impulse*Math.PI)*.025);
    const glow=c.createRadialGradient(cx,cy,radius*.08,cx,cy,radius*1.28);
    glow.addColorStop(0,`rgba(224,247,255,${.08+energy*.13})`);
    glow.addColorStop(.33,`rgba(56,189,248,${.065+energy*.08})`);
    glow.addColorStop(.66,'rgba(37,99,235,.03)');glow.addColorStop(1,'rgba(2,12,34,0)');
    c.fillStyle=glow;c.beginPath();c.arc(cx,cy,radius*1.3,0,Math.PI*2);c.fill();
    c.save();c.globalCompositeOperation='lighter';
    const scanY=cy-radius+((time*.035)%(radius*2));const scanWidth=Math.sqrt(Math.max(0,radius**2-(scanY-cy)**2));
    const scan=c.createLinearGradient(cx-scanWidth,scanY,cx+scanWidth,scanY);scan.addColorStop(0,'rgba(56,189,248,0)');scan.addColorStop(.5,'rgba(224,247,255,.14)');scan.addColorStop(1,'rgba(56,189,248,0)');
    c.strokeStyle=scan;c.lineWidth=.7;c.beginPath();c.moveTo(cx-scanWidth,scanY);c.lineTo(cx+scanWidth,scanY);c.stroke();c.restore();
    c.save();c.globalCompositeOperation='lighter';
    [{rx:1.18,ry:.38,angle:-.44,speed:.018,alpha:.16},{rx:1.08,ry:.56,angle:.58,speed:-.011,alpha:.11},{rx:.98,ry:.72,angle:-1.02,speed:.008,alpha:.08}].forEach((ring,i)=>{
      c.save();c.translate(cx,cy);c.rotate(ring.angle+yaw*.2);c.setLineDash(i===1?[1.5,5.5]:[3,7]);c.lineDashOffset=time*ring.speed;c.strokeStyle=`rgba(103,232,249,${ring.alpha})`;c.lineWidth=i===0?.7:.5;c.beginPath();c.ellipse(0,0,radius*ring.rx,radius*ring.ry,0,0,Math.PI*2);c.stroke();c.restore();
    });
    const co=Math.cos(rotation+yaw),si=Math.sin(rotation+yaw),ct=Math.cos(tilt),st=Math.sin(tilt);
    const projected=sphere.particles.map(p=>{
      // Original 2.2% local drift. Requested gentle inward/outward pulse is
      // bounded to 1.4% and disabled in reduced-motion/pause modes.
      const beat=frozen?0:Math.sin(time*.0018);
      const contour=1-(Math.max(0,beat)*.014)*(1-p.y*p.y);
      const drift=(frozen?1:1+Math.sin(time*.0014+p.phase*12)*.022)*contour;
      const px=p.x*drift,py=p.y*drift,pz=p.z*drift,x1=px*co-pz*si,z1=px*si+pz*co,y2=py*ct-z1*st,z2=py*st+z1*ct,perspective=1/(1.14-z2*.22);
      return {x:cx+x1*radius*perspective,y:cy+y2*radius*perspective,z:z2,perspective,p};
    });
    const modeEnergy=1+energy*.35+(hover&&!isMini?.18:0);
    sphere.links.forEach(link=>{const a=projected[link.a],b=projected[link.b],depth=Math.max(.12,(a.z+b.z+2)/4);c.strokeStyle=`rgba(45,190,255,${Math.min(.86,(.15+depth*.2)*modeEnergy)})`;c.lineWidth=.62;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();});
    projected.forEach(({x,y,z,perspective,p})=>{const depth=Math.max(.25,(z+1.2)/2.2);c.fillStyle=`rgba(${z>.25?'238,252,255':'103,232,249'},${Math.min(.95,.38+depth*.56)})`;c.beginPath();c.arc(x,y,Math.max(.62,p.size*perspective*depth*1.08),0,Math.PI*2);c.fill();});
    c.save();c.globalCompositeOperation='lighter';
    for(let i=0;i<5;i++){const a=rotation*(i%2===0?1.4:-1.1)+i*2.17,x=cx+Math.cos(a)*radius*(.72+(i%3)*.08),y=cy+Math.sin(a)*radius*(.72+(i%3)*.08),p=.32+Math.abs(Math.sin(time*.0028+i*1.9))*.42,r=2.4+p*3.4,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,255,255,${p*.82})`);g.addColorStop(.2,`rgba(224,247,255,${p*.62})`);g.addColorStop(1,'rgba(56,189,248,0)');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
    for(let bolt=0;bolt<3;bolt++){const life=(time*.00042+bolt*.31)%1,ba=Math.sin(life*Math.PI)*(.28+(bolt%2)*.14);if(ba<.05)continue;const start=rotation*(bolt%2===0?1.6:-1.25)+bolt*2.11+life*.42;for(const [lw,alpha,rgb] of [[3.2,.2,'56,189,248'],[.82,.94,'248,254,255']]){c.strokeStyle=`rgba(${rgb},${alpha*ba})`;c.lineWidth=lw;c.beginPath();for(let j=0;j<=8;j++){const u=j/8,a=start+(.5+bolt*.12)*u,jitter=j===0||j===8?0:Math.sin(time*.026+bolt*17+j*9.4)*radius*.055,r=radius*(1.01+Math.sin(u*Math.PI)*.08)+jitter,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}}
    c.restore();
    const satelliteAlpha=.08+(hover&&!isMini?.08:0),spread=.28;
    satelliteData.forEach(a=>{const angle=a.angle+time*a.speed+yaw*.18,distance=radius*a.distance*spread,depth=(Math.sin(angle*1.3+a.phase*8)+1)/2,x=cx+Math.cos(angle)*distance,y=cy+Math.sin(angle)*distance*.58+a.elevation*radius*spread*.58,nr=Math.max(4,radius*a.size*(.72+depth*.38)),pulse=.55+Math.abs(Math.sin(time*.0032+a.phase*14))*.45;
      c.strokeStyle=`rgba(45,190,255,${satelliteAlpha*(.09+depth*.16)})`;c.lineWidth=.55;c.beginPath();c.moveTo(cx+Math.cos(angle)*radius*.84,cy+Math.sin(angle)*radius*.32);c.quadraticCurveTo((cx+x)/2,cy+a.elevation*radius*.24,x,y);c.stroke();
      const g=c.createRadialGradient(x,y,0,x,y,nr*2.7);g.addColorStop(0,`rgba(239,254,255,${satelliteAlpha*.9})`);g.addColorStop(.18,`rgba(34,211,238,${satelliteAlpha*.5})`);g.addColorStop(1,'rgba(14,116,144,0)');c.fillStyle=g;c.beginPath();c.arc(x,y,nr*2.7,0,Math.PI*2);c.fill();
      c.save();c.translate(x,y);c.rotate(angle*.7);c.strokeStyle=`rgba(165,243,252,${satelliteAlpha*(.34+pulse*.3)})`;c.lineWidth=.55;c.beginPath();c.ellipse(0,0,nr*1.85,nr*.62,0,0,Math.PI*2);c.stroke();c.rotate(1.04);c.beginPath();c.ellipse(0,0,nr*1.55,nr*.52,0,0,Math.PI*2);c.stroke();c.fillStyle=`rgba(240,253,255,${satelliteAlpha})`;c.beginPath();c.arc(0,0,Math.max(1,nr*.16*pulse),0,Math.PI*2);c.fill();c.restore();
      const transfer=(time*.00022+a.phase)%1;c.fillStyle=`rgba(224,247,255,${satelliteAlpha*Math.sin(transfer*Math.PI)*.85})`;c.beginPath();c.arc(cx+(x-cx)*transfer,cy+(y-cy)*transfer,.8+depth*.8,0,Math.PI*2);c.fill();
    });
    for(let i=0;i<22;i++){const dx=((i*47+time*.004*((i%3)+1))%(W+20))-10,dy=((i*31+Math.sin(time*.0008+i)*12)%H+H)%H;c.fillStyle=`rgba(186,230,253,${.05+(i%4)*.018})`;c.fillRect(dx,dy,.65,.65);}
    c.restore();
  }
  draw = function(now) {
    if (!media.matches) return baseDraw(now);
    raf=0; if(!ctx||document.hidden||(!visible&&!miniVisible))return;
    const frozen=paused||reduced.matches,delta=Math.min(32,Math.max(0,now-frameTime));frameTime=now;
    if(!frozen){clock+=delta;phase+=delta*.00018;}
    const sig=window.TwinExperience?.signal||{level:0,until:0};
    const energy=frozen?0:Math.max(0,Math.min(1,sig.level));
    const impulse=frozen?0:Math.max(0,Math.min(1,(sig.until-now)/650));
    scale+=((hover?1.055:1)-scale)*(frozen?1:.1);
    if(visible)paint(ctx,width,height,dpr,clock,phase,frozen,energy,impulse,false);
    if(miniVisible&&miniCtx){const r=mini.getBoundingClientRect(),dp=Math.min(devicePixelRatio||1,2);const w=Math.round(r.width*dp),h=Math.round(r.height*dp);if(mini.width!==w||mini.height!==h){mini.width=w;mini.height=h;}paint(miniCtx,r.width,r.height,dp,clock,phase,frozen,energy,impulse,true);}
    if(!frozen)raf=requestAnimationFrame(draw);
  };
  restart = function(){if(!media.matches)return baseRestart();cancelAnimationFrame(raf);frameTime=performance.now();if(!document.hidden&&(visible||miniVisible))raf=requestAnimationFrame(draw);};
  const miniObserver=new IntersectionObserver(entries=>{miniVisible=media.matches&&entries[0].isIntersecting;restart();});miniObserver.observe(mini);
  const stageObserver=new ResizeObserver(()=>{layout();restart();});stageObserver.observe($('stage'));
  media.addEventListener('change',()=>{render();resize();});
  reduced.addEventListener('change',()=>{syncMotion();restart();});
  window.addEventListener('pageshow',restart);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);});
  window.TwinMobile={sourceBlob:'83bb5068a6d4ab517a9ce810c16d4bdccaa515a7',logicalDock:{width:118,height:86},layout};
  document.fonts?.ready.then(() => { layout(); resize(); });
  refresh();resize();
})();
