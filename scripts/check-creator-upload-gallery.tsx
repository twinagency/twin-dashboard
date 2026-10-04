import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import UploadedContent from "../app/agency/creators/[id]/UploadedContent";
import { type CreatorUpload, uploadMedia } from "../lib/creator-upload-display";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

async function main() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://dashboard.flirtaiagency.com" });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, React, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const container = dom.window.document.getElementById("root") as HTMLElement;
  const root = createRoot(container);
  const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const upload = (number: number, fields: Partial<CreatorUpload> = {}): CreatorUpload => ({
    id: `bbbbbbbb-bbbb-bbbb-bbbb-${String(number).padStart(12, "0")}`,
    kind: "sfw_image", original_name: `photo-${number}.jpg`, mime_type: "image/jpeg",
    size_bytes: 1048576, storage_transfer_status: "verified", ...fields,
  });
  const files: CreatorUpload[] = [
    ...Array.from({ length: 20 }, (_, index) => upload(index + 1)),
    upload(21, { kind: "sfw_video", original_name: "clip.mp4", mime_type: "video/mp4" }),
    upload(22, { kind: "nsfw_video", original_name: "second-clip.mov", mime_type: null }),
    upload(23, { kind: "voice", original_name: "voice.wav", mime_type: "audio/wav" }),
    upload(24, { kind: "document", original_name: "notes.pdf", mime_type: "application/pdf" }),
    upload(25, { original_name: "processing.jpg", storage_transfer_status: "pending" }),
  ];
  const button = (label: string) => {
    const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label);
    assert.ok(found, `Missing button: ${label}`);
    return found;
  };
  const click = async (label: string) => { await act(async () => button(label).click()); };
  const cards = () => [...container.querySelectorAll<HTMLLIElement>("li")];
  try {
    assert.equal(uploadMedia(upload(99, { mime_type: null })), "photo", "Legacy uploads still have previews by kind");
    assert.equal(uploadMedia(files[21]), "video", "Legacy videos remain filterable without MIME metadata");
    await act(async () => root.render(<UploadedContent accountId={accountId} files={files} />));
    for (const label of ["All (25)", "Photos (21)", "Videos (2)", "Audio (1)", "Other files (1)"]) button(label);
    assert.equal(button("All (25)").getAttribute("aria-pressed"), "true");
    assert.equal(cards().length, 18, "Large libraries initially render only one page");
    assert.match(container.textContent!, /Showing 18 of 25 files/);
    assert.match(container.textContent!, /before approving or linking/);
    assert.equal(container.querySelectorAll("video,audio").length, 0, "Later pages do not mount their players");
    for (const img of container.querySelectorAll("img")) assert.equal(img.getAttribute("loading"), "lazy");

    await click("Show more (7 remaining)");
    assert.equal(cards().length, 25);
    assert.match(container.textContent!, /Showing 25 of 25 files/);
    assert.ok(![...container.querySelectorAll("button")].some(item => item.textContent?.startsWith("Show more")));
    assert.equal(container.querySelectorAll("img").length, 20);
    assert.equal(container.querySelectorAll("video").length, 2);
    assert.equal(container.querySelectorAll("audio").length, 1);
    for (const player of container.querySelectorAll<HTMLMediaElement>("video,audio")) {
      assert.equal(player.getAttribute("preload"), "none");
      assert.equal(player.controls, true);
      assert.equal(player.autoplay, false);
    }
    for (const video of container.querySelectorAll("video")) assert.equal(video.playsInline, true);
    const pending = cards().find(card => card.textContent?.includes("processing.jpg"))!;
    assert.match(pending.textContent!, /still processing/);
    assert.equal(pending.querySelectorAll("a,img,video,audio").length, 0, "Unverified files expose no playable or signed links");
    const documentCard = cards().find(card => card.textContent?.includes("notes.pdf"))!;
    assert.equal(documentCard.querySelectorAll("img,video,audio").length, 0);
    assert.equal(documentCard.querySelectorAll("a").length, 2, "Verified other files can be opened or downloaded");
    for (const link of container.querySelectorAll<HTMLAnchorElement>("a")) {
      const url = new URL(link.href);
      assert.equal(url.origin, "https://dashboard.flirtaiagency.com");
      assert.equal(url.pathname, "/agency/creators/file");
      assert.equal(url.searchParams.get("account"), accountId);
      assert.ok(files.some(file => file.id === url.searchParams.get("file") && file.storage_transfer_status === "verified"));
      assert.equal(url.searchParams.get("download"), link.textContent === "Download" ? "1" : null);
      assert.equal(url.searchParams.size, link.textContent === "Download" ? 3 : 2, "Storage paths and signing tokens never reach client links");
      if (link.textContent === "Open") { assert.equal(link.target, "_blank"); assert.match(link.rel, /noreferrer/); }
    }

    const firstPhoto = container.querySelector("img")!;
    await act(async () => firstPhoto.dispatchEvent(new dom.window.Event("error")));
    const failedPreview = cards()[0];
    assert.match(failedPreview.textContent!, /Preview unavailable/);
    assert.equal(failedPreview.querySelectorAll("a").length, 2, "A browser preview failure retains open/download recovery");

    await click("Videos (2)");
    assert.equal(cards().length, 2); assert.equal(container.querySelectorAll("video").length, 2);
    assert.equal(button("Videos (2)").getAttribute("aria-pressed"), "true");
    await click("Audio (1)");
    assert.equal(cards().length, 1); assert.equal(container.querySelectorAll("audio").length, 1);
    await click("Photos (21)");
    assert.equal(cards().length, 18, "Changing filters resets pagination");
    await click("Show more (3 remaining)");
    assert.equal(cards().length, 21);
    await click("All (25)");
    assert.equal(cards().length, 18);

    await act(async () => root.render(<UploadedContent accountId={accountId} files={[files[20]]} />));
    await click("Photos (0)");
    assert.equal(cards().length, 0); assert.match(container.textContent!, /No photos uploaded yet/);
    await act(async () => root.render(<UploadedContent accountId={accountId} files={[]} />));
    assert.match(container.textContent!, /No files uploaded yet/);
    assert.equal(container.querySelectorAll("button,a,img,video,audio").length, 0);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
  console.log("CREATOR UPLOAD GALLERY PASSED: media counts, filters, pagination, lazy previews, safe downloads, pending uploads and preview recovery");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
