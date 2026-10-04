/** Explicit method boundaries for self-authorized upload/gallery handlers. */
export function isCreatorUploadApiPath(path: string) {
  return path === "/creator-auth/uploads" || path === "/creator-auth/files"
    || /^\/creator-auth\/files\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\/access)?$/i.test(path);
}
export function creatorUploadApiAllowed(path: string, method: string, serverAction: boolean) {
  if (serverAction || !isCreatorUploadApiPath(path)) return false;
  if (/\/files\/[a-f0-9-]{36}$/i.test(path)) return method === "DELETE";
  return method === "GET" || method === "HEAD";
}
