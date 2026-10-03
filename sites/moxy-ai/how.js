'use strict';
const howSections=[...document.querySelectorAll('.how-reveal')];
if('IntersectionObserver' in window&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  const howObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(entry.isIntersecting){entry.target.removeAttribute('data-awaiting');howObserver.unobserve(entry.target);}
    }
  },{threshold:.1});
  for(const section of howSections){section.setAttribute('data-awaiting','');howObserver.observe(section);}
}
