"""Read saved observation and failure cases; no model calls, requests or file writes."""
import json,pathlib
candidate='2d2ecc27d0b1d3c148c54e26e2261d95b338f475'
dirs=[p for p in pathlib.Path('/home/ubuntu/twin-v2-validation').glob('reference-'+candidate[:12]+'-*') if (p/'structured-candidate.summary.json').is_file()]
root=max(dirs,key=lambda p:p.stat().st_mtime)
summary=json.loads((root/'structured-candidate.summary.json').read_text())
private=json.loads((root/'structured-candidate.private.json').read_text())
assert summary['candidate']==candidate and len(summary['results'])==50
names={r['case'] for r in summary['results'] if not r['passed'] or r.get('behaviorAcceptance') is False}
out=[]
for name in sorted(names):
 result=next(r for r in summary['results'] if r['case']==name)
 records=[x for x in private['exchanges'] if x.get('case')==name and 'pipelineRecord' in x]
 if not records:
  out.append({'case':name,'error':[x.get('error','')[-1000:] for x in private['exchanges'] if x.get('case')==name and x.get('error')]});continue
 rec=records[-1];row=rec['pipelineRecord'];before=rec['beforeChat']
 selected=row.get('selectedMedia') or {}
 out.append({'case':name,'failedChecks':[k for k,v in result['checks'].items() if not v],
 'input':row.get('fanText'),'selection':row.get('selection'),'selectedKey':selected.get('key'),
 'prepared':row.get('generated'),'actualSent':row.get('final'),'alternativeLabel':row.get('photoAlternative'),
 'selectedDescription':[m['desc'][:750] for m in row.get('menu',[]) if m['key']==selected.get('key')],
 'priorReceipt':{k:before.get('photo',{}).get(k) for k in ['key','status','turnId','messageId']},
 'priorAssistant':[m['content'][:650] for m in before['history'] if m['role']=='assistant'][-2:],
 'raw':row.get('raw','')[:1000] if not result['passed'] else None})
print(json.dumps({'status':'READ ONLY OBSERVATION REVIEW','candidate':candidate,'directory':str(root),'cases':out,'modelCalls':0,'messagesSent':0,'productionWrites':0}))
