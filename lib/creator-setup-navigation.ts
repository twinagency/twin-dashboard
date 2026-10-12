// Let the mounted step save its draft before moving within onboarding.
export function navigateCreatorSetup(href: string, push?: (href: string) => void) {
  const request = new CustomEvent("creator-setup:navigate", { cancelable: true, detail: { href } });
  if (!window.dispatchEvent(request)) return;
  if (push && href.startsWith("/creator/onboarding")) push(href);
  else window.location.assign(href);
}
