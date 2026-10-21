export type CreatorPreparation = {
  profile: { answered: number | null; total: number };
  content: { photos: number | null; videos: number | null; pending: number | null; folders: number | null };
  consentSaved: boolean | null;
};

/** Progress describes saved preparation; it never grants permission or activates a platform. */
export function preparationProgress(value: CreatorPreparation) {
  const profileSaved = value.profile.answered !== null && value.profile.answered === value.profile.total;
  const contentKnown = value.content.photos !== null && value.content.videos !== null && value.content.pending !== null;
  const contentSaved = contentKnown && value.content.photos! + value.content.videos! > 0;
  return {
    profileSaved,
    contentSaved,
    needsContentReview: (value.content.pending ?? 0) > 0 || (value.content.folders ?? 0) > 0 && !contentSaved,
    unavailable: value.profile.answered === null || !contentKnown || value.content.folders === null || value.consentSaved === null,
  };
}
