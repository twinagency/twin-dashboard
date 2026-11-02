-- Match the creator-facing target: 50 verified photos and videos combined.
-- Restore stale content progress only; retain questionnaire, voice and consent state.
insert into public.creator_onboarding_progress (
  creator_account_id, questionnaire_completed, content_completed, voice_completed, updated_at
)
select creator_account_id, false, true, false, now()
from public.creator_files
where storage_transfer_status = 'verified'
  and kind in ('content', 'content_sfw_image', 'content_nsfw_image', 'content_sfw_video', 'content_nsfw_video')
group by creator_account_id
having count(*) >= 50
on conflict (creator_account_id) do update
set content_completed = true, updated_at = excluded.updated_at
where not coalesce(creator_onboarding_progress.content_completed, false);
