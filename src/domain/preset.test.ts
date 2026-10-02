import { describe, expect, it } from 'vitest';
import { DEFAULT_CREATE_SETTINGS, normalizeSettings } from './preset';

describe('normalizeSettings', () => {
  it('fills what an older preset did not save', () => {
    expect(normalizeSettings({ platform: 'tiktok', styles: ['tiktok'] })).toEqual({ ...DEFAULT_CREATE_SETTINGS, platform: 'tiktok', styles: ['tiktok'] });
  });

  it('drops values the app no longer knows', () => {
    const settings = normalizeSettings({ format: '2:3' as never, styles: ['neon' as never], perDay: 99, shade: { style: 'glow' as never, intensity: 1 } });
    expect(settings.format).toBe('4:5');
    expect(settings.styles).toEqual(['minimalista']);
    expect(settings.perDay).toBe(10);
    expect(settings.shade.style).toBe('none');
  });
});
