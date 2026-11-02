const featuredFanAvatars: Record<string, number> = {
  "briana-ben": 1,
  "briana-oliver": 2,
  "briana-mark": 3,
  "briana-alex": 4,
};

function stableAvatarIndex(id: string) {
  if (featuredFanAvatars[id]) return featuredFanAvatars[id];
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 12 + 1;
}

export function fanAvatarUrl(id: string) {
  return `/dashboard/fans/fan-${String(stableAvatarIndex(id)).padStart(2, "0")}.webp`;
}
