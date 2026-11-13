// Rule (G30 R1, F1 follow-up): agency_team_command 'update' no longer reactivates a removed member (20261113100200), so
// a Removed row on /agency/team must not offer an update form or a "Restore access" button that can only fail with a
// conflict. It renders read-only with an ⓘ hint that Twin admin restores access. Active rows keep their form.
// Real AgencyTeamForm in jsdom (7a-harness). Offline.
import assert from "node:assert/strict";
import test from "node:test";
import { all, click, q, render, text } from "./7a-harness";
import AgencyTeamForm, { type TeamMember } from "../../components/AgencyTeamForm";

const member = (active: boolean): TeamMember => ({ user_id: "10000000-0000-4000-8000-000000000012", email: "staff@example.test", active,
  can_manage: false, can_chat: true, creator_scope: "all", creator_ids: [], creator_access_revision: "50000000-0000-4000-8000-000000000001" });
const props = { creators: [{ id: "30000000-0000-4000-8000-000000000001", name: "Fixture creator" }], managementAvailable: true, fixedManagement: false };

test("control: an active member keeps the update form with Save and Remove", async () => {
  await render(<AgencyTeamForm member={member(true)} {...props} />);
  assert.ok(q('form[action="/agency/team/manage"]'), "update form rendered");
  assert.deepEqual(all("button[name=operation]").map(b => b.getAttribute("value")), ["update", "remove"]);
});

test("a removed member renders read-only: no form, no update or restore control, ⓘ says Twin admin restores", async () => {
  await render(<AgencyTeamForm member={member(false)} {...props} />);
  assert.equal(Boolean(q("form")), false, "no form posts to /agency/team/manage for a removed member");
  assert.equal(all("button[name=operation]").length, 0, "no update/remove/restore button");
  assert.doesNotMatch(text(), /Restore access/);
  await click(q('[aria-label="More information"]'));
  assert.match(text(), /Twin admin can restore access/);
});
