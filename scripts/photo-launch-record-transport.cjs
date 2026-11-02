// Staging observation only. Forward real requests unchanged; never record keys or image bytes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const target = process.env.PHOTO_LAUNCH_TRANSPORT_LOG;
if (target) {
  const original = globalThis.fetch;
  globalThis.fetch = async function(input, init) {
    if (String(input) !== 'https://openrouter.ai/api/v1/chat/completions') return original(input, init);
    const started = Date.now();
    const body = JSON.parse(init.body);
    const parts = body.messages?.[0]?.content;
    const text = Array.isArray(parts) ? parts.find(x=>x.type==='text')?.text : null;
    const record = {model:body.model,provider:body.provider,reasoning:body.reasoning,max_tokens:body.max_tokens,
      temperature:body.temperature,response_format:body.response_format,text_first:Array.isArray(parts)&&parts[0]?.type==='text',
      has_image:body.messages?.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url'))===true,
      prompt_sha256:text?crypto.createHash('sha256').update(text).digest('hex'):null,
      stage:text?.includes('ONLY these keys:')?'second_look':text?.includes('Your previous answer was rejected:')?'correction':'first_or_caption'};
    try {
      const response=await original(input,init);
      const result=await response.clone().json().catch(()=>({}));
      Object.assign(record,{http_status:response.status,latency_ms:Date.now()-started,effective_model:result.model,effective_provider:result.provider,
        finish_reason:result.choices?.[0]?.finish_reason,content:result.choices?.[0]?.message?.content,cost_usd:result.usage?.cost});
      fs.appendFileSync(target,JSON.stringify(record)+'\n');return response;
    } catch(error) {
      fs.appendFileSync(target,JSON.stringify({...record,latency_ms:Date.now()-started,error_type:error.name})+'\n');throw error;
    }
  };
}
