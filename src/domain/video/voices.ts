/** Voice catalog grouped by language and country, Brazilian Portuguese first. */

export interface CatalogVoice {
  id: string;
  locale: string;
  gender: 'female' | 'male';
  name: string;
}

export interface VoiceGroup {
  locale: string;
  label: string;
  voices: CatalogVoice[];
}

export const DEFAULT_VOICE = 'pt-BR-FranciscaNeural';
const FIRST_LOCALES = ['pt-BR', 'pt-PT'];
const MULTILINGUAL = /Multilingual$/;

export function localeLabel(locale: string, display: Intl.DisplayNames | null): string {
  const label = display?.of(locale) ?? locale;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function voiceLabel(voice: CatalogVoice): string {
  const name = voice.name.replace(MULTILINGUAL, '');
  const traits = [voice.gender === 'female' ? 'feminina' : 'masculina', ...(MULTILINGUAL.test(voice.name) ? ['multilíngue'] : [])];
  return `${name} (${traits.join(', ')})`;
}

export function groupVoices(voices: CatalogVoice[], display: Intl.DisplayNames | null): VoiceGroup[] {
  const byLocale = new Map<string, CatalogVoice[]>();
  for (const voice of voices) byLocale.set(voice.locale, [...(byLocale.get(voice.locale) ?? []), voice]);
  const rank = (locale: string) => {
    const index = FIRST_LOCALES.indexOf(locale);
    return index === -1 ? FIRST_LOCALES.length : index;
  };
  return [...byLocale.entries()]
    .map(([locale, list]) => ({ locale, label: localeLabel(locale, display), voices: [...list].sort((a, b) => voiceLabel(a).localeCompare(voiceLabel(b), 'pt-BR')) }))
    .sort((a, b) => rank(a.locale) - rank(b.locale) || a.label.localeCompare(b.label, 'pt-BR'));
}

export function localeOfVoice(voiceId: string): string {
  return voiceId.split('-').slice(0, 2).join('-');
}
