# Log in with Browserbase (ConnectionEditor)
- What: button in the OnlyFans connection editor; backend opens a Browserbase browser, the operator signs in to OnlyFans inside the embedded live view, the captured session fills capture/X-Hash/owner like a pasted curl. Save credentials stays manual.
- Why: no extension install, no password typed into Twin; reuses the paste-curl save + verify path.
- Verify by hand: Creators → Manage connection → Log in with Browserbase → live view shows OnlyFans sign-in → Cancel → status "cancelled".
- Breaks if: backend lacks BROWSERBASE_API_KEY/PROJECT_ID (503 notice), live view host leaves *.browserbase.com (URL check rejects it), backend job id format changes.
- Paid sessions: cancel on Cancel, unmount, pagehide, 5 failed polls and the 11 min client deadline; an unconfirmed cancel keeps the job live and polling. Backend also times out at 10 min.
- Concept: polling a server job from a client component with a run-generation ref to drop stale responses.
- UI (2026-11-12): three method cards (Browser login = Recommended + default, Extension, Session file); only the chosen panel shows; live view opens in a body-portalled overlay (Minimise / Open in new tab / Cancel) because the editor column is too narrow and its stacking context hid a fixed overlay under the top bar.
