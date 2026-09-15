import { redirect } from "next/navigation";

export default function CrmPlatformsPage() {
  redirect("/crm/settings?section=connections");
}
