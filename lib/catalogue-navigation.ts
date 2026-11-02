export type CatalogueTelegramApp = {
  initData: string;
  openTelegramLink(url: string): void;
  close(): void;
};

/** Give Telegram time to process chat navigation before dismissing its webview. */
export function openCatalogueChat(
  chatUrl: string | null | undefined,
  telegram: CatalogueTelegramApp | undefined,
  navigate: (url: string) => void,
  later: (callback: () => void, delay: number) => unknown,
): void {
  if (telegram?.initData) {
    if (!chatUrl) { telegram.close(); return; }
    try {
      telegram.openTelegramLink(chatUrl);
    } catch {
      // A normal Telegram link remains usable if the SDK bridge rejects it.
      navigate(chatUrl);
    }
    // Calling close immediately after openTelegramLink can discard the queued
    // navigation on mobile clients. Keep these as separate native events.
    later(() => telegram.close(), 500);
    return;
  }
  if (chatUrl) navigate(chatUrl);
}
