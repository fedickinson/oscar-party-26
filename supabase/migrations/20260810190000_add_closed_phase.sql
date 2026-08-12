-- A finished room still carries the provisional live ledger. Closed means the
-- researched settlement is active and every consumer must read that record.
alter type public.room_phase add value if not exists 'closed' after 'finished';
