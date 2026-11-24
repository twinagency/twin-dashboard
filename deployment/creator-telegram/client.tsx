import { createRoot } from "react-dom/client";
import CreatorTelegramFeed from "@/components/CreatorTelegramFeed";
import { FlirtCreatorLocaleProvider } from "@/components/FlirtCreatorLocale";
import { parseFlirtCreatorLocale } from "@/lib/flirt-creator-locale";
const locale = parseFlirtCreatorLocale(document.documentElement.lang) || "en";
createRoot(document.getElementById("telegram-feed")!).render(
  <FlirtCreatorLocaleProvider locale={locale}><CreatorTelegramFeed /></FlirtCreatorLocaleProvider>,
);
