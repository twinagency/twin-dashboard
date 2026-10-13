"""Run the reviewed reference-data probe in an isolated pinned image.

Read-only live data access only. Never executes in either production container,
passes model/Telegram credentials, or mounts production data writable.
--output-dir is the caller's artifact parent; its /data child must be fresh.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile


REVISION = '45931b6f56db9f97cc8406154e35a0d216f5de65'
IMAGE = 'sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e'
FIXTURE = pathlib.Path('/home/ubuntu/twin-v2/data/_operator_backups/photo-incident-20261013-morning')
GIRL_DATA = pathlib.Path('/home/ubuntu/twin-v2/data/riley-mae-lewis')
FIXTURE_HASH = '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253'
REQUIRED = {'src/llm.ts', 'src/turn.ts', 'src/media.ts', 'src/girls/template.ts',
            'src/memory.ts', 'src/deliver.ts', 'src/payments.ts', 'src/runner.ts', 'src/bundle-offers.ts'}
TAG = 'REFERENCE_DATA_READONLY_JSON '
SUMMARY_FIELDS = {
    'checkedAt', 'status', 'errors', 'sourceHashesVerified', 'frozenInputsPreserved',
    'noOtherCredentials', 'ephemeralOwnershipCache', 'copiedDataFiles', 'requestLimit',
    'requests', 'networkPolicyViolations', 'exactPhotoAvailable', 'mismatchedPathRejected',
    'strictOwnershipAvailable', 'secondStrictReadAvailable', 'strictReadBypassedCache',
    'countEvidence', 'exactCountHeadersCompatible', 'scopedManifest', 'modelCalls',
    'telegramCalls', 'remoteWrites', 'realDownloads', 'productionFilesWritten', 'candidate',
    'ownedKeyCount', 'sourceDataUnchangedDuringRead', 'suppressedOutputEvents',
}


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def private_write(file, text):
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(text)


def text_of(value):
    return value.decode('utf-8', errors='replace') if isinstance(value, bytes) else (value or '')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--candidate-sha', required=True)
    parser.add_argument('--script', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    require(re.fullmatch(r'[0-9a-f]{40}', args.candidate_sha), 'exact-candidate-commit-required')

    # First operational check: no source reads, credential files, output writes or
    # probe execution until BOTH running containers match the approved rollback.
    runtime = None
    for name in ['twin-v2-bot-1', 'twin-v2-dash-1']:
        inspected = subprocess.run(['docker', 'inspect', name], text=True, capture_output=True, timeout=30)
        require(inspected.returncode == 0, 'live-container-inspection-failed')
        rows = json.loads(inspected.stdout)
        require(isinstance(rows, list) and len(rows) == 1, 'live-container-inspection-invalid')
        current = rows[0]
        require(current['State']['Running'] and current['Image'] == IMAGE, 'live-rollback-image-mismatch')
        require('GIT_SHA=' + REVISION in current['Config']['Env'], 'live-rollback-revision-mismatch')
        if name == 'twin-v2-bot-1':
            runtime = current

    source_dir = pathlib.Path(args.source_dir).resolve()
    fixture = FIXTURE.resolve()
    girl_data = GIRL_DATA.resolve()
    output_dir = pathlib.Path(args.output_dir).resolve() / 'data'
    require(output_dir != fixture and fixture not in output_dir.parents, 'output-overlaps-frozen-inputs')
    require(output_dir != girl_data and girl_data not in output_dir.parents, 'output-overlaps-live-data')
    require(not output_dir.exists(), 'fresh-data-output-directory-required')
    require(fixture.is_dir() and girl_data.is_dir(), 'readonly-input-directory-unavailable')
    fixture_file = fixture / 'riley-morning-requests.json'
    require(hashlib.sha256(fixture_file.read_bytes()).hexdigest() == FIXTURE_HASH, 'frozen-incident-hash-mismatch')
    manifest = json.loads(pathlib.Path(args.manifest).read_text())
    require(isinstance(manifest, dict) and set(manifest) == REQUIRED, 'exact-nine-source-files-required')
    hashes = {}
    for relative in sorted(REQUIRED):
        digest = manifest[relative]
        require(isinstance(digest, str) and re.fullmatch(r'[0-9a-f]{64}', digest), 'invalid-source-digest')
        candidate = (source_dir / relative).resolve()
        require(source_dir in candidate.parents and candidate.is_file(), 'invalid-source-file')
        hashes[relative] = hashlib.sha256(candidate.read_bytes()).hexdigest()
        require(hashes[relative] == digest, 'reviewed-source-hash-mismatch')
    script = pathlib.Path(args.script).read_text()

    # Copy only these two existing values to a short-lived 0600 server-side file.
    # No other runtime environment or credential reaches the probe.
    secrets = []
    for key in ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']:
        entries = [entry for entry in runtime['Config']['Env'] if entry.startswith(key + '=')]
        require(len(entries) == 1, 'existing-supabase-credential-unavailable')
        value = entries[0].split('=', 1)[1]
        require(bool(value) and '\n' not in value and '\r' not in value, 'invalid-existing-supabase-credential')
        secrets.append(entries[0])

    output_dir.mkdir(parents=True, mode=0o700)
    os.chmod(output_dir, 0o700)
    with tempfile.TemporaryDirectory(prefix='v2-reference-data-') as private_dir:
        private = pathlib.Path(private_dir)
        envfile, empty_env, cidfile = private / 'runtime.env', private / 'empty.env', private / 'probe.cid'
        private_write(envfile, '\n'.join(secrets) + '\n')
        private_write(empty_env, '')
        try:
            command = ['docker', 'run', '--rm', '-i', '--read-only', '--cidfile', str(cidfile),
                '--tmpfs', '/tmp:rw,size=128m', '--memory', '512m', '--cpus', '1',
                '--env-file', str(envfile), '-e', 'GIT_SHA=' + REVISION,
                '-e', 'CANDIDATE_SHA=' + args.candidate_sha, '-e', 'CANDIDATE_HASHES=' + json.dumps(hashes),
                '--mount', 'type=bind,source=' + str(fixture) + ',target=/probe/frozen,readonly',
                '--mount', 'type=bind,source=' + str(girl_data) + ',target=/probe/girl-data,readonly',
                '--mount', 'type=bind,source=' + str(empty_env) + ',target=/app/.env,readonly']
            for relative in sorted(REQUIRED):
                command.extend(['--mount', 'type=bind,source=' + str(source_dir / relative) + ',target=/app/' + relative + ',readonly'])
            command.extend([IMAGE, 'node', '--import', 'tsx', '--input-type=module'])
            try:
                result = subprocess.run(command, input=script, text=True, capture_output=True, timeout=90)
            except subprocess.TimeoutExpired as error:
                private_write(output_dir / 'runner.stderr.private.txt', text_of(error.stderr))
                raise RuntimeError('readonly-probe-timeout') from None
            private_write(output_dir / 'runner.stderr.private.txt', result.stderr)
            records = [line[len(TAG):] for line in result.stdout.splitlines() if line.startswith(TAG)]
            require(len(records) == 1 and len(records[0]) <= 65536, 'single-tagged-summary-required')
            summary = json.loads(records[0])
            require(isinstance(summary, dict) and set(summary) <= SUMMARY_FIELDS, 'unexpected-summary-fields')
            require(summary.get('candidate') == args.candidate_sha, 'summary-candidate-mismatch')
            require(summary.get('status') in {'READ-ONLY DATA CHECK PASSED', 'READ-ONLY DATA CHECK FAILED'}, 'invalid-summary-status')
            serialized = json.dumps(summary, sort_keys=True) + '\n'
            require(all(entry.split('=', 1)[1] not in serialized for entry in secrets), 'credential-in-summary-refused')
            require(hashlib.sha256(fixture_file.read_bytes()).hexdigest() == FIXTURE_HASH, 'frozen-inputs-changed')
            # The reviewed probe's parsed, sanitized record is the only stdout and summary artifact.
            private_write(output_dir / 'summary.json', serialized)
            print(serialized, end='', flush=True)
            return 0 if result.returncode == 0 and summary['status'] == 'READ-ONLY DATA CHECK PASSED' else 1
        finally:
            # A timeout can kill only the Docker client. Remove this exact isolated
            # container as well; never address either production container here.
            if cidfile.is_file():
                container_id = cidfile.read_text().strip()
                if re.fullmatch(r'[0-9a-f]{64}', container_id):
                    subprocess.run(['docker', 'rm', '-f', container_id], capture_output=True, timeout=30)


if __name__ == '__main__':
    try:
        code = main()
    except Exception:
        # Never expose subprocess output, runtime environment or exception values.
        sys.stderr.write('Read-only compatibility probe did not complete; no deployment was attempted.\n')
        code = 1
    sys.exit(code)
