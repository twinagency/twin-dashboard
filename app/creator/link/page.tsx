import { redirect } from "next/navigation";
import { LINK_CREATOR_SIGNUP_PATH } from "@/lib/creator-routing";
export default function LinkCreatorEntry() { redirect(LINK_CREATOR_SIGNUP_PATH); }
