#!/usr/bin/env tsx
// ── scripts/persona-voice-house-style.ts ────────────────────────────────────
// Generate supabase/migrations/0104_persona_voice_house_style.sql: the
// em-dash sweep of entity_persona.voice_paragraph, regenerated from the swept
// personaFactory (#704). See scripts/lib/personaVoiceHouseStyle.ts for the rules.
//
// Reads production through the public read cache (no credentials, CDN-cached,
// no load on the database), or from two JSON files you saved earlier:
//
//   npx tsx scripts/persona-voice-house-style.ts
//   npx tsx scripts/persona-voice-house-style.ts --from <dir>   # persona.json + entities.json
//   npx tsx scripts/persona-voice-house-style.ts --check        # report only, write nothing
//
// It prints the counts, the fingerprint the database must show afterwards,
// and up to five examples of any row it refused (regeneration would change
// the words), which it leaves out of the migration.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  fingerprint,
  planVoiceRewrites,
  renderVoiceMigration,
  renderVoiceVerify,
  type EntityRow,
  type PersonaRow,
} from './lib/personaVoiceHouseStyle';

const READ_CACHE = 'https://soccer-league-one.vercel.app/api/db/rest/v1';
const OUT = join('supabase', 'migrations', '0104_persona_voice_house_style.sql');
const VERIFY = join('scripts', 'sql', 'verify-0104-persona-voice.sql');

async function fetchAll<T>(table: string, select: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const url = `${READ_CACHE}/${table}?select=${select}&order=${order}.asc&limit=1000&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function main(): Promise<void> {
  const fromAt = process.argv.indexOf('--from');
  let personas: PersonaRow[];
  let entities: EntityRow[];
  if (fromAt > 0) {
    const dir = process.argv[fromAt + 1] ?? '.';
    personas = JSON.parse(readFileSync(join(dir, 'persona.json'), 'utf8')) as PersonaRow[];
    entities = JSON.parse(readFileSync(join(dir, 'entities.json'), 'utf8')) as EntityRow[];
  } else {
    personas = await fetchAll<PersonaRow>('entity_persona', 'entity_id,voice_paragraph', 'entity_id');
    entities = await fetchAll<EntityRow>('entities', 'id,kind,name,display_name', 'id');
  }

  const plan = planVoiceRewrites(personas, entities);
  const live = fingerprint(plan.rewrites.map((r) => ({ entity_id: r.entity_id, text: r.old })));
  const after = fingerprint(plan.rewrites.map((r) => ({ entity_id: r.entity_id, text: r.next })));
  console.log(`personas read: ${personas.length}`);
  console.log(`regenerated (punctuation only): ${plan.rewrites.length}`);
  console.log(`refused (regeneration changes the words): ${plan.differs.length}`);
  console.log(`orphans (no entity row): ${plan.orphans.length}`);
  console.log(`fingerprint of those rows now:   ${live}`);
  console.log(`fingerprint after the migration: ${after}`);
  for (const d of plan.differs.slice(0, 5)) {
    console.log(`\n${d.kind} ${d.name} (${d.entity_id})\n  live:        ${d.live}\n  regenerated: ${d.regenerated}`);
  }
  if (process.argv.includes('--check')) return;
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(OUT, renderVoiceMigration(plan, today));
  writeFileSync(VERIFY, renderVoiceVerify(plan));
  console.log(`\nwrote ${OUT} and ${VERIFY}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
