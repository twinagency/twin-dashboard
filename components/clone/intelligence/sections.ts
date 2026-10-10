// Presentation only: the existing control keys, defaults and save scope stay in model.ts.
export const ADVANCED_SECTIONS = [
 {key:"creator",label:"Creator",title:"Creator & personality",description:"Shape her voice, protect her identity and set the boundaries for adaptation.",ids:[1,2,3,4,5,6,7,8],featured:[1,2,3,5,4]},
 {key:"conversations",label:"Conversations",title:"Conversations & platforms",description:"Coordinate linked channels and keep every conversation in context.",ids:[9,10,11,14,15,16,17,18,19,20],featured:[9,10,20,14,11]},
 {key:"offers",label:"Offers",title:"Offers, pricing & access",description:"Bring offer timing, ownership and commercial policies into one place.",ids:[21,22,23,24,25,26,27,28,29],featured:[21,22,23,24,25]},
 {key:"memory",label:"Memory",title:"Memory & context",description:"Choose what context matters, how memories are retained and how conflicts are resolved.",ids:[30,31,32,33,36,37,44],featured:[30,31,32,33,36,37,44]},
 {key:"quality",label:"Quality",title:"Quality & reliability",description:"Set review criteria, processing limits and recovery policies.",ids:[34,38,39,40,41,42,43],featured:[34,38,39,40,42,41,43]},
 {key:"rules",label:"Rules",title:"Operator control & rules",description:"Define approval authority, handovers and explicit conditional policies.",ids:[12,13,35,45,46,47],featured:[46,12,13,35,45,47]},
 {key:"content",label:"Content",title:"Content & delivery",description:"Connect assets, tune recommendations and prepare platform-specific delivery.",ids:[48,49,50,51,52,53,54,55,56],featured:[48,49,52,56,50,53]},
] as const;
export type AdvancedSection = typeof ADVANCED_SECTIONS[number]["key"];
export type AdvancedView = AdvancedSection | "overview" | "live";
export function resolveAdvancedView(value?:string|null):AdvancedView {
 return value==="live"||ADVANCED_SECTIONS.some(section=>section.key===value)?value as AdvancedView:"overview";
}
export const sectionForControl=(id:number)=>ADVANCED_SECTIONS.find(section=>(section.ids as readonly number[]).includes(id))!;
