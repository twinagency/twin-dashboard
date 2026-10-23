"use client";
import { createContext, useContext, useId, useState, type ReactNode } from "react";

const TabsContext = createContext({ active: "", id: "" });
export function StudioTabs({ tabs, label, children, active: controlled, onChange }: { tabs: { value: string; label: string }[]; label: string; children: ReactNode; active?: string; onChange?: (value: string) => void }) {
  const [localActive, setLocalActive] = useState(tabs[0].value);
  const active = controlled ?? localActive;
  const setActive = onChange ?? setLocalActive;
  const id = useId();
  return <TabsContext.Provider value={{ active, id }}><div className="of-tab-workspace" data-active={active}>
    <div className="of-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.value} type="button" role="tab" id={`${id}-tab-${tab.value}`}
        aria-controls={`${id}-panel-${tab.value}`} aria-selected={active === tab.value} tabIndex={active === tab.value ? 0 : -1}
        onClick={() => setActive(tab.value)} onKeyDown={event => {
          const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!offset && !["Home", "End"].includes(event.key)) return;
          event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
          setActive(tabs[next].value);
          const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]'); buttons?.[next]?.focus();
        }}>{tab.label}</button>)}
    </div>{children}
  </div></TabsContext.Provider>;
}
/** Keep every panel mounted: changing presentation must not discard form edits. */
export function StudioTabPanel({ value, children }: { value: string; children: ReactNode }) {
  const { active, id } = useContext(TabsContext);
  return <div role={active ? "tabpanel" : undefined} id={active ? `${id}-panel-${value}` : undefined} aria-labelledby={active ? `${id}-tab-${value}` : undefined} hidden={!!active && active !== value} className="of-tab-panel">{children}</div>;
}
/** Used for a single editor form spanning two tabs, with one shared save lifecycle. */
export function StudioTabSection({ value, children }: { value: string | string[]; children: ReactNode }) {
  const { active } = useContext(TabsContext);
  const visible = !active || (Array.isArray(value) ? value.includes(active) : active === value);
  return <div hidden={!visible} className="of-tab-section">{children}</div>;
}
