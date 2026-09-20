import importlib.util, unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location("release", Path(__file__).with_name("flirt-host-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseBoundaryTests(unittest.TestCase):
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
