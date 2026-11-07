"use client";

import { useState, type ReactNode } from "react";
import { StudioTabs, StudioTabPanel } from "./StudioTabs";
import VaultManager from "./VaultManager";
import EngineCatalogue from "./EngineCatalogue";

/** Presentation only. The existing vault owns every read, upload and offer command. */
export default function ContentLibrary({ accountId, readOnly, configured, offers }: {
  accountId: string; readOnly: boolean; configured: boolean; offers: ReactNode;
}) {
  const [active, setActive] = useState("vault");
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  return <>
    <div ref={setActions} className="of-content-actions" />
    <div className="of-content-library">
      <StudioTabs label="Content library" active={active} onChange={setActive} tabs={[{ value: "vault", label: "Vault" }, { value: "offers", label: "Offers" }, { value: "engine", label: "Engine catalogue" }]}>
        <StudioTabPanel value="vault">{configured ? <VaultManager key={accountId} accountId={accountId} readOnly={readOnly} actionsTarget={actions} onShowVault={() => setActive("vault")} /> : <p className="of-notice">The media library is not configured for this environment.</p>}</StudioTabPanel>
        <StudioTabPanel value="offers">{offers}</StudioTabPanel>
        <StudioTabPanel value="engine">{configured ? <EngineCatalogue key={accountId} accountId={accountId} readOnly={readOnly} /> : <p className="of-notice">The media library is not configured for this environment.</p>}</StudioTabPanel>
      </StudioTabs>
    </div>
  </>;
}
