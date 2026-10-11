"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { CreatorQuestion } from "@/lib/creator-questionnaire";
import styles from "./CreatorProfileQuestionnaire.module.css";

type ChoiceProps = { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled: boolean; custom?: boolean };

function Choices({ label, value, options, onChange, disabled, custom = false }: ChoiceProps) {
  const [customOpen, setCustomOpen] = useState(Boolean(value && !options.includes(value)));
  const other = custom && (customOpen || Boolean(value && !options.includes(value)));
  return <div className={styles.choiceGroup}>
    <div className={styles.choices} role="group" aria-label={label}>
      {options.map(option => <button type="button" key={option} disabled={disabled} aria-pressed={!other && value === option}
        onClick={() => { setCustomOpen(false); onChange(value === option ? "" : option); }}>
        {!other && value === option && <Check size={15} aria-hidden="true" />}{option}
      </button>)}
      {custom && <button type="button" disabled={disabled} aria-pressed={other} onClick={() => { setCustomOpen(!other); onChange(""); }}>Other</button>}
    </div>
    {other && <input className={styles.input} aria-label={`${label}: your answer`} value={value} disabled={disabled} maxLength={5000} placeholder="In your own words" onChange={event => onChange(event.target.value)} />}
  </div>;
}

function socialParts(value: string) {
  const marker = "\nSocial life: ";
  if (value.startsWith("Personality: ")) {
    const split = value.indexOf(marker);
    return split < 0 ? [value.slice(13), ""] : [value.slice(13, split), value.slice(split + marker.length)];
  }
  if (value.startsWith("Social life: ")) return ["", value.slice(13)];
  return [value, ""];
}

function Relationship({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const separator = "\nSharing: ";
  const index = value.lastIndexOf(separator);
  const status = index < 0 ? value : value.slice(0, index);
  const sharing = index < 0 ? "" : value.slice(index + separator.length);
  const join = (nextStatus: string, nextSharing: string) => onChange(`${nextStatus}${nextSharing ? `${separator}${nextSharing}` : ""}`);
  return <>
    <Choices label="Relationship status" value={status} options={["Single", "In a relationship", "Married"]} custom onChange={next => join(next, sharing)} disabled={disabled} />
    <div className={styles.followUp}><span className={styles.subLabel}>Is this public knowledge?</span>
      <Choices label="Relationship visibility" value={sharing} options={["Public", "Private"]} onChange={next => join(status, next)} disabled={disabled} />
    </div>
  </>;
}

function ConditionalDetail({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const pets = id === "pets";
  const negative = pets ? "No pets" : "I don’t drink";
  const positive = pets ? "Yes" : "I drink";
  const prefix = pets ? "Yes — " : "Drink — ";
  const mode = !value ? "" : value === negative ? negative : positive;
  const detail = value === positive || value === negative ? "" : value.startsWith(prefix) ? value.slice(prefix.length) : value;
  return <>
    <Choices label={pets ? "Pets" : "Alcohol preference"} value={mode} options={[negative, positive]} onChange={next => onChange(next === positive && detail ? `${prefix}${detail}` : next)} disabled={disabled} />
    {mode === positive && <label className={styles.followUp}><span className={styles.subLabel}>{pets ? "What’s their name and breed?" : "What’s your favourite drink?"}</span>
      <input className={styles.input} aria-label={pets ? "Pet name and breed" : "Favourite drink"} value={detail} disabled={disabled} maxLength={4950} onChange={event => onChange(event.target.value ? `${prefix}${event.target.value}` : positive)} />
    </label>}
  </>;
}

export default function CreatorProfileField({ question, value, onChange, disabled, required = false }: {
  question: CreatorQuestion; value: string; onChange: (value: string) => void; disabled: boolean; required?: boolean;
}) {
  const { id } = question;
  const label = <span className={styles.label}>{question.label}{required ? " *" : ""}</span>;
  const structured = ["social_style", "pets", "relationship_status", "dom_sub", "drink_of_choice"].includes(id);
  if (structured) {
    let control;
    if (id === "social_style") {
      const [personality, socialLife] = socialParts(value);
      const join = (p: string, s: string) => onChange([p ? `Personality: ${p}` : "", s ? `Social life: ${s}` : ""].filter(Boolean).join("\n"));
      control = <><span className={styles.subLabel}>Personality</span>
        <Choices label="Personality" value={personality} options={["Introvert", "A mix", "Extrovert"]} custom disabled={disabled} onChange={next => join(next, socialLife)} />
        <div className={styles.followUp}><span className={styles.subLabel}>Social life</span>
          <Choices label="Social life" value={socialLife} options={["Staying in", "A mix", "Going out"]} custom disabled={disabled} onChange={next => join(personality, next)} />
        </div></>;
    } else if (id === "relationship_status") control = <Relationship value={value} onChange={onChange} disabled={disabled} />;
    else if (id === "dom_sub") control = <Choices label="Dominant or submissive" value={value} options={["Dominant", "Submissive", "A mix"]} custom disabled={disabled} onChange={onChange} />;
    else control = <ConditionalDetail id={id} value={value} onChange={onChange} disabled={disabled} />;
    return <fieldset className={styles.field} disabled={disabled} data-profile-question={id}><legend>{label}</legend>
      <input type="hidden" name={id} value={value} />{control}
    </fieldset>;
  }
  const autoComplete: Record<string, string> = { full_name: "name", preferred_name: "nickname", email_address: "email", phone_number: "tel", date_of_birth: "bday" };
  return <label className={styles.field} data-profile-question={id}>{label}
    {question.type === "textarea" ? <textarea className={styles.input} name={id} rows={2} value={value} placeholder={question.placeholder} disabled={disabled} required={required} maxLength={5000} onChange={event => onChange(event.target.value)} />
      : <input className={styles.input} name={id} value={value} placeholder={question.placeholder} disabled={disabled} required={required} maxLength={5000} autoComplete={autoComplete[id]} inputMode={id === "email_address" ? "email" : id === "phone_number" ? "tel" : undefined} onChange={event => onChange(event.target.value)} />}
    {question.help && <span className={styles.help}>{question.help}</span>}
  </label>;
}
