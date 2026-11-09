import {
  ONBOARDING_REVIEW_ACCOUNT_ID,
  type CreatorDashboardIdentity,
} from "./creator-dashboard-identity";
import { isZaneDemo } from "./creator-demo-policy";
import { isBriLiveDemoAccount } from "./creator-live-demo-policy";

export const CREATOR_ACCOUNT_PATH = "/creator/account";

export function canManageCreatorLogin(creator: CreatorDashboardIdentity): boolean {
  // Live Twin links make earnings read-only. The login still belongs to FLIRT.
  return creator.accountId !== ONBOARDING_REVIEW_ACCOUNT_ID
    && !isZaneDemo(creator)
    && !isBriLiveDemoAccount(creator.accountId);
}
