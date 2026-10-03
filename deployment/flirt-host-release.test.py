import importlib.util, io, unittest, base64, json
from contextlib import redirect_stdout
from unittest.mock import patch
from urllib.error import HTTPError
from pathlib import Path
spec = importlib.util.spec_from_file_location("release", Path(__file__).with_name("flirt-host-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseBoundaryTests(unittest.TestCase):
    def test_only_dashboard_receives_live_access_without_copying_bot_configuration(self):
        for kind in ("dashboard", "bot"):
            payload = {**self.payload(), "kind": kind}
            def fake_command(args, data=None, timeout=180):
                if args[0] == "openssl": return json.dumps(payload).encode()
                if "url:process.env" in args[-1]: return json.dumps({"url": "https://" + release.TWIN_PROJECT + ".supabase.co", "key": "sb_secret_" + "t"*32}).encode()
                return json.dumps(dict.fromkeys(release.PROVIDERS, "synthetic-provider")).encode()
            previous = {"FLIRT_CLONE_PIPELINE_ENABLED": "true", "FLIRT_SUPABASE_PROJECT_REF": release.PROJECT, "DASHBOARD_PASSWORD": "keep-password", "DASHBOARD_SESSION_SECRET": "keep-admin-session", "CREATOR_SESSION_SECRET": "keep-creator-session"}
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
                self.assertEqual(env["FLIRT_CLONE_PIPELINE_ENABLED"], "true")
                self.assertNotIn("BOT_TOKEN", env)
            else:
                self.assertNotIn("FLIRT_LIVE_TWIN_ENABLED", env)
                self.assertNotIn("FLIRT_CLONE_PIPELINE_ENABLED", env)
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
