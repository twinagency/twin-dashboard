// Deterministic reproduction of two additional failures observed in the fleet simulation.
// Run from the product root: node --import tsx --input-type=module < this-file
import {groundReply,evidenceText} from './src/grounding.ts';
const cases=[
 {id:'G1-supported-colour',reply:'this ones cute, blue crop top and white undies with my hands on my hips',evidence:'A blonde woman is wearing a blue ribbed crop top with a deep neckline and white underwear.',context:{}},
 {id:'G2-attributed-refusal',reply:'thought u said no pics lol, u so greedy.',evidence:null,context:{availability:{photos:10,videos:0,freePhotos:1,freeVideos:0}}}
];
const results=cases.map(c=>{const actual=groundReply(c.reply,c.evidence===null?null:evidenceText(c.evidence),c.context);return {...c,expected:c.reply,actual,passes:actual.text===c.reply};});
console.log(JSON.stringify({kind:'deterministic, no model calls',results},null,2));
if(results.some(r=>!r.passes))process.exitCode=1;
