-- ============================================================================
-- Beat activations — the choose-3 half of the signature-beats system
--
-- THE MECHANIC (v4 content spec)
-- Drafting a character gets you their 5-7 candidate beats; before the episode
-- starts you ACTIVATE exactly three. Only activated beats can score. Opposite
-- bets may both be activated as a deliberate hedge. Every legal 3-combo lands
-- in the same 60-90 band, so the draft-card headline is a bet shape, not a
-- ranking.
--
-- Dragons are exempt: their beats are automatically live (they have only two).
-- Collision beats (partner_entity_id set) are also always live.
--
-- WHY A ROW PER ACTIVATION rather than an array on draft_picks: the live
-- feature this powers is "see what everyone chose AND passed on", which wants
-- realtime inserts per toggle, and the GM console gates awarding on a simple
-- EXISTS. The exactly-3 rule is enforced in the UI, not by constraint —
-- same trust model as everything else in a private room of friends.
--
-- PK is (room_id, beat_id): a beat belongs to one character, a character is
-- drafted by at most one player per room, so per room a beat is activated at
-- most once. player_id is recorded for display, not identity.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS beat_activations (
  room_id    UUID NOT NULL REFERENCES rooms(id)    ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  beat_id    INT  NOT NULL REFERENCES signature_beats(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, beat_id)
);

-- Permissive RLS, matching every other table in this app: one shared anon key,
-- a private room of friends, authorization by obscurity of the room code.
ALTER TABLE beat_activations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read activations" ON beat_activations;
CREATE POLICY "anon read activations" ON beat_activations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon insert activations" ON beat_activations;
CREATE POLICY "anon insert activations" ON beat_activations FOR INSERT TO anon, authenticated WITH CHECK (true);
-- Toggling a choice off before locking in is a DELETE.
DROP POLICY IF EXISTS "anon delete activations" ON beat_activations;
CREATE POLICY "anon delete activations" ON beat_activations FOR DELETE TO anon, authenticated USING (true);

-- Everyone watches everyone's choices land in realtime — on the activation
-- screen (progress) and in the live dashboard (the picks browser).
ALTER PUBLICATION supabase_realtime ADD TABLE beat_activations;

COMMIT;
