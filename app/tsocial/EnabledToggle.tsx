"use client";

import { useState, useTransition } from "react";
import { Toggle } from "@/components/clone/fields";

export default function EnabledToggle({ id, enabled, label, action }: {
  id: string;
  enabled: boolean;
  label: string;
  action: (id: string, enabled: boolean) => Promise<void>;
}) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <Toggle
        label={label}
        name={`enabled-${id}`}
        checked={on}
        disabled={pending}
        onChange={(v) => {
          const prev = on;
          setOn(v);
          setFailed(false);
          start(async () => {
            try { await action(id, v); } catch { setOn(prev); setFailed(true); }
          });
        }}
      />
      {failed && <span className="text-xs text-crit">Not saved</span>}
    </span>
  );
}
