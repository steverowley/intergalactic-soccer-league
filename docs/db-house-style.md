# House style in the database

The house style bans the em dash in anything a fan can read (use a colon, a
comma, brackets or a new sentence). Text in code and in the authored content
files is guarded by `scripts/fanCopyStyle.test.ts`, which scans `src/`,
`supabase/functions/` and every string value in `content/*.json`. Text that
lives only in the database cannot be scanned by a test, because the test runs
without production access. This page holds the read-only queries that measure
it instead.

## Where database text comes from

| Column | Written by | Guarded at the source by |
|---|---|---|
| `entities.meta.profile` | `scripts/seed-entity-profiles.ts` from `content/profiles/*.json` | fanCopyStyle (content scan) |
| `entity_persona.voice_paragraph` | `scripts/seed-personas.ts` from `personaFactory.ts` | fanCopyStyle (source scan) |
| `narratives`, `match_events` | the edge functions | fanCopyStyle (source scan) |

So a dash can only come back through a row written before the sweep, or by
hand. Issue #704 cleaned the seeded rows with migrations 0103 (profiles) and
0104 (persona paragraphs).

## Quick check: is any dash left?

Cheap enough for the free-tier instance (two small tables, one pass each):

```sql
SELECT
  (SELECT count(*) FROM entities
    WHERE position(U&'\2014' IN meta::text) > 0)                          AS entity_meta,
  (SELECT count(*) FROM entity_persona
    WHERE position(U&'\2014' IN voice_paragraph) > 0)                     AS persona_voice,
  (SELECT count(*) FROM entities
    WHERE meta->'profile' ?| array['trophy_cabinet', 'legends'])          AS non_canon_honours;
```

All three are 0 once 0103 and 0104 are applied.

## Proving a migration landed exactly

Each sweep migration ships with a verification query under `scripts/sql/`
that fingerprints the rows it rewrote:

```
md5(string_agg(id::text || ':' || md5(<column>::text), ',' ORDER BY id::text))
```

| Migration | Query | Before (live snapshot) | After |
|---|---|---|---|
| 0103 | `scripts/sql/verify-0103-entity-prose.sql` | `49aa055e6d139cf90e8481e836c46fed` | `633e63a2e0c5702b674077815d1010dd` |
| 0104 | `scripts/sql/verify-0104-persona-voice.sql` | `528445897492c567aa46f052ecdd5ea0` | `03c6cebe3efc3bd063290e3c9879cd16` |

The "after" value matches only if every row holds exactly the text the
migration wrote. Both migrations skip a row whose text changed after the
snapshot (the md5 guard) and say how many rows they updated in a `NOTICE`; a
fingerprint that matches neither column means some rows were skipped: compare
the rows one by one before doing anything else.

## Every text column, when you need the full picture

The quick check covers the known holdouts. To measure every `text`, `varchar`
and `jsonb` column in `public` (skip `match_positions`, the legacy frame
table, which is large), loop over `information_schema.columns` in a `DO`
block and count `position(U&'\2014' IN col::text) > 0` per column. "0 left"
is only true for the columns actually scanned.

## Fixing a stored row

Never a blind swap: rewrite each sentence with the punctuation it needs, in
the source first (content file or factory), then in the database with a
guarded, idempotent migration (pattern: 0086, 0103). Persona paragraphs are
regenerated, not hand-edited: `npx tsx scripts/persona-voice-house-style.ts`
reads production through the read cache, regenerates each dashed paragraph
from the swept factory, refuses any row where that would change the words,
and writes the migration plus its verification query.
