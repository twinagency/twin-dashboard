import { redirect } from "next/navigation";

// Messages got merged into Fans (one screen: list + chat + data) — this
// route stays so old links/bookmarks don't 404.
export default function MessagesPage() {
  redirect("/users");
}
