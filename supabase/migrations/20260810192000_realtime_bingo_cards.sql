-- Peer-card discovery is live state: a player can deal their card after another
-- phone has already opened Bingo. Mark broadcasts alone cannot reveal that new
-- card, so publish card membership before clients hydrate the peer ledger.

do $$
begin
  alter publication supabase_realtime add table public.bingo_cards;
exception
  when duplicate_object then null;
end
$$;
