import type { CreatorQuestionnairePage } from "./creator-questionnaire-draft";

type Copy = [string, string];
type Option = [string, string, Copy?];
type Field = {
  id: string;
  label: Copy;
  input?: "text" | "date" | "email" | "tel" | "textarea";
  options?: Option[];
  private?: boolean;
  multiple?: boolean;
  rows?: "social" | "pets" | "marks";
  help?: Copy;
  heading?: Copy;
};

const yesNo: Option[] = [["Yes", "Sim"], ["No", "Não"]];
const privateOption: Option = ["Keep private", "Prefiro manter privado"];

const hobbies: Option[] = [
  ["Gym", "Academia", ["What kind of training do you do?", "Que tipo de treino você faz?"]],
  ["Gaming", "Jogos", ["What game do you play most?", "Qual jogo você mais joga?"]],
  ["Cooking", "Culinária", ["What do you love to cook?", "O que você adora cozinhar?"]],
  ["Reading", "Leitura", ["What do you like to read?", "O que você gosta de ler?"]],
  ["Music", "Música", ["How do you spend time with music?", "O que você costuma fazer com música?"]],
  ["Sport", "Esporte", ["Which sport?", "Qual esporte?"]],
  ["Outdoors", "Ao ar livre", ["What do you do outdoors?", "O que você faz ao ar livre?"]],
  ["Art", "Arte", ["What kind of art do you make?", "Que tipo de arte você faz?"]],
  ["Other", "Outro", ["Which other hobby?", "Qual outro hobby?"]],
];

const favourites: Option[] = [
  ["Food", "Comida", ["What’s your favourite food?", "Qual é sua comida favorita?"]],
  ["Alcoholic drink", "Bebida alcoólica", ["What’s your favourite alcoholic drink?", "Qual é sua bebida alcoólica favorita?"]],
  ["Coffee order", "Pedido de café", ["What’s your usual coffee order?", "Qual café você costuma pedir?"]],
  ["Snack", "Lanche", ["What’s your favourite snack?", "Qual é seu lanche favorito?"]],
  ["Artist", "Artista", ["Who’s your favourite artist?", "Quem é seu artista favorito?"]],
  ["Song", "Música", ["What’s your favourite song?", "Qual é sua música favorita?"]],
  ["Show", "Série", ["What’s your favourite show?", "Qual é sua série favorita?"]],
  ["Movie", "Filme", ["What’s your favourite movie?", "Qual é seu filme favorito?"]],
  ["Game", "Jogo", ["What’s your favourite game?", "Qual é seu jogo favorito?"]],
  ["Sports team", "Time", ["Which team do you support?", "Para qual time você torce?"]],
  ["Holiday destination", "Destino de viagem", ["Where’s your favourite place to visit?", "Qual é seu lugar favorito para visitar?"]],
];

export const FLIRT_QUESTIONNAIRE_STEPS: { slug: string; title: Copy; description: Copy; fields: Field[] }[] = [
  {
    slug: "flirt-v3-account",
    title: ["Account details", "Dados da conta"],
    description: ["Set up your FLIRT profile · About 5–7 minutes", "Configure seu perfil FLIRT · Cerca de 5 a 7 minutos"],
    fields: [
      { id: "date_of_birth", label: ["What’s your date of birth?", "Qual é sua data de nascimento?"], input: "date" },
      { id: "email_address", label: ["What’s your email address?", "Qual é seu e-mail?"], input: "email" },
      { id: "phone_number", label: ["What’s your phone number?", "Qual é seu telefone?"], input: "tel", help: ["Include your country code.", "Inclua o código do país."] },
      { id: "flirt_social_profiles", label: ["What are your social media links?", "Quais são os links das suas redes sociais?"], rows: "social" },
    ],
  },
  {
    slug: "flirt-v3-about",
    title: ["About you", "Sobre você"],
    description: ["Share the details you’re happy for your AI chats to use.", "Compartilhe os detalhes que você permite usar nas conversas de IA."],
    fields: [
      { id: "preferred_name", heading: ["Basics", "Informações básicas"], label: ["What name do you go by online?", "Que nome você usa online?"] },
      { id: "flirt_nickname", label: ["Do you have a nickname you use online?", "Você usa algum apelido online?"], options: [["Yes", "Sim", ["What’s your nickname?", "Qual é seu apelido?"]], yesNo[1]] },
      { id: "from_grew_up", label: ["Where did you grow up?", "Onde você cresceu?"], private: true },
      { id: "currently_live", label: ["Where are you based now?", "Onde você mora atualmente?"], private: true, help: ["City, region or country is enough.", "Basta informar a cidade, região ou país."] },
      { id: "flirt_languages", label: ["What languages do you text in?", "Em quais idiomas você costuma escrever?"], multiple: true, options: [["English", "Inglês"], ["Portuguese", "Português"], ["Spanish", "Espanhol"], ["French", "Francês"], ["German", "Alemão"], ["Italian", "Italiano"], ["Other", "Outro", ["Which language?", "Qual idioma?"]]] },
      { id: "flirt_relationship_status", label: ["What’s your relationship status?", "Qual é seu estado civil ou relacionamento?"], options: [["Single", "Solteira"], ["In a relationship", "Em um relacionamento"], ["Married", "Casada"], ["Other", "Outro", ["How do you describe it?", "Como você descreve?"]], privateOption] },
      { id: "flirt_siblings", heading: ["Family & pets", "Família e animais"], label: ["Do you have siblings?", "Você tem irmãos?"], options: [["Yes", "Sim", ["How many brothers and sisters are you happy to mention?", "Quantos irmãos e irmãs você quer mencionar?"]], yesNo[1], privateOption] },
      { id: "flirt_children", label: ["Do you have children?", "Você tem filhos?"], options: [["Yes", "Sim", ["How many children are you happy to mention?", "Quantos filhos você quer mencionar?"]], yesNo[1], privateOption] },
      { id: "flirt_pets", label: ["Do you have any pets?", "Você tem animais de estimação?"], rows: "pets" },
      { id: "flirt_marks", heading: ["Tattoos & piercings", "Tatuagens e piercings"], label: ["Do you have any tattoos or piercings?", "Você tem tatuagens ou piercings?"], rows: "marks" },
    ],
  },
  {
    slug: "flirt-v3-interests",
    title: ["Hobbies & favourites", "Passatempos e favoritos"],
    description: ["Choose any hobbies and favourites you’d like to share.", "Escolha os passatempos e favoritos que quiser compartilhar."],
    fields: [
      { id: "flirt_hobbies", label: ["What are your hobbies?", "Quais são seus passatempos?"], multiple: true, options: hobbies },
      { id: "flirt_favourites", label: ["What are your favourites?", "Quais são seus favoritos?"], multiple: true, options: favourites },
    ],
  },
  {
    slug: "flirt-v3-permissions",
    title: ["Preferences & permissions", "Preferências e permissões"],
    description: ["Choose what you’re comfortable sharing and set your chat limits.", "Escolha o que quer compartilhar e defina os limites das conversas."],
    fields: [
      { id: "sexual_orientation", label: ["How do you describe your sexual orientation?", "Como você descreve sua orientação sexual?"], private: true },
      { id: "turn_ons_including_kinks", label: ["What are your turn-ons, including any kinks you’re comfortable sharing?", "O que desperta seu interesse, incluindo fetiches que você queira compartilhar?"], input: "textarea", private: true },
      { id: "turn_offs", label: ["What are your turn-offs?", "O que corta o clima para você?"], input: "textarea", private: true },
      { id: "explicit_chat_allowed", label: ["Do you allow explicit sexual language in your AI chats?", "Você permite linguagem sexual explícita nas suas conversas de IA?"], options: yesNo, help: ["This includes directly talking about sexual acts, fantasies or desires.", "Isso inclui falar diretamente sobre atos, fantasias ou desejos sexuais."] },
      { id: "boundaries", label: ["Are there any topics or types of content you want kept out of your AI chats?", "Há assuntos ou tipos de conteúdo que você quer excluir das suas conversas de IA?"], options: [["Yes", "Sim", ["What should your AI chats avoid?", "O que suas conversas de IA devem evitar?"]], yesNo[1]] },
    ],
  },
];

export const FLIRT_QUESTIONNAIRE_PAGES: CreatorQuestionnairePage[] = FLIRT_QUESTIONNAIRE_STEPS.map(step => ({
  slug: step.slug,
  title: step.title[0],
  description: step.description[0],
  sections: [{ title: step.title[0], questions: step.fields.map(field => ({ id: field.id, label: field.label[0], type: "text" })) }],
}));

export const FLIRT_ROW_FIELDS = {
  social: [["Platform", "Plataforma"], ["Profile link", "Link do perfil"]],
  pets: [["What kind of pet?", "Que tipo de animal?"], ["What’s their name?", "Qual é o nome?"], ["Are they male or female?", "É macho ou fêmea?"]],
  marks: [["Tattoo or piercing?", "Tatuagem ou piercing?"], ["Where is it on your body?", "Onde fica no seu corpo?"], ["What does it look like?", "Como é?" ]],
} as const;

export function flirtRows(value: string) {
  try {
    const rows: unknown = JSON.parse(value);
    if (Array.isArray(rows) && rows.every(row => Array.isArray(row) && row.every(item => typeof item === "string"))) return rows as string[][];
  } catch { /* Empty and legacy scalar answers do not contain rows. */ }
  return [];
}
