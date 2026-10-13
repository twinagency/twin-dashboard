"""Read two completed replay cases only; no model, database, transport or mutation."""
import json,pathlib
root=pathlib.Path('/home/ubuntu/twin-v2-validation/reference-f1d864db2a75-1791858698943495623')
summary=json.loads((root/'structured-candidate.summary.json').read_text())
private=json.loads((root/'structured-candidate.private.json').read_text())
assert summary['candidate']=='f1d864db2a75c820d59c8f53d41ceab716c8a3f5'
names={r['case'] for r in summary['results'] if not r['passed']}
assert len(names)==2
exchanges=private['exchanges']
out=[]
for name in sorted(names):
    rec=next(x for x in exchanges if x.get('case')==name and 'pipelineRecord' in x)
    row=rec['pipelineRecord'];before=rec['beforeChat'];result=next(r for r in summary['results'] if r['case']==name)
    out.append({'case':name,'failedChecks':[k for k,v in result['checks'].items() if not v],
      'selection':row.get('selection'),'raw':row.get('raw','')[:1800], 'prepared':row.get('generated'), 'actualSent':row.get('final'),
      'grounding':row.get('grounding'),'media':row.get('media'),
      'priorReceipt':{k:before.get('photo',{}).get(k) for k in ['key','status','turnId','messageId']},
      'priorLastAssistant':[m['content'] for m in before['history'] if m['role']=='assistant'][-1:],
      'menuAlternatives':[{'key':m.get('key'),'slot':m.get('slot'),'alt':m.get('alt'),'missing':m.get('missing')} for m in row.get('menu',[])],
      'actualDispatchedCaptions':[c.get('caption') for c in rec.get('fakeCalls',[]) if c.get('method') in ['sendPaidMedia','sendPhoto','sendVideo']]})
print(json.dumps({'status':'READ ONLY TWO-CASE REVIEW','candidate':summary['candidate'],'cases':out,'modelCalls':0,'messagesSent':0,'productionWrites':0}))
