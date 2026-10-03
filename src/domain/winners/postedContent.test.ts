import { describe, expect, it } from 'vitest';
import { GROUP_KEYS } from './insights';
import { emptyRecordInput, sanitizeRecordInput, type ContentRecord } from './record';

const record = (publishedTime: string | null): ContentRecord => ({ ...emptyRecordInput(), publishedTime, id: 'r', createdAt: '', updatedAt: '' });

describe('posts registered after they went live', () => {
  it('keeps a valid posting time, CTA and caption and drops the rest', () => {
    const input = sanitizeRecordInput({ publishedTime: '18:30', cta: '  Comenta ROTINA  ', caption: 'Legenda' });
    expect([input.publishedTime, input.cta, input.caption]).toEqual(['18:30', 'Comenta ROTINA', 'Legenda']);
    expect(sanitizeRecordInput({ publishedTime: '25:00' }).publishedTime).toBeNull();
  });

  it('groups posting times by part of the day', () => {
    expect(GROUP_KEYS.postingTime(record('05:59'))?.key).toBe('madrugada');
    expect(GROUP_KEYS.postingTime(record('08:00'))?.key).toBe('manha');
    expect(GROUP_KEYS.postingTime(record('12:00'))?.key).toBe('tarde');
    expect(GROUP_KEYS.postingTime(record('21:15'))?.label).toBe('Noite (18h–24h)');
    expect(GROUP_KEYS.postingTime(record(null))).toBeNull();
  });
});
