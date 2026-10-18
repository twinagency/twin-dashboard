import { redirect } from "next/navigation";

// The preview opens on the OnlyFans inbox, which is what OF-D0 builds. The other
// channels are one click away in the top bar.
export default function PreviewRoot() {
  redirect("/onlyfans/inbox");
}
