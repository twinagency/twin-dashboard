// G19 (was KNOWN RED W4 api-business-connection-plus17 F3): app/api/voice/route.ts:57-59 caches `body:null` for ANY failure
// (Telegram 5xx/429, network, bad JSON) for an hour (:22,36-37), so one Telegram blip makes that voice note 404 for every
// operator until the entry expires, even after Telegram recovers. Fixed looks like: failures are never cached (or only a
// definitive "file not found", briefly), so the next request after recovery streams the audio.
// Not tested here (no clean assertion without reading module internals): the cache Map never evicts (F3 first half).
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { anyOf, as, botTokenRead, CLONE_A, isTelegram, json, telegramFile, TELEGRAM_HOST, withWire, type Responder } from "./G19-harness";
import { GET } from "../../app/api/voice/route";

const AUDIO = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]); // "OggS" + bytes
const telegramDown: Responder = c => (isTelegram(c, "getFile") ? json({ ok: false, error_code: 502, description: "Bad Gateway" }, 502) : undefined);

async function voice(file: string, telegramUp: boolean) {
  return withWire(anyOf(botTokenRead(CLONE_A), telegramUp ? telegramFile(AUDIO) : telegramDown), async stub => {
    const res = await as(null, () => GET(new NextRequest(`http://localhost/api/voice?clone=${CLONE_A}&file=${file}`)));
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, type: res.headers.get("content-type"), bytes, telegramCalls: stub.to(TELEGRAM_HOST).length };
  });
}

// The failure status is not pinned (today 404; a correct fix may answer 502/503 uncached): only "not a 2xx, no audio".
const notOk = (status: number) => status < 200 || status > 299;

test("control: Telegram getFile 502 answers a non-2xx with no audio (no false success); a healthy Telegram streams audio/ogg", async () => {
  const down = await voice("file-control", false);
  assert.ok(notOk(down.status), `Telegram 502 answered ${down.status}`);
  assert.equal(down.bytes.length, 0);
  assert.equal(down.telegramCalls, 1);
  const up = await voice("file-control-up", true);
  assert.equal(up.status, 200);
  assert.equal(up.type, "audio/ogg");
  assert.deepEqual([...up.bytes], [...AUDIO]);
});

test("F3: after Telegram recovers, the next request streams the voice note (the failure is not pinned for an hour)", async () => {
  const first = await voice("file-red", false);
  assert.ok(notOk(first.status), `precondition: the blip itself answers a non-2xx, got ${first.status}`);
  const second = await voice("file-red", true);
  assert.equal(second.status, 200, `recovered Telegram still answered ${second.status} (asked Telegram ${second.telegramCalls}x)`);
  assert.deepEqual([...second.bytes], [...AUDIO]);
});
