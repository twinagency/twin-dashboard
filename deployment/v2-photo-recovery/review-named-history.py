"""Review a bounded past-send wording against immutable saved dispatch evidence.
No model calls, network requests, file writes, or production changes. The original
49/50 result is retained; this is a separately identified diagnostic correction.
"""
import copy, datetime, hashlib, json, pathlib, re
ROOT=pathlib.Path('/home/ubuntu/twin-v2-validation/reference-5228ff383628-1791862213594985741')
INCIDENT=pathlib.Path('/home/ubuntu/twin-v2/data/_operator_backups/photo-incident-20261013-morning')
CANDIDATE='5228ff383628382ee1366d319c39e3f27b052c02'
FIXTURE_HASH='43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253'
sha=lambda file:hashlib.sha256(file.read_bytes()).hexdigest()
summary_file=ROOT/'structured-candidate.summary.json'
private_file=ROOT/'structured-candidate.private.json'
summary=json.loads(summary_file.read_text())
private=json.loads(private_file.read_text())
catalogue_file=INCIDENT/'catalogue-at-diagnosis.json'
catalogue=json.loads(catalogue_file.read_text())
assert summary['candidate']==CANDIDATE and summary['fixtureHash']==FIXTURE_HASH
assert sha(INCIDENT/'riley-morning-requests.json')==FIXTURE_HASH
assert sha(catalogue_file)==summary['catalogueHash']
assert summary['requests']==50 and summary['realTelegramSends']==0 and summary['fatal'] is None
assert len(summary['results'])==50 and len({r['case'] for r in summary['results']})==50
records=[r for r in private['exchanges'] if 'pipelineRecord' in r]
assert len(records)==50 and len({r['case'] for r in records})==50
by_case={r['case']:r for r in records}
photos={'photo:'+p['id']:p for p in catalogue['raw']['photos']}
past=re.compile(r'^\s*i\s+sent\s+(?:u|you)\s+the\s+([a-z]+(?:\s+[a-z]+){0,2})\s+(?:one|photo|pic|picture)(?=\s*(?:[,!.?]|(?:babe|baby|hun|love)\b|$))',re.I)
new_claim=re.compile(r"\b(?:i(?:'ve| have)?\s+(?:just\s+)?(?:sent|resent|attached|shared|uploaded)|(?:here(?:'s| is)|sent)\s+(?:the|your|that)\s+(?:photo|pic|picture|selfie|image|card)|i(?:'m| am|m|'ll| will)\s+(?:just\s+)?(?:send(?:ing)?|resend(?:ing)?|attach(?:ing)?|upload(?:ing)?))\b",re.I)
media_methods={'sendPaidMedia','sendPhoto','sendVideo'}

def prove(rec, all_records):
    row=rec['pipelineRecord']; chat=rec['beforeChat']; p=chat.get('photo') or {}
    if row.get('selection')!='none' or row.get('selectedMedia') or row.get('media'):return False
    if any(c['method'] in media_methods for c in rec['fakeCalls']):return False
    item=photos.get(p.get('key'))
    if not item or p.get('cloneId')!=catalogue['cloneId'] or p.get('storagePath')!=item['storage_path']:return False
    if p.get('epoch')!=chat.get('epoch') or p.get('epoch')!=row.get('epoch'):return False
    if p.get('mode')!='simulated' or row.get('mode')!='simulated':return False
    if p.get('bcid','')!=row.get('bcid','') or p.get('bcid','')!=chat.get('bcid',''):return False
    if p.get('status')!='acknowledged' or type(p.get('messageId')) is not int or p['messageId']<=0:return False
    if p.get('key') not in chat.get('sent',[]):return False
    witnesses=[w for w in all_records[:all_records.index(rec)] if w['pipelineRecord'].get('turnId')==p.get('turnId')]
    if len(witnesses)!=1:return False
    w=witnesses[0]; prior=w['pipelineRecord']; media=prior.get('media') or {}; receipt=(prior.get('delivery') or {}).get('media') or {}
    if prior.get('chatId')!=row.get('chatId') or prior.get('bcid','')!=row.get('bcid','') or prior.get('epoch')!=row.get('epoch'):return False
    if media.get('key')!=p['key'] or media.get('kind')!='photo' or receipt.get('status')!='acknowledged' or receipt.get('messageId')!=p['messageId']:return False
    if w['afterChat'].get('photo')!=p:return False
    calls=[c for c in w['fakeCalls'] if c['method'] in media_methods]
    if len(calls)!=1 or calls[0].get('chat_id')!=row.get('chatId') or calls[0].get('business_connection_id','')!=p.get('bcid',''):return False
    if not any(d.get('key')==p['key'] and d.get('storagePath')==p['storagePath'] for d in w['downloads']):return False
    label=media.get('label','')
    if not label or not item.get('visual_description','').startswith(label):return False
    last=next((m['content'] for m in reversed(chat['history']) if m['role']=='assistant'),'')
    if not any(note in last.split('\n') for note in [f'[locked photo waiting for him to unlock: {label}]',f'[sent him free photo: {label}]']):return False
    decoded=json.loads(row['raw'])
    if decoded.get('selection')!='none':return False
    texts=[decoded.get('reply',''),' '.join(row.get('generated',[])),' '.join(row.get('final',[]))]
    if not all(texts) or texts[1]!=texts[2]:return False
    for text in texts:
        text=text.replace('’',"'").replace('‘',"'"); m=past.match(text)
        if not m:return False
        descriptor=m.group(1).lower()
        if set(descriptor.split()) & {'new','another','different','next','other','same','last'}:return False
        if not re.search(r'\b'+re.escape(descriptor)+r'\b',label,re.I):return False
        if new_claim.search(text[m.end():]):return False
    return True

reviewed=[]; unresolved=[]; corrected=[]
permitted={'noExplicitFalseSendClaimWithoutSelection','truthfulAlternativeOrUnavailabilityAcknowledged'}
for result in summary['results']:
    bad={k for k,v in result['checks'].items() if v is not True}
    if not bad:
        assert result['passed'] is True
        continue
    rec=by_case[result['case']]
    justified=bad<=permitted and prove(rec,records) and result['checks'].get('exhaustedExactPoolConfirmed') is True
    if justified:
        p=rec['beforeChat']['photo']
        reviewed.append({'case':result['case'],'originalFailedChecks':sorted(bad),'resolution':'proved named reference to preceding acknowledged simulated photo; no new attachment claimed','priorKey':p['key'],'priorTurnId':p['turnId'],'priorMessageId':p['messageId'],'actualPriorDispatchWitness':True,'sameRouteEpochCreatorPath':True,'matchingHistoryNote':True,'descriptorInCatalogueLabel':True,'rawPreparedDeliveredAgree':True})
        corrected.append(result['case'])
    else:unresolved.append({'case':result['case'],'failedChecks':sorted(bad)})

# Counterexamples mutate one piece of the real saved proof, never product data.
tests=0
for name in corrected:
    idx=next(i for i,r in enumerate(records) if r['case']==name)
    def check(change):
        global tests
        rs=copy.deepcopy(records); change(rs[idx],rs)
        assert not prove(rs[idx],rs); tests+=1
    assert prove(records[idx],records); tests+=1
    for field,value in [('status','unknown'),('status','prepared'),('messageId',None),('messageId',-1),('bcid','wrong-route'),('epoch',999),('mode','real'),('cloneId','wrong-creator'),('key','photo:wrong'),('storagePath','wrong-file'),('turnId','unknown-turn')]:
        check(lambda r,rs,f=field,v=value:r['beforeChat']['photo'].__setitem__(f,v))
    check(lambda r,rs:r['beforeChat'].__setitem__('sent',[]))
    check(lambda r,rs:r['beforeChat'].__setitem__('history',[]))
    check(lambda r,rs:r['pipelineRecord'].__setitem__('bcid','wrong-route'))
    check(lambda r,rs:r['pipelineRecord'].__setitem__('chatId',-1))
    def change_reply(r,rs,text):
        r['pipelineRecord']['raw']=json.dumps({'selection':'none','reply':text})
        r['pipelineRecord']['generated']=[text];r['pipelineRecord']['final']=[text]
    for text in ['i sent u the invented one babe','i sent u the new one babe','i sent u the towel one babe. i just sent another photo',"i sent u the towel one babe. i'm sending another photo",'i sent u the towel one babe. here is your photo','i will send u the towel one babe']:
        check(lambda r,rs,t=text:change_reply(r,rs,t))
    def break_witness(r,rs):
        for w in rs:
            if w['pipelineRecord'].get('turnId')==r['beforeChat']['photo']['turnId']:
                w['pipelineRecord']['delivery']['media']['status']='unknown'
    check(break_witness)
assert reviewed and not unresolved
out={'status':'SAVED-RECORD REVIEW PASSED; ORIGINAL RUN UNCHANGED','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate':CANDIDATE,'originalSummarySha256':sha(summary_file),'privateRecordSha256':sha(private_file),'originalPassedCases':sum(r['passed'] for r in summary['results']),'totalCases':50,'reviewedDiagnosticFalsePositives':reviewed,'correctedDeclaredBehaviorCases':sum(r.get('behaviorAcceptance') is True and (r['passed'] or r['case'] in corrected) for r in summary['results']),'observationalCases':sum(r.get('behaviorAcceptance') is False for r in summary['results']),'counterexampleChecks':tests,'unresolvedOriginalGates':unresolved,'originalSummaryRewritten':False,'fullOriginalConversationAcceptance':False,'modelCalls':0,'messagesSent':0,'productionWrites':0,'limits':['Telegram and ownership remain simulated','Original turns 3 and 5 have no independently established unique-file intent','This bounded wording check is not unrestricted semantic verification']}
print(json.dumps(out),flush=True)
