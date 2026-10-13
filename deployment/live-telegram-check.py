"""Run the read-only inbox probe inside the existing dashboard container."""
import base64, json, os, pathlib, shlex, subprocess, time
instance = 'i-09a9dd3bd749643a5'
code = base64.b64encode(pathlib.Path('deployment/live-telegram-check.cjs').read_bytes()).decode()
js = "eval(Buffer.from(" + json.dumps(code) + ",'base64').toString())"
mode = '1' if os.environ.get('VERIFY_UNIFIED') == '1' else '0'
expected = os.environ.get('EXPECTED_DASHBOARD_SHA', '')
command = 'sudo docker exec -e VERIFY_UNIFIED=' + mode + ' -e EXPECTED_DASHBOARD_SHA=' + shlex.quote(expected) + ' next-app node -e ' + shlex.quote(js)
params = pathlib.Path('/tmp/live-telegram-check.json')
params.write_text(json.dumps({'commands': [command], 'executionTimeout': ['240']}))
cid = subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://' + str(params),'--comment','Read-only unified Telegram history verification','--query','Command.CommandId','--output','text'],text=True).strip()
for attempt in range(90):
    try:
        result = json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',instance,'--output','json'],text=True,stderr=subprocess.DEVNULL))
    except subprocess.CalledProcessError:
        time.sleep(3)
        continue
    if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:
        print(result.get('StandardOutputContent',''))
        if result['Status'] != 'Success':
            print(result.get('StandardErrorContent','')[-1800:])
            raise RuntimeError('Telegram verification ' + result['Status'])
        break
    time.sleep(3)
else:
    raise RuntimeError('Telegram verification timeout')
