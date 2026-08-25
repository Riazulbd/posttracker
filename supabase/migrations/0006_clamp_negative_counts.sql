-- ════════════════════════════════════════════════════════════════════════
--  Clamp negative counts already stored in the database.
--
--  Some Apify actors return -1 as a sentinel for "this platform hid the
--  count" (seen on likes, and possible on comments/shares/views/followers
--  too). Before this fix that flowed straight into the columns and rendered
--  as a negative number on the dashboard. New scrapes are clamped at the
--  source (src/lib/mappers.ts); this migration cleans up rows written
--  before that fix shipped.
-- ════════════════════════════════════════════════════════════════════════

update public.posts set likes = 0 where likes < 0;
update public.posts set comments_count = 0 where comments_count < 0;
update public.posts set share_count = 0 where share_count < 0;
update public.posts set video_plays = 0 where video_plays < 0;
update public.posts set follower_count = 0 where follower_count < 0;

update public.post_snapshots set likes = 0 where likes < 0;
update public.post_snapshots set comments_count = 0 where comments_count < 0;
update public.post_snapshots set share_count = 0 where share_count < 0;
update public.post_snapshots set video_plays = 0 where video_plays < 0;
update public.post_snapshots set follower_count = 0 where follower_count < 0;

update public.tracked_accounts set follower_count = 0 where follower_count < 0;
