// Provider formatting is displayed as text, never injected into the DOM.
const entities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", rsquo: "\u2019", lsquo: "\u2018",
};
export function onlyFansMessageText(value: string): string {
  const formatted = /<\/?(?:p|div|br|span|a|strong|em|b|i|u|ul|ol|li|blockquote|h[1-6])(?:\s|\/?>)/i.test(value);
  let text = formatted ? value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])\s*>/gi, "\n")
    .replace(/<\/?[a-z][\w:-]*(?:\s[^<>]*)?\s*\/?>/gi, "") : value;
  text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (!code.startsWith("#")) return entities[code.toLowerCase()] ?? entity;
    const number = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : entity;
  });
  return formatted ? text.replace(/\n{3,}/g, "\n\n").trim() : text;
}
