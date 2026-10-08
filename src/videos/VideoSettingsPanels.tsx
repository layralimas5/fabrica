import { Music, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { CAPTION_POSITION_LABELS, CAPTION_POSITIONS, CAPTION_STYLE_LABELS, CAPTION_STYLES, MAX_HEADLINE, type CaptionPosition, type CaptionStyle, type VideoLook } from '../domain/video/look';
import { FONT_CHOICES } from '../domain/brandKit';
import { localeOfVoice, voiceLabel, type VoiceGroup } from '../domain/video/voices';
import { Button, Field, Input, Select } from '../ui/primitives';
import type { MusicChoice, VoiceSample } from './useVideoMaker';

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

const SPEEDS = [
  { value: 0.9, label: 'Mais calma' },
  { value: 1, label: 'Normal' },
  { value: 1.1, label: 'Um pouco rápida' },
  { value: 1.2, label: 'Rápida' },
];

interface VoicePanelProps {
  groups: VoiceGroup[];
  loading: boolean;
  error: string | null;
  voiceId: string;
  speed: number;
  sample: VoiceSample;
  canListen: boolean;
  onVoice: (id: string) => void;
  onSpeed: (speed: number) => void;
  onListen: () => void;
}

export function VoicePanel({ groups, loading, error, voiceId, speed, sample, canListen, onVoice, onSpeed, onListen }: VoicePanelProps) {
  const locale = localeOfVoice(voiceId);
  const group = groups.find((item) => item.locale === locale);
  return (
    <Section title="Voz" description="Vozes neurais da Microsoft, de graça, com o tempo de cada palavra: a legenda acompanha a fala.">
      {error && <p className="text-xs text-red-600 dark:text-red-400">Não consegui carregar as vozes: {error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Idioma e país" htmlFor="video-locale" hint="Voz de outro país lê o roteiro com o sotaque dela. As multilíngues falam português melhor.">
          <Select
            id="video-locale"
            value={locale}
            disabled={loading || !groups.length}
            onChange={(event) => {
              const next = groups.find((item) => item.locale === event.target.value);
              if (next?.voices[0]) onVoice(next.voices[0].id);
            }}
          >
            {loading && <option value={locale}>Carregando vozes…</option>}
            {groups.map((item) => (
              <option key={item.locale} value={item.locale}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Voz" htmlFor="video-voice">
          <Select id="video-voice" value={voiceId} disabled={loading || !group} onChange={(event) => onVoice(event.target.value)}>
            {!group && <option value={voiceId}>{voiceId}</option>}
            {group?.voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voiceLabel(voice)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ritmo" htmlFor="video-speed">
          <Select id="video-speed" value={speed} onChange={(event) => onSpeed(Number(event.target.value))}>
            {SPEEDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button onClick={onListen} loading={sample.playing} disabled={!canListen} className="self-start">
        {!sample.playing && <Play className="size-4" aria-hidden />} Ouvir a primeira frase
      </Button>
      {sample.error && <p className="text-xs text-red-600 dark:text-red-400">{sample.error}</p>}
    </Section>
  );
}

export function LookPanel({ look, onChange }: { look: VideoLook; onChange: (patch: Partial<VideoLook>) => void }) {
  const fonts = FONT_CHOICES.includes(look.font as (typeof FONT_CHOICES)[number]) ? FONT_CHOICES : [look.font, ...FONT_CHOICES];
  return (
    <Section title="Visual" description="Começa com as cores e a fonte da marca da conta.">
      <Field label="Texto fixo no topo (opcional)" htmlFor="video-headline" hint="O gancho que fica na tela o vídeo todo.">
        <Input id="video-headline" value={look.headline} maxLength={MAX_HEADLINE} placeholder="Ex.: 3 sinais de que você está se sabotando" onChange={(event) => onChange({ headline: event.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legenda" htmlFor="video-caption-style">
          <Select id="video-caption-style" value={look.captionStyle} onChange={(event) => onChange({ captionStyle: event.target.value as CaptionStyle })}>
            {CAPTION_STYLES.map((style) => (
              <option key={style} value={style}>
                {CAPTION_STYLE_LABELS[style]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Posição da legenda" htmlFor="video-caption-position">
          <Select id="video-caption-position" value={look.captionPosition} onChange={(event) => onChange({ captionPosition: event.target.value as CaptionPosition })}>
            {CAPTION_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {CAPTION_POSITION_LABELS[position]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fonte" htmlFor="video-font">
          <Select id="video-font" value={look.font} onChange={(event) => onChange({ font: event.target.value })}>
            {fonts.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cor da palavra falada" htmlFor="video-accent">
          <input id="video-accent" type="color" value={look.accent} onChange={(event) => onChange({ accent: event.target.value })} className="h-10 w-full cursor-pointer rounded-xl border border-line bg-surface p-1" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Check id="video-uppercase" label="Legenda em maiúsculas" checked={look.uppercase} onChange={(uppercase) => onChange({ uppercase })} />
        <Check id="video-motion" label="Zoom lento nas imagens" checked={look.motion} onChange={(motion) => onChange({ motion })} />
      </div>
    </Section>
  );
}

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

const MUSIC_VOLUMES = [
  { value: 0.08, label: 'Bem baixa' },
  { value: 0.14, label: 'Baixa' },
  { value: 0.22, label: 'Média' },
];

export function MusicPanel({ music, onChange }: { music: MusicChoice | null; onChange: (music: MusicChoice | null) => void }) {
  return (
    <Section title="Música de fundo (opcional)" description="Fica baixinha embaixo da voz e some no final. Use música livre de direitos.">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="video-music" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:bg-subtle focus-within:ring-2 focus-within:ring-accent">
          <Music className="size-4" aria-hidden /> {music ? 'Trocar música' : 'Escolher música'}
          <input
            id="video-music"
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onChange({ file, volume: music?.volume ?? MUSIC_VOLUMES[1].value });
              event.target.value = '';
            }}
          />
        </label>
        {music && (
          <>
            <span className="max-w-[14rem] truncate text-xs text-muted">{music.file.name}</span>
            <Select aria-label="Volume da música" value={music.volume} onChange={(event) => onChange({ ...music, volume: Number(event.target.value) })} className="w-36">
              {MUSIC_VOLUMES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Tirar
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}
