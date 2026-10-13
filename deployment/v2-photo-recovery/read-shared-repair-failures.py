"""Read only the saved shared-repair failures; no model, sends or production writes."""
import json,pathlib
root=pathlib.Path("/home/ubuntu/twin-v2-validation/shared-261425d4992f-1791870512342035655")/'output'
summary=json.loads((root/'model.summary.json').read_text())
exchanges=json.loads((root/'model.exchanges.private.json').read_text())
out=[]
for row in summary['results']:
 if row['passed']:continue
 e=next(x for x in exchanges if x['case']==row['case'])
 content=e['response'].get('choices',[{}])[0].get('message',{}).get('content','')
 out.append({'case':row['case'],'failed':row['failedChecks'],'checks':row['checks'],'raw':content[:1000],'allowed':e['request']['response_format']['json_schema']['schema']['properties']['selection']['enum'],'menu':e['request']['messages'][0]['content'].split('YOUR CONTENT READY TO SEND')[-1][:1300]})
print('SHARED_REPAIR_SAVED_FAILURES_JSON '+json.dumps({'candidate':summary['candidate'],'results':out,'modelCalls':0,'messagesSent':0,'productionWrites':0}),flush=True)
