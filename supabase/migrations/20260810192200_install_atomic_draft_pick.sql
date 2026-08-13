create trigger guard_atomic_draft_pick
before insert on public.draft_picks
for each row execute function public.guard_atomic_draft_pick();
