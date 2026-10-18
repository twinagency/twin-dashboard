// Synthetic harness only. Uses the same signing functions as real login.
import { signSession } from "../lib/session";
import { signViewAs } from "../lib/view-as-session";
async function main() {
  console.log(JSON.stringify({ operator: await signSession(), viewAs: await signViewAs("agency", "synthetic-agency", "synthetic-operator") }));
}
main().catch(() => { process.exitCode = 1; });
