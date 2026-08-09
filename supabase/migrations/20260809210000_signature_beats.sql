-- ============================================================================
-- Signature beats — plumbing only; content arrives separately
--
-- THE DESIGN (docs/signature-beats-brief.md)
-- Per-character bespoke scoring moments, priced by likelihood, each character's
-- beats summing into the same narrow band so the draft is a choice of bet
-- SHAPE (three coin flips vs one lottery ticket) instead of a sorted list of
-- screen-time totals.
--
-- THIS MIGRATION IS THE PLUMBING HALF. The content — the actual beats per
-- character, being authored against the brief in another workstream — drops in
-- as plain INSERTs whenever it lands. Until then the table is empty and the GM
-- console behaves exactly as before: an empty result renders nothing.
--
-- The GM console reads this to offer one-tap beat chips once a character is
-- selected: the beat's name and points prefill the event, so logging a beat is
-- two taps instead of type-tap-tap. Whether a beat has already fired is derived
-- by name-matching tonight's logged events — no state column, nothing to reset
-- between practice rooms.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS signature_beats (
  id serial PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES draft_entities(id) ON DELETE CASCADE,
  -- Card label. The brief caps it at 22 chars for the draft-card badge; not
  -- enforced here so a long name degrades to truncation, not a failed seed.
  name text NOT NULL,
  -- One sentence: what must appear on screen. Shown to the GM as a tooltip so
  -- adjudication is a read, not a debate.
  trigger_text text NOT NULL DEFAULT '',
  odds text NOT NULL DEFAULT 'coin flip',   -- likely | coin flip | long shot | wild
  points int NOT NULL,
  pitch text NOT NULL DEFAULT '',
  -- Collision beats name a second character whose drafter also scores.
  partner_entity_id uuid REFERENCES draft_entities(id) ON DELETE SET NULL
);

ALTER TABLE signature_beats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read beats" ON signature_beats;
CREATE POLICY "anon read beats" ON signature_beats FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon seed beats" ON signature_beats;
CREATE POLICY "anon seed beats" ON signature_beats FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon update beats" ON signature_beats;
CREATE POLICY "anon update beats" ON signature_beats FOR UPDATE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon delete beats" ON signature_beats;
CREATE POLICY "anon delete beats" ON signature_beats FOR DELETE TO anon, authenticated USING (true);

COMMIT;
