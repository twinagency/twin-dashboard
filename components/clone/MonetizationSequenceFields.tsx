"use client";

import { useState } from "react";
import type { Clone } from "@/lib/types";
import { Field, Section, Toggle } from "./fields";

// ── Monetization sequence (migration 056) ─────────────────────────────────────
// Every field here is a code-enforced threshold or switch, never a price or a
// percentage the AI decides itself — the model only ever picks WHETHER/WHEN to
// act inside the window these values define; the bot always computes the real
// number (see bot/flows/discount.ts, star-pricing.ts). Column names, types and
// defaults are taken verbatim from bot/db/migrations/056_monetization_sequence.sql
// (plus reengage_photo_enabled, migration 062, and offer_redirect_cap,
// migration 064) and cross-checked against the live `clones` schema, not guessed.
//
// Grouped to match the real sequence a fan moves through, in order:
//   1. Tease + locked bundle, then a free re-warm if he goes silent on it (GAP 1)
//   2. Proactive PPV, gated on genuine interest, plus the anti-resell cooldown (GAP 3 / GAP 2)
//   3. When she's allowed to reach for a capped discount (GAP 4)
//   4. Pay-to-continue warmup + the unlock bonus photo (GAP 5)
//   5. Pre-lock tease before the wall lands (GAP 6)
//   6. Post-lock proactive re-engagement, then silence for good (GAP 7)
//
// Mounted from MonetizationSections in ConfigSections.tsx (single-line
// insertion) rather than folded into that file's own cards, since another
// agent is actively editing ConfigSections.tsx/PersonaFactsFields.tsx/
// lib/intake.ts concurrently — this file is untouched ground.
export default function MonetizationSequenceFields({ clone }: { clone?: Partial<Clone> }) {
  const [unlockBonus, setUnlockBonus] = useState(clone?.paywall_unlock_bonus_photo ?? true);
  const [postlockReengage, setPostlockReengage] = useState(clone?.postlock_reengage_enabled ?? true);
  const [reengagePhoto, setReengagePhoto] = useState(clone?.reengage_photo_enabled ?? true);

  return (
    <>
      {/* ── GAP 1: tease + locked bundle, re-warm on silence ─────────── */}
      <Section
        icon="🎀"
        accent="pink"
        title="Tease, locked bundle & re-warm"
        hint="The initial locked send, and the one free nudge if he goes quiet on it instead of replying."
      >
        <Field
          label="Offer counts as open for (minutes)"
          name="offer_pending_minutes"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.offer_pending_minutes ?? 15}
          hint="How long a locked bundle or PPV send still counts as an unpaid, open offer. While open, a photo or video request gets redirected back to it instead of anything free going out. Once this elapses with no payment, the same open offer also becomes one of the two lawful discount triggers below."
        />
        <Field
          label="Redirect cap before backing off"
          name="offer_redirect_cap"
          type="number"
          min={1}
          step={1}
          defaultValue={clone?.offer_redirect_cap ?? 3}
          hint="How many times in a row she'll redirect a photo/video/bundle/tip/VIP request back to the still-open offer above before backing off. After this many redirects (or if he plainly says he already paid), she stops repeating herself: media requests get a normal chat reply with no free item, and a fresh bundle/tip/VIP ask is allowed through instead of nagging again. Without a cap she repeats the same redirect on every message for the whole window above, which reads as broken."
        />
        <Toggle
          label="Send the free re-warm photo"
          name="reengage_photo_enabled"
          checked={reengagePhoto}
          onChange={setReengagePhoto}
          accent="soft"
          hint="Off means she never sends the free re-warm photo below, she just waits silently for him to unlock the offer himself or say something. Requires photos to be enabled for this clone either way."
        />
        {reengagePhoto && (
          <Field
            label="Free re-warm after silence (seconds)"
            name="bundle_reengage_seconds"
            type="number"
            min={0}
            step={1}
            defaultValue={clone?.bundle_reengage_seconds ?? 60}
            hint="If he goes fully quiet, no reply at all, on a just-sent locked tease or bundle for this long, she sends one small free photo to keep things warm, then leaves it alone. Fires once per offer. A fan who DID reply is handled live instead of by this timer, so the two paths never double up."
          />
        )}
      </Section>

      {/* ── GAP 3 (+ GAP 2): PPV on genuine interest ──────────────────── */}
      <Section
        icon="💌"
        accent="purple"
        title="Proactive PPV on genuine interest"
        hint="A paid push she sends mid-conversation, gated on real engagement signals, never a blind timer."
      >
        <Field
          label="Minimum engaged messages"
          name="ppv_min_engaged_messages"
          type="number"
          min={1}
          step={1}
          defaultValue={clone?.ppv_min_engaged_messages ?? 4}
          hint="A proactive PPV push only fires once he's sent at least this many messages in the current stretch of chatting (counting the message he just sent)."
        />
        <Field
          label="Fast-reply window (seconds)"
          name="ppv_cadence_seconds"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.ppv_cadence_seconds ?? 60}
          hint="He counts as actively engaged right now when he's replying within this many seconds. This must hold together with the minimum messages above, unless he plainly asks for more or what else she's got, that alone is always enough by itself."
        />
        <Field
          label="Cooldown between pushes (minutes)"
          name="ppv_cooldown_minutes"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.ppv_cooldown_minutes ?? 45}
          hint="Minimum time between one proactive PPV push and the next, so pushes never stack on top of each other."
        />
        <Field
          label="Resell cooldown after a reveal (minutes)"
          name="resell_cooldown_minutes"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.resell_cooldown_minutes ?? 30}
          hint="After a fan actually pays and unlocks paid media, how long she waits before pushing another paid item at him. Also blocks a proactive PPV push during this window even if he looks engaged."
        />
      </Section>

      {/* ── GAP 4: discount trigger gating ────────────────────────────── */}
      <Section
        icon="🏷"
        accent="amber"
        title="Discount trigger gating"
        hint="When she becomes ALLOWED to reach for a capped discount. Never upfront, never a number she decides herself, the level (light/medium/max) is hers, the cap is set under Discounts in Advanced."
      >
        <Field
          label="Conversation slowdown trigger (minutes)"
          name="discount_slowdown_minutes"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.discount_slowdown_minutes ?? 15}
          hint="If he takes this long to reply, that counts as a lawful trigger to offer a capped discount. The other lawful trigger is the open-offer window above (Tease, locked bundle & re-warm card) elapsing with no payment. Discounts stay off entirely unless enabled under Discounts in Advanced."
        />
      </Section>

      {/* ── GAP 5: pay-to-continue warmup + unlock bonus ──────────────── */}
      <Section
        icon="🔓"
        accent="green"
        title="Paywall warmup & unlock bonus"
        hint="The message wall never lands on a brand-new fan too early, and topping up after actually hitting it gets a small welcome-back gift."
      >
        <Field
          label="Messages before the wall can trigger"
          name="paywall_warmup_messages"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.paywall_warmup_messages ?? 5}
          hint="The pay-to-continue wall can never fire before a fan has sent at least this many messages, even if starting credits are set very low. Guarantees every new fan gets a real taste of the conversation first."
        />
        <Toggle
          label="Bonus photo on unlock"
          name="paywall_unlock_bonus_photo"
          checked={unlockBonus}
          onChange={setUnlockBonus}
          accent="soft"
          hint="When a fan who actually hit the wall tops up, she sends one free bonus photo as a welcome-back gift. A routine top-up that never hit the wall gets no bonus photo."
        />
      </Section>

      {/* ── GAP 6: pre-lock tease ──────────────────────────────────────── */}
      <Section
        icon="👀"
        accent="cyan"
        title="Pre-lock tease"
        hint="A short heads-up shortly before the wall lands, so it never feels abrupt."
      >
        <Field
          label="Tease when this many messages remain"
          name="prelock_tease_before"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.prelock_tease_before ?? 3}
          hint="Once her remaining message credits drop to this many (and are still above 0), she drops one short in-character line building anticipation, without ever saying limits, credits or running out. Derived from the live credit balance, fires once per credits cycle, and re-arms itself automatically on every top-up."
        />
      </Section>

      {/* ── GAP 7: post-lock two-step re-engagement, then silence ─────── */}
      <Section
        icon="🌙"
        accent="blue"
        title="Post-lock re-engagement"
        hint="After the wall lands and he goes quiet, two proactive check-ins on a timer, then silence for good until he tops up or messages again."
      >
        <Toggle
          label="Reach out after the wall lands"
          name="postlock_reengage_enabled"
          checked={postlockReengage}
          onChange={setPostlockReengage}
          accent="soft"
          hint="Off means she never reaches out proactively after the wall, she only ever waits for him. The reactive side, replying while he's still messaging into the wall, is unaffected either way."
        />
        {postlockReengage && (
          <>
            <Field
              label="First check-in after (minutes)"
              name="postlock_curiosity1_minutes"
              type="number"
              min={0}
              step={1}
              defaultValue={clone?.postlock_curiosity1_minutes ?? 20}
              hint="How long after the wall lands, if he hasn't come back, before her first short, playful check-in line."
            />
            <Field
              label="Graceful goodbye after (minutes)"
              name="postlock_curiosity2_minutes"
              type="number"
              min={0}
              step={1}
              defaultValue={clone?.postlock_curiosity2_minutes ?? 90}
              hint="How long after the wall lands, not after the first check-in, before her second and LAST message: a warm, no-pressure goodbye-for-now. She stays silent after this until he tops up or messages again. Keep this higher than the first check-in above, a lower value gets clamped up to match it on save."
            />
          </>
        )}
      </Section>
    </>
  );
}
