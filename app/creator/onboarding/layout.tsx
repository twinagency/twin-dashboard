import { cookies } from "next/headers";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { CreatorContentUploadProvider } from "@/components/CreatorContentUploadProvider";
export default async function ContentUploadLayout({ children }: { children: React.ReactNode }) {
  const creator = await creatorDashboardIdentity((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
  return creator ? <CreatorContentUploadProvider key={creator.accountId} accountId={creator.accountId}>{children}</CreatorContentUploadProvider> : <>{children}</>;
}
