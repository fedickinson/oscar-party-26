-- Make UUID-array initialization explicit in the three active functions that
-- accumulate message or player IDs. The original untyped empty-array literals
-- execute through PostgreSQL's assignment cast, but plpgsql_check correctly
-- reports that ambiguity. Replace only the exact known declarations and fail
-- closed if an earlier definition has drifted.

do $$
declare
  v_function regprocedure;
  v_definition text;
  v_updated text;
  v_needle text;
  v_replacement text;
begin
  for v_function, v_needle, v_replacement in
    select * from (values
      (
        'public.complete_companion_reaction(uuid,text,uuid,jsonb)'::regprocedure,
        'v_message_ids uuid[] := ''{}'';',
        'v_message_ids uuid[] := ''{}''::uuid[];'
      ),
      (
        'public.deliver_due_companion_reactions(uuid,integer)'::regprocedure,
        'v_message_ids uuid[] := ''{}'';',
        'v_message_ids uuid[] := ''{}''::uuid[];'
      ),
      (
        'public.complete_grounded_player_verdicts(uuid,uuid,text,uuid,jsonb,jsonb,integer,text)'::regprocedure,
        'v_player_ids uuid[] := ''{}'';',
        'v_player_ids uuid[] := ''{}''::uuid[];'
      )
    ) as repairs(function_identity, needle, replacement)
  loop
    select pg_get_functiondef(v_function::oid) into strict v_definition;
    v_updated := replace(v_definition, v_needle, v_replacement);

    if v_updated is not distinct from v_definition
       or length(v_definition) - length(replace(v_definition, v_needle, ''))
          is distinct from length(v_needle) then
      raise exception 'UUID-array initializer repair target drifted: %', v_function
        using errcode = '55000';
    end if;

    execute v_updated;
  end loop;
end;
$$;

comment on function public.complete_companion_reaction(uuid, text, uuid, jsonb) is
  'Atomically persists a bounded companion reaction and seals its durable claim.';
comment on function public.deliver_due_companion_reactions(uuid, integer) is
  'Idempotently inserts immutable scheduled companion lines whose due time has passed.';
comment on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) is 'Atomically writes the exact full-room grounded keepsake packet and completes its durable claim.';
