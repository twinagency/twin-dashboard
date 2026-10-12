"""Prepare an exact, offline-checked V2 image and rollback without restarting anything."""
import hashlib, json, pathlib, shutil, subprocess, tarfile

SHA = 'ef040a757627bb5813b4f19ac47af2c1f373506c'
ARCHIVE_SHA = '8af1b46b547965f9f22f101d7873ecc8c252453b2cd4d617d0e84c2b96c606d9'
ROOT = pathlib.Path('/home/ubuntu/twin-v2')
RELEASE = pathlib.Path('/home/ubuntu/twin-v2-photo-releases') / SHA
BACKUP = pathlib.Path('/home/ubuntu/twin-v2-backups/photo-launch-20261012')
EXPECTED = {'twin-v2-bot-1': 'sha256:c425cb955352a5062717f8f650367cdae4297402c9af39d300c6d52b9fdaee16',
            'twin-v2-dash-1': 'sha256:c1a6c521c76431ea638494f00acac2a057b77b44ab9ac9dfe8a1985976ad089c'}
def run(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()

assert shutil.disk_usage(ROOT).free > 3 * 1024**3, 'Need 3 GiB free for image/rollback preparation'
for name, expected in EXPECTED.items():
    assert run('docker', 'inspect', '-f', '{{.Image}}', name) == expected, f'Runtime changed: {name}'
    assert run('docker', 'inspect', '-f', '{{.State.Running}}', name) == 'true'
BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
if not (BACKUP / 'images.tar').exists():
    subprocess.run(['docker', 'save', '-o', str(BACKUP / 'images.tar'), *EXPECTED.values()], check=True)
    (BACKUP / 'images.tar').chmod(0o600)
if not (BACKUP / 'code.tgz').exists():
    subprocess.run(['tar', 'czf', str(BACKUP / 'code.tgz'), '--exclude=./data', '--exclude=./logs',
                    '--exclude=./node_modules', '--exclude=./.git', '-C', str(ROOT), '.'], check=True)
    (BACKUP / 'code.tgz').chmod(0o600)
(BACKUP / 'images.json').write_text(json.dumps(EXPECTED, indent=2))
archive = pathlib.Path('/tmp/twin-v2-photo-ef040a7.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == ARCHIVE_SHA
RELEASE.mkdir(parents=True, exist_ok=True)
with tarfile.open(archive) as tf:
    assert all(not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts and m.isfile() for m in tf.getmembers())
    tf.extractall(RELEASE, filter='data')
manifest = json.loads(pathlib.Path('/tmp/twin-v2-photo-manifest.json').read_text())
for item in manifest:
    b = (RELEASE / item['path']).read_bytes()
    assert hashlib.sha1(b'blob ' + str(len(b)).encode() + bytes([0]) + b).hexdigest() == item['sha'], item['path']
tag = 'twin-v2-photo:' + SHA
subprocess.run(['docker', 'build', '--label', 'org.opencontainers.image.revision=' + SHA, '-t', tag, str(RELEASE)], check=True)
tests = ['check-safety', 'check-media', 'check-photo-flow', 'check-media-facts', 'check-media-correction',
         'check-media-toy-menu', 'check-reply-grounding', 'check-turn', 'check-payments', 'check-bundles',
         'check-delivery', 'check-credits', 'check-tips', 'check-tips-wiring', 'check-archive', 'check-memory',
         'check-memory-wiring', 'check-dashboard-history']
for test in tests:
    result = subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--memory', '512m', '--cpus', '1',
                             tag, 'node', '--import', 'tsx', 'scripts/' + test + '.ts'], capture_output=True, text=True)
    (RELEASE / (test + '.log')).write_text(result.stdout + result.stderr)
    assert result.returncode == 0, f'{test} failed: ' + (result.stdout + result.stderr)[-1500:]
    print('PASS', test, flush=True)
subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--memory', '512m', tag, 'npm', 'run', 'typecheck'], check=True)
for name, expected in EXPECTED.items():
    assert run('docker', 'inspect', '-f', '{{.Image}}', name) == expected
print(json.dumps({'prepared': SHA, 'image': run('docker', 'image', 'inspect', '-f', '{{.Id}}', tag),
                  'backup': str(BACKUP), 'files_verified': len(manifest), 'runtime_unchanged': True}))
