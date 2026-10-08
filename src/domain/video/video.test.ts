import { describe, expect, it } from 'vitest';
import { coverRect, framingFor } from './motion';
import { assembleNarration, trimSilence } from './narration';
import { buildTimeline, captionAt, sceneAt } from './timeline';
import { captionGroups, parseVideoScript, sentencesOf } from './videoScript';
import { groupVoices, localeOfVoice, voiceLabel } from './voices';
import { alignWords, normalizeWord } from './wordAlignment';

describe('parseVideoScript', () => {
  it('turns paragraphs into scenes and drops their labels', () => {
    const scenes = parseVideoScript('Cena 1: Você não precisa de mais disciplina.\n\nCTA: Comenta "meta" que eu te mando.');
    expect(scenes).toHaveLength(2);
    expect(scenes[0].sentences[0].text).toBe('Você não precisa de mais disciplina.');
    expect(scenes[1].sentences[0].text).toBe('Comenta "meta" que eu te mando.');
  });

  it('splits a single block into one scene per sentence', () => {
    const scenes = parseVideoScript('Primeira frase. Segunda frase! Terceira?');
    expect(scenes.map((scene) => scene.sentences[0].text)).toEqual(['Primeira frase.', 'Segunda frase!', 'Terceira?']);
  });

  it('keeps several sentences inside one paragraph scene', () => {
    const scenes = parseVideoScript('Uma. Duas.\n\nTrês.');
    expect(sentencesOf(scenes).map((sentence) => sentence.text)).toEqual(['Uma.', 'Duas.', 'Três.']);
    expect(scenes[0].sentences).toHaveLength(2);
  });

  it('ignores empty paragraphs and lines without words', () => {
    expect(parseVideoScript('\n\n---\n\n')).toEqual([]);
  });
});

describe('captionGroups', () => {
  it('closes a group at punctuation or after four words', () => {
    expect(captionGroups('Você não precisa de mais disciplina, precisa de menos metas.')).toEqual(['Você não precisa', 'de mais disciplina,', 'precisa de menos metas.']);
  });

  it('never leaves a lone last word', () => {
    expect(captionGroups('um dois três quatro cinco')).toEqual(['um dois três quatro', 'cinco']);
    expect(captionGroups('um dois três')).toEqual(['um dois três']);
    expect(captionGroups('um dois, três quatro')).toEqual(['um dois,', 'três quatro']);
  });
});

const durations = (...seconds: number[]) => seconds.map((duration) => ({ duration, words: [] }));

describe('buildTimeline', () => {
  const scenes = parseVideoScript('Primeira frase aqui. Segunda.\n\nTerceira frase.');

  it('places sentences one after the other with gaps', () => {
    const timeline = buildTimeline(scenes, durations(1, 0.5, 1), { leadIn: 0.2, sentenceGap: 0.1, sceneGap: 0.3, tail: 0.5 });
    expect(timeline.sentences.map((sentence) => sentence.start)).toEqual([0.2, 1.3, expect.closeTo(2.1)]);
    expect(timeline.scenes[0]).toMatchObject({ start: 0, end: expect.closeTo(1.95) });
    expect(timeline.scenes[1].start).toBeCloseTo(1.95);
    expect(timeline.duration).toBeCloseTo(3.6);
  });

  it('spreads the words over the spoken time', () => {
    const timeline = buildTimeline(scenes, durations(1, 0.5, 1));
    const first = timeline.captions[0];
    expect(first.words[0].start).toBeCloseTo(0.2);
    expect(first.words[first.words.length - 1].end).toBeCloseTo(1.2);
  });

  it('uses the time the voice reported for each word', () => {
    const [scene] = parseVideoScript('Você não precisa de mais disciplina.');
    const words = ['Você', 'não', 'precisa', 'de', 'mais', 'disciplina'].map((text, index) => ({ text, start: index * 0.3, end: index * 0.3 + 0.25 }));
    const timeline = buildTimeline([scene], [{ duration: 2, words }], { leadIn: 0.2, sentenceGap: 0, sceneGap: 0, tail: 0 });
    const timed = timeline.captions.flatMap((caption) => caption.words);
    expect(timed.map((word) => word.start)).toEqual([0.2, 0.5, 0.8, expect.closeTo(1.1), expect.closeTo(1.4), expect.closeTo(1.7)]);
    expect(timeline.captions.map((caption) => caption.words.map((word) => word.text).join(' '))).toEqual(['Você não precisa', 'de mais disciplina.']);
  });

  it('rejects durations that do not match the script', () => {
    expect(() => buildTimeline(scenes, durations(1))).toThrow();
  });

  it('finds the scene and the caption on screen', () => {
    const timeline = buildTimeline(scenes, durations(1, 0.5, 1));
    expect(sceneAt(timeline, 0.1)?.index).toBe(0);
    expect(sceneAt(timeline, timeline.duration - 0.01)?.index).toBe(1);
    expect(captionAt(timeline, 0.05)).toBeNull();
    expect(captionAt(timeline, 0.3)?.words[0].text).toBe('Primeira');
  });
});

describe('narration', () => {
  it('puts each sentence at its start', () => {
    const scenes = parseVideoScript('Um. Dois.');
    const timeline = buildTimeline(scenes, durations(0.5, 0.5), { leadIn: 1, sentenceGap: 0, sceneGap: 0, tail: 0 });
    const audio = assembleNarration([new Float32Array(5).fill(1), new Float32Array(5).fill(0.5)], 10, timeline);
    expect(audio.length).toBe(20);
    expect(Array.from(audio.slice(9, 16))).toEqual([0, 1, 1, 1, 1, 1, 0.5]);
  });

  it('trims silence around the voice', () => {
    const samples = new Float32Array([0, 0, 0, 0.5, 0.6, 0, 0, 0]);
    const trimmed = trimSilence(samples, [{ text: 'oi', start: 0.3, end: 0.5 }], 10, 0.01, 0.1);
    expect(Array.from(trimmed.samples)).toEqual([0, 0.5, expect.closeTo(0.6), 0]);
    expect(trimmed.words[0]).toMatchObject({ start: expect.closeTo(0.1), end: expect.closeTo(0.3) });
  });
});

describe('motion', () => {
  it('starts and ends inside the picture', () => {
    for (let scene = 0; scene < 4; scene++) {
      for (const progress of [0, 0.5, 1]) {
        const rect = coverRect(1000, 1500, 1080, 1920, framingFor(scene, progress));
        expect(rect.sx).toBeGreaterThanOrEqual(0);
        expect(rect.sy).toBeGreaterThanOrEqual(0);
        expect(rect.sx + rect.sw).toBeLessThanOrEqual(1000.0001);
        expect(rect.sy + rect.sh).toBeLessThanOrEqual(1500.0001);
      }
    }
  });
});

describe('alignWords', () => {
  const spoken = [
    { text: 'Comenta', start: 0, end: 0.4 },
    { text: 'uma', start: 0.5, end: 0.7 },
    { text: 'agora', start: 1.5, end: 1.9 },
  ];

  it('matches words ignoring case, accents and punctuation', () => {
    expect(normalizeWord('"Única!"')).toBe('unica');
    expect(alignWords(['comenta', '"uma"', 'agora.'], spoken, 2)).toEqual([
      { start: 0, end: 0.4 },
      { start: 0.5, end: 0.7 },
      { start: 1.5, end: 1.9 },
    ]);
  });

  it('fills words the voice did not report between their neighbours', () => {
    const spans = alignWords(['Comenta', 'uma', '—', 'agora'], spoken, 2);
    expect(spans[2].start).toBeCloseTo(0.7);
    expect(spans[2].end).toBeCloseTo(1.5);
  });

  it('spreads everything when there are no word times', () => {
    const spans = alignWords(['um', 'dois'], [], 1);
    expect(spans[0].start).toBe(0);
    expect(spans[1].end).toBeCloseTo(1);
  });
});

describe('voices', () => {
  const voices = [
    { id: 'en-US-AvaMultilingualNeural', locale: 'en-US', gender: 'female' as const, name: 'AvaMultilingual' },
    { id: 'pt-PT-RaquelNeural', locale: 'pt-PT', gender: 'female' as const, name: 'Raquel' },
    { id: 'pt-BR-AntonioNeural', locale: 'pt-BR', gender: 'male' as const, name: 'Antonio' },
    { id: 'pt-BR-FranciscaNeural', locale: 'pt-BR', gender: 'female' as const, name: 'Francisca' },
  ];

  it('puts Brazilian then European Portuguese first', () => {
    expect(groupVoices(voices, null).map((group) => group.locale)).toEqual(['pt-BR', 'pt-PT', 'en-US']);
  });

  it('labels gender and multilingual voices', () => {
    expect(voiceLabel(voices[0])).toBe('Ava (feminina, multilíngue)');
    expect(voiceLabel(voices[2])).toBe('Antonio (masculina)');
    expect(localeOfVoice('es-MX-DaliaNeural')).toBe('es-MX');
  });
});
