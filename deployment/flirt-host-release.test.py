import importlib.util, io, unittest, base64, json, copy
from types import SimpleNamespace
from contextlib import redirect_stdout
from unittest.mock import patch
from urllib.error import HTTPError
from pathlib import Path
spec = importlib.util.spec_from_file_location("release", Path(__file__).with_name("flirt-host-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseBoundaryTests(unittest.TestCase):
    def test_retention_keeps_live_rollback_recent_mounted_and_foreign_containers(self):
        from datetime import datetime, timezone
        now = 1800000000
        def archive(index, age, **extra):
            sha = format(index, '040x')
            return {"Id":str(index),"Name":"/flirt-dashboard-archive-"+sha[:12]+"-"+format(index,'016x'),"Created":datetime.fromtimestamp(now-age,timezone.utc).isoformat(),"Config":{"Labels":{"io.flirt.project":release.PROJECT,"io.flirt.commit":sha}},"State":{"Running":False,"Status":"exited"},"Mounts":[], **extra}
        items = [archive(i, i*86400) for i in range(1,8)]
        items += [archive(20, 20*86400, State={"Running":True,"Status":"running"}), archive(21,21*86400,Mounts=[{"Type":"volume"}]), archive(22,22*86400,Name="/flirt-dashboard-rollback"), archive(23,23*86400,Config={"Labels":{"io.flirt.project":"other"}})]
        self.assertEqual([x['Id'] for x in release.archive_candidates(items, now)], ['7','6','5','4'])
        recent = [archive(i, i*60) for i in range(1,8)]
        self.assertEqual(release.archive_candidates(recent,now), [])

    def test_retention_never_touches_docker_when_capacity_is_healthy(self):
        with patch.object(release.shutil, "disk_usage", return_value=SimpleNamespace(free=8*1024**3)), patch.object(release,"command") as commands:
            release.reclaim_dashboard_archives()
        commands.assert_not_called()

    def test_archive_name_retains_prior_archives_and_retries_collisions(self):
        sha = "a" * 40
        first = "flirt-dashboard-archive-" + sha[:12] + "-" + "1" * 16
        second = "flirt-dashboard-archive-" + sha[:12] + "-" + "2" * 16
        existing = {first: {"Id": "old-archive"}}
        with patch.object(release, "inspect", side_effect=lambda name: existing.get(name)) as inspected, patch.object(release.secrets, "token_hex", side_effect=["1" * 16, "2" * 16]), patch.object(release, "command") as commands:
            self.assertEqual(release.rollback_archive_name("flirt-dashboard", sha), second)
        self.assertEqual([call.args[0] for call in inspected.call_args_list], [first, second])
        self.assertEqual(existing, {first: {"Id": "old-archive"}})
        commands.assert_not_called()

    def test_archive_name_exhaustion_fails_before_container_mutation(self):
        with patch.object(release, "inspect", return_value={"Id": "occupied"}) as inspected, patch.object(release.secrets, "token_hex", return_value="1" * 16), patch.object(release, "command") as commands:
            with self.assertRaisesRegex(RuntimeError, "distinct FLIRT rollback archive"):
                release.rollback_archive_name("flirt-dashboard", "a" * 40)
        self.assertEqual(inspected.call_count, 10)
        commands.assert_not_called()

    def test_repeated_commit_archive_is_preserved_on_success_and_failed_startup(self):
        for startup_succeeds in (True, False):
            with self.subTest(startup_succeeds=startup_succeeds):
                new_sha, previous_sha, older_sha = "c" * 40, "b" * 40, "a" * 40
                def container(identifier, sha, running):
                    return {"Id": identifier, "Config": {"Labels": {"io.flirt.project": release.PROJECT, "io.flirt.commit": sha}}, "State": {"Running": running, "StartedAt": "unchanged-start"}, "RestartCount": 0}
                legacy = "flirt-dashboard-archive-" + older_sha[:12]
                unique = legacy + "-" + "d" * 16
                state = {"next-app": container("twin", "e" * 40, True), "flirt-dashboard": container("previous", previous_sha, True), "flirt-dashboard-rollback": container("older", older_sha, False), legacy: container("prior-same-commit-archive", older_sha, False)}
                before = copy.deepcopy(state)
                commands = []
                def fake_command(args, data=None, timeout=180):
                    commands.append(args)
                    if args[:3] == ["aws", "ecr", "get-login-password"]: return b"temporary-login-not-logged"
                    if args[:3] == ["docker", "run", "--rm"]:
                        return new_sha.encode() if "process.stdout.write" in args[-1] else b""
                    if args[:3] == ["docker", "run", "-d"]:
                        state["flirt-dashboard"] = container("new", new_sha, True)
                    elif args[:2] == ["docker", "rename"]:
                        self.assertNotIn(args[3], state)
                        state[args[3]] = state.pop(args[2])
                    elif args[:2] == ["docker", "stop"]:
                        state[args[-1]]["State"]["Running"] = False
                    elif args[:2] == ["docker", "start"]:
                        state[args[-1]]["State"]["Running"] = True
                    elif args[:2] == ["docker", "rm"]:
                        del state[args[-1]]
                    elif args[:2] == ["docker", "exec"]: return new_sha.encode()
                    return b""
                response = SimpleNamespace(status=200, read=lambda: b"FLIRT")
                from contextlib import nullcontext
                with patch.object(release, "secured_directory"), patch.object(release, "read_env", return_value={"FLIRT_SUPABASE_PROJECT_REF": release.PROJECT, "FLIRT_BACKEND_ENABLED": "true"}), patch.object(release.shutil, "disk_usage", return_value=SimpleNamespace(free=10 * 1024**3)), patch.object(release.Path, "read_text", return_value="MemAvailable: 2097152 kB"), patch.object(release, "inspect", side_effect=lambda name: copy.deepcopy(state.get(name))), patch.object(release, "command", side_effect=fake_command), patch.object(release.secrets, "token_hex", return_value="d" * 16), patch.object(release.time, "sleep"), patch.object(release, "urlopen", side_effect=(lambda *args, **kwargs: nullcontext(response)) if startup_succeeds else OSError("startup unavailable")), redirect_stdout(io.StringIO()):
                    if startup_succeeds:
                        release.deploy("dashboard", release.REGISTRY + "/twin-dashboard@sha256:" + "f" * 64, new_sha)
                    else:
                        with self.assertRaisesRegex(RuntimeError, "startup check failed"):
                            release.deploy("dashboard", release.REGISTRY + "/twin-dashboard@sha256:" + "f" * 64, new_sha)
                self.assertEqual(state[legacy], before[legacy])
                self.assertEqual(state["next-app"], before["next-app"])
                self.assertFalse(any(args[:2] == ["docker", "rm"] and args[-1] == legacy for args in commands))
                if startup_succeeds:
                    self.assertEqual(state[unique], before["flirt-dashboard-rollback"])
                    self.assertEqual(state["flirt-dashboard-rollback"]["Id"], "previous")
                    self.assertEqual(state["flirt-dashboard"]["Id"], "new")
                else:
                    self.assertEqual(state, before)

    def test_only_dashboard_receives_live_access_without_copying_bot_configuration(self):
        for kind in ("dashboard", "bot"):
            payload = {**self.payload(), "kind": kind}
            def fake_command(args, data=None, timeout=180):
                if args[0] == "openssl": return json.dumps(payload).encode()
                if "url:process.env" in args[-1]: return json.dumps({"url": "https://" + release.TWIN_PROJECT + ".supabase.co", "key": "sb_secret_" + "t"*32}).encode()
                return json.dumps(dict.fromkeys(release.PROVIDERS, "synthetic-provider")).encode()
            previous = {"FLIRT_SUPABASE_PROJECT_REF": release.PROJECT, "DASHBOARD_PASSWORD": "keep-password", "DASHBOARD_SESSION_SECRET": "keep-admin-session", "CREATOR_SESSION_SECRET": "keep-creator-session"}
            output = io.StringIO()
            with patch.object(release, "secured_directory"), patch.object(release, "check_private_file"), patch.object(release, "verify_database"), patch.object(release, "read_env", return_value=previous), patch.object(release, "command", side_effect=fake_command) as commands, patch.object(release, "private_write") as saved, redirect_stdout(output):
                release.configure(base64.b64encode(bytes(512)).decode())
            env = dict(line.split("=", 1) for line in saved.call_args.args[1].splitlines())
            self.assertEqual(env["SUPABASE_URL"], "https://" + release.PROJECT + ".supabase.co")
            self.assertEqual(env["SUPABASE_SERVICE_KEY"], payload["key"])
            self.assertNotIn(payload["key"], output.getvalue())
            self.assertNotIn("sb_secret_", output.getvalue())
            self.assertTrue(all(c.args[0][0] != "docker" or c.args[0][1:3] == ["exec", "next-app"] for c in commands.call_args_list))
            if kind == "dashboard":
                self.assertEqual(env["FLIRT_LIVE_TWIN_ENABLED"], "true")
                self.assertEqual(env["DASHBOARD_PASSWORD"], previous["DASHBOARD_PASSWORD"])
                self.assertNotIn("BOT_TOKEN", env)
            else:
                self.assertNotIn("FLIRT_LIVE_TWIN_ENABLED", env)
                self.assertNotIn("FLIRT_LIVE_TWIN_SERVICE_KEY", env)
                self.assertEqual(env["BOT_TOKEN"], "")
    def test_database_errors_never_disclose_response_or_key(self):
        for body, expected in [(b'{"code":"PGRST205","message":"secret-value"}', "PGRST205"), (b'{"code":"sb_secret_do_not_log","message":"secret-value"}', "unavailable")]:
            error = HTTPError("https://example.invalid", 404, "secret-value", {}, io.BytesIO(body))
            with patch.object(release, "urlopen", side_effect=error):
                with self.assertRaises(RuntimeError) as result: release.verify_database("secret-value")
                self.assertEqual(str(result.exception), "FLIRT database verification failed: HTTP 404, code " + expected)
    def payload(self):
        return {"project": release.PROJECT, "kind": "dashboard", "key": "sb_secret_" + "s"*32, "public_key": "sb_publishable_" + "p"*32}
    def test_only_flirt_payloads(self):
        self.assertEqual(release.validate_payload(self.payload())["project"], release.PROJECT)
        for target in ["aouaenqayfltoqrmpitg", "cnnsllgzskqkvdovyiiv", "abcdefghijklmnopqrst"]:
            with self.assertRaises(ValueError): release.validate_payload({**self.payload(), "project": target})
    def test_arbitrary_environment_injection_refused(self):
        with self.assertRaises(ValueError): release.validate_payload({**self.payload(), "DASHBOARD_NO_AUTH": "true"})
        with self.assertRaises(ValueError): release.validate_payload({**self.payload(), "kind": "next-app"})
        with self.assertRaises(ValueError): release.validate_payload({**self.payload(), "key": "sb_secret_" + "s"*32 + "\nDASHBOARD_NO_AUTH=true"})
    def test_twin_tags_and_wrong_repositories_refused(self):
        digest = "a"*64
        sha = "b"*40
        release.validate_release("dashboard", release.REGISTRY+"/twin-dashboard@sha256:"+digest, sha)
        release.validate_release("bot", release.REGISTRY+"/twin-bot@sha256:"+digest, sha)
        for image in [release.REGISTRY+"/twin-dashboard:latest", release.REGISTRY+"/twin-bot@sha256:"+digest, "example.com/dashboard@sha256:"+digest]:
            with self.assertRaises(ValueError): release.validate_release("dashboard", image, sha)
        with self.assertRaises(ValueError): release.validate_release("next-app", release.REGISTRY+"/twin-dashboard@sha256:"+digest, sha)
        with self.assertRaises(ValueError): release.validate_release("dashboard", release.REGISTRY+"/twin-dashboard@sha256:"+digest, "main;exit 0")

if __name__ == "__main__": unittest.main()
