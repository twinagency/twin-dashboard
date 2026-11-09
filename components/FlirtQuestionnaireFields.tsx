"use client";

import { Check } from "lucide-react";
import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";
import { FLIRT_QUESTIONNAIRE_STEPS, FLIRT_ROW_FIELDS, flirtRows } from "@/lib/flirt-questionnaire";
import styles from "./CreatorProfileQuestionnaire.module.css";

type Field = (typeof FLIRT_QUESTIONNAIRE_STEPS)[number]["fields"][number];

const rowChoices: Record<string, Record<number, [string, string][]>> = {
  social: { 0: [["Instagram", "Instagram"], ["TikTok", "TikTok"], ["X", "X"], ["YouTube", "YouTube"], ["Telegram", "Telegram"], ["OnlyFans", "OnlyFans"], ["Other", "Outra"]] },
  pets: { 0: [["Dog", "Cachorro"], ["Cat", "Gato"], ["Bird", "Pássaro"], ["Rabbit", "Coelho"], ["Fish", "Peixe"], ["Other", "Outro"]], 2: [["Male", "Macho"], ["Female", "Fêmea"], ["Unsure", "Não sei"]] },
  marks: { 0: [["Tattoo", "Tatuagem"], ["Piercing", "Piercing"]] },
};

export default function FlirtQuestionnaireField({ field, value, change, disabled }: {
  field: Field; value: string; change: (value: string) => void; disabled: boolean;
}) {
  const { t } = useFlirtCreatorLocale();
  const label = t(...field.label);
  const rows = flirtRows(value);
  const privateValue = value === "Keep private";
  const pill = (text: string, active: boolean, onClick: () => void) => (
    <button key={text} type="button" aria-pressed={active} onClick={onClick}>
      {active && <Check size={15} aria-hidden="true" />}{text}
    </button>
  );

  let control;
  if (field.rows) {
    const kind = field.rows;
    const columns = FLIRT_ROW_FIELDS[kind];
    const emptyRow = () => columns.map(() => "");
    const displayed = kind === "social" && !value ? [emptyRow()] : rows;
    const changeRow = (rowIndex: number, column: number, next: string) =>
      change(JSON.stringify(displayed.map((row, index) => index === rowIndex ? row.map((item, pos) => pos === column ? next : item) : row)));
    control = <>
      <div className={styles.choices}>
        {kind === "social"
          ? pill(t("No public profiles", "Sem perfis públicos"), value === "No public profiles", () => change(value === "No public profiles" ? "" : "No public profiles"))
          : <>
            {pill(t("Yes", "Sim"), rows.length > 0, () => change(JSON.stringify(rows.length ? rows : [emptyRow()])))}
            {pill(t("No", "Não"), value === "No", () => change("No"))}
            {pill(t("Keep private", "Prefiro manter privado"), privateValue, () => change("Keep private"))}
          </>}
      </div>
      {displayed.map((row, rowIndex) => <div className={styles.flirtRow} key={rowIndex}>
        {columns.map(([en, pt], column) => {
          const choices = rowChoices[kind][column];
          return <label key={en} className={styles.followUp}><span className={styles.subLabel}>{t(en, pt)}</span>
            {choices ? <select className={styles.input} value={row[column]} onChange={event => changeRow(rowIndex, column, event.target.value)}>
              <option value="">{t("Select", "Selecione")}</option>
              {choices.map(([key, translated]) => <option key={key} value={key}>{t(key, translated)}</option>)}
            </select> : <input className={styles.input} value={row[column]} maxLength={kind === "social" ? 400 : 140} type={kind === "social" ? "url" : "text"} onChange={event => changeRow(rowIndex, column, event.target.value)} />}
          </label>;
        })}
        {displayed.length > 1 && <button className={styles.flirtAdd} type="button" onClick={() => change(JSON.stringify(displayed.filter((_, index) => index !== rowIndex)))}>{t("Remove", "Remover")}</button>}
      </div>)}
      {displayed.length > 0 && <button className={styles.flirtAdd} type="button" onClick={() => change(JSON.stringify([...displayed, emptyRow()]))}>
        {kind === "social" ? t("+ Add another link", "+ Adicionar outro link") : kind === "pets" ? t("+ Add another pet", "+ Adicionar outro animal") : t("+ Add another", "+ Adicionar outro")}
      </button>}
    </>;
  } else if (field.options && field.multiple) {
    const options = field.options;
    const changeDetail = (key: string, next: string) => change(JSON.stringify(rows.map(([choice, detail]) => [choice, choice === key ? next : detail])));
    control = <>
      <div className={styles.choices}>{options.map(([key, translated]) => {
        const selected = rows.some(([choice]) => choice === key);
        return pill(t(key, translated), selected, () => change(JSON.stringify(selected ? rows.filter(([choice]) => choice !== key) : [...rows, [key, ""]])));
      })}</div>
      {options.map(([key, , followUp]) => {
        const row = rows.find(([choice]) => choice === key);
        if (!row || !followUp) return null;
        return <div className={styles.followUp} key={key}><label><span className={styles.subLabel}>{t(...followUp)}</span><input className={styles.input} value={row[1]} maxLength={140} onChange={event => changeDetail(key, event.target.value)} /></label>
          {key === "Alcoholic drink" && <div className={styles.choices}>{pill(t("I don’t drink", "Não bebo"), row[1] === "I don’t drink", () => changeDetail(key, "I don’t drink"))}</div>}
        </div>;
      })}
    </>;
  } else if (field.options) {
    const options = field.options;
    const picked = options.find(([key, , followUp]) => followUp ? value.startsWith(key + ":") : value === key);
    control = <>
      <div className={styles.choices}>{options.map(([key, translated, followUp]) => pill(t(key, translated), picked?.[0] === key, () => {
        if (picked?.[0] !== key) change(followUp ? key + ": " : key);
      }))}</div>
      {picked?.[2] && <label className={styles.followUp}><span className={styles.subLabel}>{t(...picked[2])}</span><input className={styles.input} value={value.slice(picked[0].length + 1).trimStart()} maxLength={field.id === "boundaries" ? 5000 : 140} onChange={event => change(picked[0] + ": " + event.target.value)} /></label>}
    </>;
  } else {
    const textValue = privateValue ? "" : value;
    const props = { "aria-label": label, className: styles.input, value: textValue, disabled: privateValue, maxLength: 500 };
    control = <>
      {field.input === "textarea" ? <textarea {...props} rows={2} onChange={event => change(event.target.value)} /> :
        <input {...props} name={field.id} type={field.input ?? "text"} autoComplete={({ email_address: "email", phone_number: "tel", date_of_birth: "bday", preferred_name: "nickname" } as Record<string,string>)[field.id]} onChange={event => change(event.target.value)} />}
      {field.private && <div className={styles.choices}>{pill(t("Keep private", "Prefiro manter privado"), privateValue, () => change(privateValue ? "" : "Keep private"))}</div>}
    </>;
  }

  return <>
    {field.heading && <h2 className={styles.flirtGroupTitle}>{t(...field.heading)}</h2>}
    <fieldset className={styles.field} disabled={disabled} data-profile-question={field.id}>
    <legend className={styles.label}>{label}</legend>
    {field.help && <p className={styles.help}>{t(...field.help)}</p>}
    {control}
  </fieldset></>;
}
