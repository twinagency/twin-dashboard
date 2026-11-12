// KNOWN RED (W6 app-media-1, high, false-success): upload queues identify async work by array index over a snapshot.
// app/media/MediaManager.tsx:428-448 (VideoUploadQueue.uploadAll loops the captured `queue[i]`, `update(i, …)`), :462
// (✕ on pending rows mid-batch), :519 (Upload stays clickable mid-batch); the photo queue has the same shape (:293-311).
// CONDITION: the operator removes a pending row (✕) or clicks Upload again while a batch runs.
// EFFECT: the removed file still uploads; a second click starts an overlapping loop that re-sends pending rows.
// FIXED LOOKS LIKE: stable item ids, update by id, one in-flight batch: a removed row is never sent and each file is sent once.
// Locking rows during a batch (✕ and Upload absent or disabled) also counts as fixed.
// Not wired into npm scripts; init.sh does not list it. Offline: jsdom, server actions faked at the module boundary.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { baseProps, button, chooseFiles, click, deferred, load, mount, settle, tabBody, teardown, w } from "./W6-app-media-1-harness";

before(load);
after(teardown);

type Pending = ReturnType<typeof deferred<{ ok: true }>>;
let inFlight: Pending[] = [];
const sent = () => w.named("uploadVideo").map(c => ((c.args[1] as FormData).get("file") as File).name);
const queueBody = () => tabBody(/Add videos/);
const nameCell = (name: string) => [...queueBody().querySelectorAll("div")].find(d => d.children.length === 0 && d.textContent === name);
const row = (name: string) => nameCell(name)?.parentElement?.parentElement;

async function queued(names: string[]) {
  w.reset();
  inFlight = [];
  w.impl.uploadVideo = () => { const d = deferred<{ ok: true }>(); inFlight.push(d); return d.promise; };
  await mount(baseProps("clone-a"));
  await chooseFiles(queueBody().querySelector<HTMLInputElement>('input[type="file"]'), names.map(n => new File([n], n, { type: "video/mp4" })));
  assert.ok(button(new RegExp(`^Upload ${names.length} videos$`)), "all files queued pending");
}
async function drain() {
  for (let round = 0; round < 20; round++) {
    const batch = inFlight.splice(0);
    if (!batch.length) return;
    for (const d of batch) d.resolve({ ok: true });
    await settle();
  }
}

test("control: with no edits mid-batch, every queued video uploads once, in order, and each row ends Done", async () => {
  await queued(["a.mp4", "b.mp4", "c.mp4"]);
  await click(button(/^Upload 3 videos$/));
  await drain();
  assert.deepEqual(sent(), ["a.mp4", "b.mp4", "c.mp4"]);
  for (const name of ["a.mp4", "b.mp4", "c.mp4"]) assert.match(row(name)?.textContent ?? "", /Done/, `${name} row shows Done`);
  assert.equal(w.refreshes, 1, "router.refresh after the batch");
});

test("queue index: a pending video removed with ✕ while the batch runs is not uploaded", async () => {
  await queued(["a.mp4", "b.mp4", "c.mp4"]);
  await click(button(/^Upload 3 videos$/));
  assert.deepEqual(sent(), ["a.mp4"], "a is in flight");
  const remove = [...row("b.mp4")?.querySelectorAll("button") ?? []].find(b => b.textContent?.trim() === "✕");
  // Locking rows while a batch runs is a valid fix: with no usable ✕ the operator cannot remove b mid-batch.
  if (!remove || remove.disabled) { await drain(); return; }
  await click(remove);
  assert.equal(nameCell("b.mp4"), undefined, "b is gone from the queue on screen");
  await drain();
  assert.deepEqual(sent(), ["a.mp4", "c.mp4"], `removed b.mp4 was still uploaded: sent ${sent().join(", ")}`);
});

test("queue index: clicking Upload twice does not send the same video twice", async () => {
  await queued(["a.mp4", "b.mp4", "c.mp4"]);
  await click(button(/^Upload 3 videos$/));
  const again = button(/^Upload \d+ videos?$/);
  // A disabled or absent Upload button during the batch is a valid fix (one in-flight batch).
  if (again && !again.disabled) await click(again);
  await drain();
  const dupes = sent().filter((name, i, all) => all.indexOf(name) !== i);
  assert.deepEqual(dupes, [], `overlapping batches re-sent ${dupes.join(", ")} (sent ${sent().join(", ")})`);
});
