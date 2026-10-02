import { useMemo } from 'react';
import type { RenderContext } from '../app/slideRendering';
import { sampleSlide } from '../brand/StylePicker';
import { FONT_SCALE_RANGE, LINE_HEIGHT_RANGE, TEXT_WIDTH_RANGE, type TextStyle } from '../domain/carousel';
import { SlideCanvas } from '../ui/SlideCanvas';

interface TextStylePanelProps {
  context: RenderContext;
  photoId: string | null;
  /** First sentence of the copy, so the preview shows the real text. */
  sampleText: string | null;
  value: TextStyle;
  onChange: (value: TextStyle) => void;
  disabled?: boolean;
}

const PREVIEW_SCALE = 0.32;

/** Text size, width and line spacing for every slide, with a live preview of one slide in the chosen model. */
export function TextStylePanel({ context, photoId, sampleText, value, onChange, disabled = false }: TextStylePanelProps) {
  const slide = useMemo(() => {
    const base = sampleSlide(context.visualStyle, photoId);
    return { ...base, id: 'text-style-preview', title: sampleText || base.title, style: { ...base.style, ...value } };
  }, [context.visualStyle, photoId, sampleText, value]);

  const slider = (key: keyof TextStyle, label: string, range: { min: number; max: number; step: number }, hint?: string) => (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
      {label}: {Math.round(value[key] * 100)}%
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value[key]}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
        className="accent-[var(--accent)]"
      />
      {hint && <span className="font-normal text-faint">{hint}</span>}
    </label>
  );

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
      <div className="flex flex-col gap-4">
        {slider('fontScale', 'Tamanho do texto', FONT_SCALE_RANGE)}
        {slider('textWidth', 'Largura do texto', TEXT_WIDTH_RANGE, 'Mais estreito quebra a frase em mais linhas curtas.')}
        {slider('lineHeight', 'Espaço entre linhas', LINE_HEIGHT_RANGE)}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ fontScale: 1, textWidth: 1, lineHeight: 1 })}
          className="self-start text-xs font-medium text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Voltar ao padrão
        </button>
      </div>
      <div className="mx-auto w-40 sm:w-full">
        <SlideCanvas context={context} slide={slide} index={0} scale={PREVIEW_SCALE} label="Prévia do texto no slide" className="rounded-xl ring-1 ring-line" />
        <p className="mt-1.5 text-center text-[11px] text-faint">Prévia de um slide</p>
      </div>
    </div>
  );
}
