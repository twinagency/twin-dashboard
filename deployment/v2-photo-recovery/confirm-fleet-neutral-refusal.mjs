// Neutral companion case: inventory validation must not remove a reported fan refusal.
// The original model banter remains separately recorded; this does not endorse that banter.
import {groundReply} from './src/grounding.ts';
const text='you said no photos earlier.';
const actual=groundReply(text,null,{availability:{photos:10,videos:0,freePhotos:1,freeVideos:0}});
const result={case:'G2-neutral-reported-refusal',expected:text,actual,passes:actual.text===text};
console.log(JSON.stringify(result,null,2));
if(!result.passes)process.exitCode=1;
