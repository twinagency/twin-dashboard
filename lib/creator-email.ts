/** Escape SQL LIKE wildcards so an ILIKE lookup remains an exact email match. */
export function exactCaseInsensitiveEmailPattern(email: string): string {
  return email.replace(/[\\%_]/g, "\\$&");
}
