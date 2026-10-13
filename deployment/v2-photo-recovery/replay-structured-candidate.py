"""Run the integrated candidate over frozen evidence in an isolated pinned image.
Local source recovery only until the operator submits this wrapper through the established workflow.
No deployment, fan sends, production data restore or fixture overwrite.
"""
import argparse, datetime, hashlib, json, os, pathlib, re, subprocess, tempfile
p = argparse.ArgumentParser()
p.add_argument('--source-dir', required=True)
p.add_argument('--manifest', required=True, help='JSON object mapping the ten reviewed candidate source paths to SHA256')
p.add_argument('--candidate-sha', required=True)
p.add_argument('--script', required=True)
p.add_argument('--output-dir', required=True)
args = p.parse_args()
assert re.fullmatch(r'[0-9a-f]{40}', args.candidate_sha), 'Exact candidate commit required'
revision = '45931b6f56db9f97cc8406154e35a0d216f5de65'
image = 'sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e'
# Dashboard history-only rebuild independently verified against 111 source files.
dashboard_image = 'sha256:051ec69b650fc06025d19c8d92e790dfc11185bdf435906840a13d6df823bb61'
fixture = pathlib.Path('/home/ubuntu/twin-v2/data/_operator_backups/photo-incident-20261013-morning').resolve()
fixture_file = fixture / 'riley-morning-requests.json'
fixture_hash = '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253'
assert hashlib.sha256(fixture_file.read_bytes()).hexdigest() == fixture_hash
source_dir = pathlib.Path(args.source_dir).resolve()
output_dir = pathlib.Path(args.output_dir).resolve()
assert output_dir != fixture and fixture not in output_dir.parents, 'Use a separate artifact directory, not the frozen fixture directory'
assert not output_dir.exists(), 'Use a fresh result directory; previous acceptance must remain immutable'
manifest = json.loads(pathlib.Path(args.manifest).read_text())
required = {'src/llm.ts', 'src/turn.ts', 'src/media.ts', 'src/grounding.ts', 'src/girls/template.ts',
            'src/memory.ts', 'src/deliver.ts', 'src/payments.ts', 'src/runner.ts', 'src/bundle-offers.ts'}
assert set(manifest) == required, 'Mount only the ten reviewed product files'
hashes = {}
for relative, digest in manifest.items():
    candidate = (source_dir / relative).resolve()
    assert source_dir in candidate.parents and candidate.is_file()
    assert re.fullmatch(r'[0-9a-f]{64}', digest)
    hashes[relative] = hashlib.sha256(candidate.read_bytes()).hexdigest()
    assert hashes[relative] == digest, 'Candidate source differs from reviewed manifest: ' + relative
runtime = None
for name in ['twin-v2-bot-1', 'twin-v2-dash-1']:
    current = json.loads(subprocess.check_output(['docker', 'inspect', name], text=True))[0]
    assert current['State']['Running'] and current['Image'] == (dashboard_image if name == 'twin-v2-dash-1' else image)
    assert 'GIT_SHA=' + revision in current['Config']['Env'], 'Stop if the live rollback revision changed'
    if name == 'twin-v2-bot-1':
        runtime = current
# Reuse only the existing model key inside a short-lived server-side 0600 file.
# No Telegram/database credentials are passed. No secret is printed or copied off-host.
secret = [entry for entry in runtime['Config']['Env'] if entry.startswith('OPENROUTER_API_KEY=')]
assert len(secret) == 1 and len(secret[0].split('=', 1)[1]) > 10, 'Existing authorised model credential unavailable'
output_dir.mkdir(parents=True, mode=0o700)
os.chmod(output_dir, 0o700)
script = pathlib.Path(args.script).read_text()
fd, envfile = tempfile.mkstemp(prefix='v2-structured-candidate-', suffix='.env')
cidfile = pathlib.Path(envfile + '.cid')
try:
    with os.fdopen(fd, 'w') as file:
        file.write(secret[0] + '\n')
    os.chmod(envfile, 0o600)
    command = ['docker', 'run', '--rm', '-i', '--read-only', '--cidfile', str(cidfile),
        '--tmpfs', '/tmp:rw,size=64m', '--memory', '512m', '--cpus', '1',
        '--env-file', envfile, '-e', 'GIT_SHA=' + revision,
        '-e', 'CANDIDATE_SHA=' + args.candidate_sha, '-e', 'CANDIDATE_HASHES=' + json.dumps(hashes),
        '-e', 'STAR_PRICE=real', '-e', 'PROBE_OUTPUT_DIR=/out',
        '--mount', 'type=bind,source=' + str(fixture) + ',target=/app/data/_operator_backups/photo-incident-20261013-morning,readonly',
        '--mount', 'type=bind,source=' + str(output_dir) + ',target=/out']
    for relative in sorted(required):
        command.extend(['--mount', 'type=bind,source=' + str(source_dir / relative) + ',target=/app/' + relative + ',readonly'])
    command.extend([image, 'node', '--import', 'tsx', '--input-type=module'])
    result = subprocess.run(command, input=script, text=True, capture_output=True, timeout=1200)
    # Private stderr may contain request context. Keep it on the server, never print it.
    (output_dir / 'runner.stderr.private.txt').write_text(result.stderr)
    (output_dir / 'runner.stderr.private.txt').chmod(0o600)
    (output_dir / 'runner.stdout.private.txt').write_text(result.stdout)
    (output_dir / 'runner.stdout.private.txt').chmod(0o600)
    summary_file = output_dir / 'structured-candidate.summary.json'
    if summary_file.is_file():
        summary = json.loads(summary_file.read_text())
        compact = {key: value for key, value in summary.items() if key != 'results'}
        compact['results'] = [{key: row.get(key) for key in ['case', 'passed', 'behaviorAcceptance', 'selected', 'selection', 'provider', 'parserClassification', 'referenceAvailable', 'unresolvedOriginalRecovery']}
            | {'failedChecks': [key for key, passed in row.get('checks', {}).items() if not passed]} for row in summary.get('results', [])]
        (output_dir / 'structured-candidate.compact.json').write_text(json.dumps(compact))
        (output_dir / 'structured-candidate.compact.json').chmod(0o600)
        print('PHOTO_REFERENCE_REPLAY_JSON ' + json.dumps(compact), flush=True)
    else:
        print(json.dumps({'status': 'FAILED BEFORE SUMMARY', 'privateArtifactDirectory': str(output_dir), 'messagesSent': 0}), flush=True)
    assert hashlib.sha256(fixture_file.read_bytes()).hexdigest() == fixture_hash, 'Frozen evidence changed'
    if result.returncode:
        raise RuntimeError('Integrated candidate validation failed; private diagnostics retained; no deployment occurred')
finally:
    # A subprocess timeout can kill only the Docker client. Stop this exact probe
    # container too, so it cannot keep calling the model after the wrapper exits.
    try:
        if cidfile.is_file():
            container_id = cidfile.read_text().strip()
            if re.fullmatch(r'[0-9a-f]{64}', container_id):
                subprocess.run(['docker', 'rm', '-f', container_id], capture_output=True, timeout=30)
    finally:
        cidfile.unlink(missing_ok=True)
        pathlib.Path(envfile).unlink(missing_ok=True)

