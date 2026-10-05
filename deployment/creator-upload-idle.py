#!/usr/bin/env python3
"""Read-only release gate: do not restart a dashboard with staged uploads."""
import argparse
import json
import shlex
import subprocess
import time

def aws(*args):
    result = subprocess.run(['aws', '--region', 'ap-southeast-2', *args, '--output', 'json'], capture_output=True, text=True, timeout=45)
    if result.returncode:
        if 'InvocationDoesNotExist' in result.stderr:
            return {'Status': 'Pending'}
        raise RuntimeError('Upload-idle release gate AWS request failed; private details suppressed')
    return json.loads(result.stdout)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--brand', choices=('moxy', 'flirt'), required=True)
    brand = parser.parse_args().brand
    if aws('sts', 'get-caller-identity')['Account'] != '323149985112':
        raise RuntimeError('Unexpected AWS account')
    target = 'flirt-dashboard' if brand == 'flirt' else 'next-app'
    project = 'lkmfwpqegjluirfusnaw' if brand == 'flirt' else 'aouaenqayfltoqrmpitg'
    check = "const fs=require('node:fs'); if(process.env.SUPABASE_URL!==" + json.dumps('https://' + project + '.supabase.co') + ")process.exit(2); const n=fs.readdirSync('/tmp').filter(x=>x.startsWith('creator-upload-')).length; console.log(JSON.stringify({staged_uploads:n})); process.exit(n?3:0);"
    command = 'sudo docker exec ' + shlex.quote(target) + ' node -e ' + shlex.quote(check)
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        job = aws('ssm', 'send-command', '--cli-input-json', json.dumps({'InstanceIds':['i-09a9dd3bd749643a5'], 'DocumentName':'AWS-RunShellScript', 'Comment':'Read-only creator upload release gate: ' + brand, 'Parameters':{'commands':[command], 'executionTimeout':['30']}}))['Command']['CommandId']
        poll_deadline = time.monotonic() + 60
        while time.monotonic() < poll_deadline:
            state = aws('ssm', 'get-command-invocation', '--command-id', job, '--instance-id', 'i-09a9dd3bd749643a5')
            if state['Status'] not in ('Pending','InProgress','Delayed'):
                break
            time.sleep(2)
        if state['Status'] == 'Success':
            print(json.dumps({'brand':brand, 'upload_idle_gate':'passed', 'staged_uploads':0}), flush=True)
            return
        if state.get('ResponseCode') != 3:
            raise RuntimeError('Cannot confirm upload-idle state; refusing dashboard restart')
        print(json.dumps({'brand':brand, 'upload_idle_gate':'waiting_for_active_uploads'}), flush=True)
        time.sleep(10)
    raise RuntimeError('Active uploads did not drain within 10 minutes; no dashboard restart performed. Retry release when idle.')

if __name__ == '__main__':
    main()
