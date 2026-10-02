import clsx from 'clsx';
import { useMemo } from 'react';
import type { RenderContext } from '../app/slideRendering';
import type { Asset } from '../domain/asset';
import type { VisualStyle } from '../domain/brandKit';
import { DEFAULT_SLIDE_STYLE, type Slide } from '../domain/carousel';
import type { LayoutId } from '../domain/layouts';
import { SHADE_INTENSITY, SHADE_STYLE_LABELS, SHADE_STYLES, type ImageShade, type ShadeStyle } from '../domain/shade';
import { SlideCanvas } from '../ui/SlideCanvas';

const THUMB_SCALE = 0.12;

/** A layout where the photo fills most of the slide, so the shade is easy to compare. */
function photoLayout(style: VisualStyle): LayoutId {
  if (style === 'tiktok') return 'native_photo';
  if (style === 'post') return 'post_image';
  return 'image_full_quote';
}

function sampleSlide(style: VisualStyle, photoId: string): Slide {
  return {
    id: `shade-${style}`,
    role: 'hook',
    title: 'Você não precisa de mais motivação.',
    subtitle: null,
    body: null,
    bullets: [],
    assetId: photoId,
    layout: photoLayout(style),
    style: DEFAULT_SLIDE_STYLE,
  };
}

interface ShadePickerProps {
  /** Brand, format and style of the carousel; each option only swaps the shade. */
  context: Omit<RenderContext, 'shade'>;
  photo: Asset | undefined;
  value: ImageShade;
  onChange: (shade: ImageShade) => void;
  disabled?: boolean;
  compact?: boolean;
}

/** Shade options as live thumbnails of a library photo, plus the intensity slider. Applies to every photo. */
export function ShadePicker({ context, photo, value, onChange, disabled = false, compact = false }: ShadePickerProps) {
  return (
    <div className="flex flex-col gap-3">
      {photo ? (
        <div role="radiogroup" aria-label="Sombreamento das fotos" className={clsx('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6')}>
          {SHADE_STYLES.map((style) => (
            <ShadeOption key={style} style={style} context={context} photo={photo} value={value} disabled={disabled} onSelect={() => onChange({ ...value, style })} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Suba fotos na Biblioteca pra ver as prévias do sombreamento.</p>
      )}
      <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
        Intensidade: {Math.round(value.intensity * 100)}%
        <input
          type="range"
          min={SHADE_INTENSITY.min}
          max={SHADE_INTENSITY.max}
          step={SHADE_INTENSITY.step}
          value={value.intensity}
          disabled={disabled || value.style === 'none'}
          onChange={(event) => onChange({ ...value, intensity: Number(event.target.value) })}
          className="accent-[var(--accent)] disabled:opacity-50"
        />
      </label>
    </div>
  );
}

interface ShadeOptionProps {
  style: ShadeStyle;
  context: Omit<RenderContext, 'shade'>;
  photo: Asset;
  value: ImageShade;
  disabled: boolean;
  onSelect: () => void;
}

function ShadeOption({ style, context, photo, value, disabled, onSelect }: ShadeOptionProps) {
  const selected = value.style === style;
  const optionContext: RenderContext = useMemo(() => ({ ...context, shade: { style, intensity: value.intensity } }), [context, style, value.intensity]);
  const slide = useMemo(() => sampleSlide(context.visualStyle, photo.id), [context.visualStyle, photo.id]);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={clsx(
        'group flex flex-col gap-1.5 rounded-xl p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60',
        selected ? 'bg-accent/10 ring-2 ring-accent' : 'ring-1 ring-line hover:ring-faint',
      )}
    >
      <SlideCanvas context={optionContext} slide={slide} index={0} scale={THUMB_SCALE} label="" className="pointer-events-none rounded-lg" />
      <span className={clsx('truncate px-0.5 text-xs', selected ? 'font-medium text-ink' : 'text-muted group-hover:text-ink')}>{SHADE_STYLE_LABELS[style]}</span>
    </button>
  );
}
