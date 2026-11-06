"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";

import { useState } from "react";
import { Check } from "lucide-react";
import type { CreatorQuestion } from "@/lib/creator-questionnaire";
import styles from "./CreatorProfileQuestionnaire.module.css";

const portugueseCopy: Record<string, string> = {
  "What name should fans call you?": "Como seus fãs devem chamar você?",
  "Languages": "Idiomas que você fala",
  "Ethnicity or nationality": "Etnia ou nacionalidade",
  "Your social style": "Seu jeito de socializar",
  "Pets": "Animais de estimação",
  "Relationship status": "Estado civil ou relacionamento",
  "Where did you grow up and live now?": "Onde você cresceu e onde mora hoje?",
  "Family": "Família",
  "Your appearance": "Sua aparência",
  "Three things fans should know": "Três coisas que seus fãs deveriam saber sobre você",
  "Social profiles": "Perfis nas redes sociais",
  "Favourite foods": "Comidas favoritas",
  "Music & artists": "Músicas e artistas favoritos",
  "Movie genre": "Gênero de filme favorito",
  "Sports & teams": "Esportes e times",
  "Travel & favourite place": "Viagens e seu lugar favorito",
  "Favourite drink": "Bebida favorita",
  "Sexual orientation": "Orientação sexual",
  "Dominant or submissive?": "Dominante ou submissa?",
  "Turn-ons, including kinks": "O que desperta seu interesse, incluindo fetiches",
  "Turn-offs": "O que corta o clima",
  "Topics or content to avoid": "Assuntos ou conteúdos a evitar",
  "Full name": "Nome completo",
  "Date of birth": "Data de nascimento",
  "Email address": "E-mail",
  "Phone number": "Telefone",
  "Siblings, children and what you’re happy to share.": "Irmãos, filhos e o que você se sente à vontade para compartilhar.",
  "Height, body type, hair, eyes, tattoos and piercings.": "Altura, tipo físico, cabelo, olhos, tatuagens e piercings.",
  "Personality, hobbies, talents or something unexpected.": "Personalidade, hobbies, talentos ou uma curiosidade.",
  "Your limits, or “None.”": "Liste seus limites ou escreva “Nenhum”.",
  "First and last name": "Nome e sobrenome",
  "MM / DD / YYYY": "DD / MM / AAAA",
  "example@example.com": "exemplo@exemplo.com",
  "Single": "Solteira",
  "In a relationship": "Em um relacionamento",
  "Married": "Casada",
  "Public": "Público",
  "Private": "Privado",
  "No pets": "Não tenho animais",
  "Yes": "Sim",
  "I don’t drink": "Não bebo",
  "I drink": "Bebo",
  "Introvert": "Introvertida",
  "A mix": "Um pouco dos dois",
  "Extrovert": "Extrovertida",
  "Staying in": "Ficar em casa",
  "Going out": "Sair",
  "Dominant": "Dominante",
  "Submissive": "Submissa",
};

type ChoiceProps = { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled: boolean; custom?: boolean };

function Choices({ label, value, options, onChange, disabled, custom = false }: ChoiceProps) {
  const [customOpen, setCustomOpen] = useState(Boolean(value && !options.includes(value)));
  const { t } = useFlirtCreatorLocale();
  const other = custom && (customOpen || Boolean(value && !options.includes(value)));
  return <div className={styles.choiceGroup}>
    <div className={styles.choices} role="group" aria-label={label}>
      {options.map(option => <button type="button" key={option} disabled={disabled} aria-pressed={!other && value === option}
        onClick={() => { setCustomOpen(false); onChange(value === option ? "" : option); }}>
        {!other && value === option && <Check size={15} aria-hidden="true" />}{t(option, portugueseCopy[option] ?? option)}
      </button>)}
      {custom && <button type="button" disabled={disabled} aria-pressed={other} onClick={() => { setCustomOpen(!other); onChange(""); }}>{t("Other", "Outra opção")}</button>}
    </div>
    {other && <input className={styles.input} aria-label={t(`${label}: your answer`, `${label}: sua resposta`)} value={value} disabled={disabled} maxLength={5000} placeholder={t("In your own words", "Com suas próprias palavras")} onChange={event => onChange(event.target.value)} />}
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
  const { t } = useFlirtCreatorLocale();
  const index = value.lastIndexOf(separator);
  const status = index < 0 ? value : value.slice(0, index);
  const sharing = index < 0 ? "" : value.slice(index + separator.length);
  const join = (nextStatus: string, nextSharing: string) => onChange(`${nextStatus}${nextSharing ? `${separator}${nextSharing}` : ""}`);
  return <>
    <Choices label={t("Relationship status", "Estado civil ou relacionamento")} value={status} options={["Single", "In a relationship", "Married"]} custom onChange={next => join(next, sharing)} disabled={disabled} />
    <div className={styles.followUp}><span className={styles.subLabel}>{t("Is this public knowledge?", "Essa informação é pública?")}</span>
      <Choices label={t("Relationship visibility", "Visibilidade do relacionamento")} value={sharing} options={["Public", "Private"]} onChange={next => join(status, next)} disabled={disabled} />
    </div>
  </>;
}

function ConditionalDetail({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const pets = id === "pets";
  const { t } = useFlirtCreatorLocale();
  const negative = pets ? "No pets" : "I don’t drink";
  const positive = pets ? "Yes" : "I drink";
  const prefix = pets ? "Yes — " : "Drink — ";
  const knownNegative = (pets ? /^(?:no|none|no pets|i (?:don't|don’t|do not) have (?:any )?pets)[.!]?$/i : /^(?:no|none|non[- ]?drinker|i (?:don't|don’t|do not) drink(?: alcohol)?|(?:don't|don’t|do not) drink|sober)[.!]?$/i).test(value.trim());
  // Earlier answers were free text. Keep unrecognised answers verbatim without
  // claiming that a creator has pets or drinks alcohol on their behalf.
  const mode = knownNegative ? negative : value === positive || value.startsWith(prefix) ? positive : "";
  const detail = value === positive || knownNegative ? "" : value.startsWith(prefix) ? value.slice(prefix.length) : value;
  return <>
    <Choices label={pets ? t("Pets", "Animais de estimação") : t("Alcohol preference", "Consumo de bebidas alcoólicas")} value={mode} options={[negative, positive]} onChange={next => onChange(next === positive && detail ? `${prefix}${detail}` : next)} disabled={disabled} />
    {(mode === positive || Boolean(detail)) && <label className={styles.followUp}><span className={styles.subLabel}>{!mode ? t("Your answer", "Sua resposta") : pets ? t("What’s their name and breed?", "Qual é o nome e a raça?") : t("What’s your favourite drink?", "Qual é a sua bebida favorita?")}</span>
      <input className={styles.input} aria-label={pets ? t("Pet name and breed", "Nome e raça do animal") : t("Favourite drink", "Bebida favorita")} value={detail} disabled={disabled} maxLength={4950} onChange={event => onChange(!mode ? event.target.value : event.target.value ? `${prefix}${event.target.value}` : positive)} />
    </label>}
  </>;
}

export default function CreatorProfileField({ question, value, onChange, disabled, required = false }: {
  question: CreatorQuestion; value: string; onChange: (value: string) => void; disabled: boolean; required?: boolean;
}) {
  const { id } = question;
  const { t } = useFlirtCreatorLocale();
  const shortLabels: Record<string, string> = {
    preferred_name: "What name should fans call you?", languages: "Languages", ethnicity: "Ethnicity or nationality",
    social_style: "Your social style", pets: "Pets", relationship_status: "Relationship status",
    home_background: "Where did you grow up and live now?", family_profile: "Family", appearance_profile: "Your appearance",
    personal_highlights: "Three things fans should know", social_links: "Social profiles", fav_foods: "Favourite foods",
    music_preferences: "Music & artists", fav_movie_genre: "Movie genre", sports_preferences: "Sports & teams",
    travel_favourites: "Travel & favourite place", drink_of_choice: "Favourite drink", sexual_orientation: "Sexual orientation",
    dom_sub: "Dominant or submissive?", turn_ons_including_kinks: "Turn-ons, including kinks", turn_offs: "Turn-offs",
    boundaries: "Topics or content to avoid", full_name: "Full name", date_of_birth: "Date of birth", email_address: "Email address", phone_number: "Phone number",
  };
  const shortHelp: Record<string, string> = {
    family_profile: "Siblings, children and what you’re happy to share.", appearance_profile: "Height, body type, hair, eyes, tattoos and piercings.",
    personal_highlights: "Personality, hobbies, talents or something unexpected.", boundaries: "Your limits, or “None.”",
  };
  const help = shortHelp[id] || question.help;
  const label = <span className={styles.label}>{t(shortLabels[id] || question.label, portugueseCopy[shortLabels[id] || question.label] || question.label)}{required ? " *" : ""}</span>;
  const structured = ["social_style", "pets", "relationship_status", "dom_sub", "drink_of_choice"].includes(id);
  if (structured) {
    let control;
    if (id === "social_style") {
      const [personality, socialLife] = socialParts(value);
      const join = (p: string, s: string) => onChange([p ? `Personality: ${p}` : "", s ? `Social life: ${s}` : ""].filter(Boolean).join("\n"));
      control = <><span className={styles.subLabel}>{t("Personality", "Personalidade")}</span>
        <Choices label={t("Personality", "Personalidade")} value={personality} options={["Introvert", "A mix", "Extrovert"]} custom disabled={disabled} onChange={next => join(next, socialLife)} />
        <div className={styles.followUp}><span className={styles.subLabel}>{t("Social life", "Vida social")}</span>
          <Choices label={t("Social life", "Vida social")} value={socialLife} options={["Staying in", "A mix", "Going out"]} custom disabled={disabled} onChange={next => join(personality, next)} />
        </div></>;
    } else if (id === "relationship_status") control = <Relationship value={value} onChange={onChange} disabled={disabled} />;
    else if (id === "dom_sub") control = <Choices label={t("Dominant or submissive", "Dominante ou submissa")} value={value} options={["Dominant", "Submissive", "A mix"]} custom disabled={disabled} onChange={onChange} />;
    else control = <ConditionalDetail id={id} value={value} onChange={onChange} disabled={disabled} />;
    return <fieldset className={styles.field} disabled={disabled} data-profile-question={id}><legend>{label}</legend>
      <input type="hidden" name={id} value={value} />{control}
    </fieldset>;
  }
  const autoComplete: Record<string, string> = { full_name: "name", preferred_name: "nickname", email_address: "email", phone_number: "tel", date_of_birth: "bday" };
  return <label className={styles.field} data-profile-question={id}>{label}
    {question.type === "textarea" ? <textarea className={styles.input} name={id} rows={2} value={value} placeholder={question.placeholder && t(question.placeholder, portugueseCopy[question.placeholder] ?? question.placeholder)} disabled={disabled} required={required} maxLength={5000} onChange={event => onChange(event.target.value)} />
      : <input className={styles.input} name={id} value={value} placeholder={question.placeholder && t(question.placeholder, portugueseCopy[question.placeholder] ?? question.placeholder)} disabled={disabled} required={required} maxLength={5000} autoComplete={autoComplete[id]} inputMode={id === "email_address" ? "email" : id === "phone_number" ? "tel" : undefined} onChange={event => onChange(event.target.value)} />}
    {help && <span className={styles.help}>{t(help, portugueseCopy[help] ?? help)}</span>}
  </label>;
}
