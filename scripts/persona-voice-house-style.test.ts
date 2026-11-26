import { describe, it, expect } from 'vitest';

import { archetypeForKind } from '../src/features/agents/logic/personaFactory';
import { EM_DASH } from './lib/fanCopy';
import {
  fingerprint,
  md5,
  planVoiceRewrites,
  regeneratedVoice,
  renderVoiceMigration,
  sameWords,
} from './lib/personaVoiceHouseStyle';

const D = EM_DASH;
const player = { id: '00000000-0000-0000-0000-000000000002', kind: 'player', name: 'Rush Sato', display_name: null };
const stadium = { id: '00000000-0000-0000-0000-000000000001', kind: 'stadium', name: 'The Rock', display_name: 'The Rock' };

/** What the factory wrote before #702: the swept text with its colon put back as a dash. */
function preSweep(entity: typeof player): string {
  return regeneratedVoice(entity).replace(': ', ` ${D} `);
}

describe('sameWords', () => {
  it('ignores punctuation and case, not words', () => {
    expect(sameWords(`a place, not a person ${D} a built arena`, 'A place, not a person: a built arena')).toBe(true);
    expect(sameWords(`a place ${D} a built arena`, 'a place: a new arena')).toBe(false);
    expect(sameWords('one two', 'two one')).toBe(false);
  });
});

describe('planVoiceRewrites', () => {
  const live = [
    { entity_id: player.id, voice_paragraph: preSweep(player) },
    { entity_id: stadium.id, voice_paragraph: preSweep(stadium) },
  ];

  it('regenerates factory paragraphs with only the punctuation changed, in id order', () => {
    const plan = planVoiceRewrites(live, [player, stadium]);
    expect(plan.rewrites.map((r) => r.entity_id)).toEqual([stadium.id, player.id]);
    for (const r of plan.rewrites) {
      expect(r.next).not.toContain(D);
      expect(r.next).toContain(r.name);
      expect(r.oldMd5).toBe(md5(r.old));
    }
    expect(plan.differs).toEqual([]);
  });

  it('refuses a paragraph whose words differ from the factory (an enriched one), and skips clean rows', () => {
    const enriched = { entity_id: player.id, voice_paragraph: `Rush Sato talks fast ${D} and scores faster.` };
    const clean = { entity_id: stadium.id, voice_paragraph: 'Already clean.' };
    const plan = planVoiceRewrites([enriched, clean], [player, stadium]);
    expect(plan.rewrites).toEqual([]);
    expect(plan.differs.map((d) => d.entity_id)).toEqual([player.id]);
  });

  it('reports a persona with no entity instead of guessing', () => {
    const plan = planVoiceRewrites([{ entity_id: 'ffffffff-0000-0000-0000-000000000000', voice_paragraph: `x ${D} y` }], []);
    expect(plan.orphans).toHaveLength(1);
  });

  it('uses the display name when there is one', () => {
    const named = { ...player, display_name: 'The Heir' };
    expect(regeneratedVoice(named)).toContain('The Heir');
    expect(archetypeForKind('player').voiceParagraph).toContain('${displayName}');
  });
});

describe('renderVoiceMigration', () => {
  const plan = planVoiceRewrites(
    [
      { entity_id: player.id, voice_paragraph: preSweep(player) },
      { entity_id: stadium.id, voice_paragraph: preSweep(stadium) },
    ],
    [player, stadium],
  );
  const sql = renderVoiceMigration(plan, '2026-11-26');

  it('guards every row on the md5 of its live text and reports the count', () => {
    for (const r of plan.rewrites) expect(sql).toContain(`('${r.entity_id}', '${r.oldMd5}', $voice$${r.next}$voice$)`);
    expect(sql).toContain('AND  md5(p.voice_paragraph) = v.old_md5;');
    expect(sql).toContain('GET DIAGNOSTICS n_updated = ROW_COUNT;');
    expect(sql).toContain(fingerprint(plan.rewrites.map((r) => ({ entity_id: r.entity_id, text: r.next }))));
  });

  it('writes no em dash and no bare line feed', () => {
    expect(sql).not.toContain(D);
    expect(/(?<!\r)\n/.test(sql)).toBe(false);
  });
});

describe('fingerprint', () => {
  it('matches the Postgres string_agg form regardless of input order', () => {
    const rows = [
      { entity_id: 'b', text: 'two' },
      { entity_id: 'a', text: 'one' },
    ];
    expect(fingerprint(rows)).toBe(md5(`a:${md5('one')},b:${md5('two')}`));
  });
});
