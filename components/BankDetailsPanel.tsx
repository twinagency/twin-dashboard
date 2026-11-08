"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Check, Info, RefreshCw } from "lucide-react";
import { Field, FieldLabel, selectCls } from "@/components/clone/fields";
import styles from "./PayoutDashboard.module.css";

const COUNTRIES = ["Australia", "United States of America", "United Kingdom", "New Zealand", "Canada", "Ireland", "Singapore", "Philippines", "Other"];
type Bank = { country: string; swiftBic: string; branchNumber: string; accountNumber: string; accountName: string; updatedAt: string | null };

export default function BankDetailsPanel({ cloneId, audience }: { cloneId: string; audience: "admin" | "creator" }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [useBranch, setUseBranch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const query = audience === "admin" ? `?cloneId=${encodeURIComponent(cloneId)}` : "";

  useEffect(() => {
    let live = true;
    setLoaded(false); setBank(null); setEditing(false); setSaved(false); setError("");
    fetch(`/api/payouts/bank${query}`, { cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Bank details could not be loaded."); return j; })
      .then(j => { if (live) { setBank(j.bank); setUseBranch(!!j.bank?.branchNumber); setEditing(!j.bank); setLoaded(true); } })
      .catch(e => { if (live) { setError(e instanceof Error ? e.message : "Bank details could not be loaded."); setLoaded(true); } });
    return () => { live = false; };
  }, [query]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    const f = new FormData(event.currentTarget);
    const payload = { ...(audience === "admin" ? { cloneId } : {}), country: String(f.get("country") || ""), useBranch, swiftBic: String(f.get("swiftBic") || ""), branchNumber: String(f.get("branchNumber") || ""), accountNumber: String(f.get("accountNumber") || ""), accountName: String(f.get("accountName") || "") };
    try {
      const r = await fetch("/api/payouts/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Bank details could not be saved.");
      setBank({ country: payload.country, swiftBic: useBranch ? "" : payload.swiftBic.toUpperCase(), branchNumber: useBranch ? payload.branchNumber : "", accountNumber: payload.accountNumber, accountName: payload.accountName, updatedAt: new Date().toISOString() });
      setEditing(false); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Bank details could not be saved."); }
    finally { setSaving(false); }
  }

  return <section id="bank-details" className={styles.panel} aria-labelledby="bank-title">
    <div className={styles.panelHeading}><h2 id="bank-title">Bank account</h2>{bank && !editing && <button type="button" className={styles.outline} onClick={() => { setEditing(true); setSaved(false); }}>Change</button>}</div>
    {!loaded ? <p className={styles.empty}>Loading…</p> : <>
      {error && <div role="alert" className={styles.formError}>{error}</div>}
      {saved && <div role="status" className={styles.success}><Check size={16} />Bank details saved.</div>}
      {bank && !editing ? <dl className={styles.bankView}>
        <div><dt>Country</dt><dd>{bank.country}</dd></div>
        <div><dt>{bank.branchNumber ? "Branch number" : "SWIFT / BIC"}</dt><dd>{bank.branchNumber || bank.swiftBic}</dd></div>
        <div><dt>Account number / IBAN</dt><dd>{bank.accountNumber}</dd></div>
        <div><dt>Account name</dt><dd>{bank.accountName}</dd></div>
      </dl> : !error || bank ? <form onSubmit={save}>
        <div className={styles.bankAlert} role="note"><Info size={20} /><p><strong>Stop and check!</strong> Scammers could trick you into adding new payees. Make sure these details are your own and correct before you save.</p></div>
        <fieldset disabled={saving} className={styles.formFields}>
          <label><FieldLabel label="Destination country" required /><select name="country" defaultValue={bank?.country || "Australia"} className={selectCls} required>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className={styles.bankCheck}><input type="checkbox" checked={useBranch} onChange={e => setUseBranch(e.target.checked)} />Use branch number instead of SWIFT/BIC</label>
          {useBranch ? <Field label="Branch number (BSB)" name="branchNumber" defaultValue={bank?.branchNumber || ""} required /> : <Field label="SWIFT / BIC code" name="swiftBic" defaultValue={bank?.swiftBic || ""} placeholder="8 or 11 characters" required />}
          <Field label="Account number / IBAN" name="accountNumber" defaultValue={bank?.accountNumber || ""} required />
          <Field label="Account name" name="accountName" defaultValue={bank?.accountName || ""} placeholder="Full legal name or registered entity name" required />
        </fieldset>
        <div className={styles.formFooter}><span>Enter the full legal name (first, any middle, last) or registered legal entity name of the account holder.</span><button type="submit" disabled={saving} className={styles.primary}>{saving ? <RefreshCw size={16} className={styles.spin} /> : <Check size={16} />} {saving ? "Saving…" : "Save bank account"}</button></div>
      </form> : null}
    </>}
  </section>;
}
