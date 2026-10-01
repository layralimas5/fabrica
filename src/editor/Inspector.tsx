import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Copy, ImageOff, Images, RotateCcw, Scissors, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Asset } from '../domain/asset';
import { FONT_CHOICES } from '../domain/brandKit';
import type { Slide } from '../domain/carousel';
import { ROLE_LABELS } from '../domain/content';
import { compatibleLayouts, LAYOUTS, type LayoutId } from '../domain/layouts';
import { AssetThumb } from '../ui/AssetThumb';
import { Alert, Button, Field, Input, Select, Textarea } from '../ui/primitives';

interface InspectorProps {
  slide: Slide;
  index: number;
  total: number;
  assets: Asset[];
  defaultHeadingFont: string;
  aiBusy: 'shorten' | 'variation' | null;
  aiError: string | null;
  onChange: (patch: Partial<Slide>) => void;
  onPickImage: () => void;
  onRewrite: (mode: 'shorten' | 'variation') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}

export function Inspector(props: InspectorProps) {
  const { slide, index, total, assets, onChange } = props;
  const image = slide.assetId ? assets.find((asset) => asset.id === slide.assetId) : undefined;
  const [bulletsDraft, setBulletsDraft] = useState<{ id: string; text: string }>({ id: slide.id, text: slide.bullets.join('\n') });
  const bulletsText = bulletsDraft.id === slide.id ? bulletsDraft.text : slide.bullets.join('\n');

  const switchLayout = (layout: LayoutId) => onChange({ layout });

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="inspector-text" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="inspector-text" className="text-xs font-semibold uppercase tracking-wider text-faint">
            Slide {index + 1} · {ROLE_LABELS[slide.role]}
          </h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" aria-label="Mover para a esquerda" disabled={index === 0} onClick={() => props.onMove(-1)}>
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Mover para a direita" disabled={index === total - 1} onClick={() => props.onMove(1)}>
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <Field label="Texto principal" htmlFor="slide-title">
          <Textarea id="slide-title" rows={2} value={slide.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="Texto secundário" htmlFor="slide-subtitle">
          <Input id="slide-subtitle" value={slide.subtitle ?? ''} onChange={(e) => onChange({ subtitle: e.target.value || null })} />
        </Field>
        <Field label="Corpo" htmlFor="slide-body">
          <Textarea id="slide-body" rows={3} value={slide.body ?? ''} onChange={(e) => onChange({ body: e.target.value || null })} />
        </Field>
        <Field label="Itens (um por linha)" htmlFor="slide-bullets">
          <Textarea
            id="slide-bullets"
            rows={2}
            value={bulletsText}
            onChange={(e) => {
              setBulletsDraft({ id: slide.id, text: e.target.value });
              onChange({ bullets: e.target.value.split('\n').map((line) => line.trim()).filter(Boolean) });
            }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" loading={props.aiBusy === 'shorten'} disabled={props.aiBusy !== null} onClick={() => props.onRewrite('shorten')}>
            <Scissors className="size-3.5" aria-hidden /> Regular texto
          </Button>
          <Button variant="secondary" size="sm" loading={props.aiBusy === 'variation'} disabled={props.aiBusy !== null} onClick={() => props.onRewrite('variation')}>
            <Shuffle className="size-3.5" aria-hidden /> Nova versão
          </Button>
        </div>
        {props.aiError && <Alert>{props.aiError}</Alert>}
      </section>

      <section aria-labelledby="inspector-layout" className="flex flex-col gap-3">
        <h2 id="inspector-layout" className="text-xs font-semibold uppercase tracking-wider text-faint">
          Trocar layout
        </h2>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Layout do slide">
          {compatibleLayouts(Boolean(image)).map((layout) => (
            <button
              key={layout}
              type="button"
              role="radio"
              aria-checked={slide.layout === layout}
              onClick={() => switchLayout(layout)}
              className={clsx(
                'rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                slide.layout === layout ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:border-faint hover:text-ink',
              )}
            >
              {LAYOUTS[layout].label}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="inspector-image" className="flex flex-col gap-3">
        <h2 id="inspector-image" className="text-xs font-semibold uppercase tracking-wider text-faint">
          Imagem
        </h2>
        <div className="flex items-center gap-3">
          {image ? <AssetThumb asset={image} className="size-16 shrink-0 rounded-lg" /> : <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-subtle text-faint"><ImageOff className="size-5" aria-hidden /></div>}
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" onClick={props.onPickImage}>
              <Images className="size-3.5" aria-hidden /> {image ? 'Trocar' : 'Escolher'}
            </Button>
            {image && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ assetId: null, layout: LAYOUTS[slide.layout].needsImage ? LAYOUTS[slide.layout].textOnlyFallback : slide.layout })}
              >
                Remover
              </Button>
            )}
          </div>
        </div>
        {image && !LAYOUTS[slide.layout].needsImage && <p className="text-[11px] text-faint">Esse layout não mostra imagem. Troca pra um layout com imagem.</p>}
      </section>

      <section aria-labelledby="inspector-type" className="flex flex-col gap-3">
        <h2 id="inspector-type" className="text-xs font-semibold uppercase tracking-wider text-faint">
          Tipografia
        </h2>
        <Field label={`Tamanho do título: ${Math.round(slide.style.fontScale * 100)}%`} htmlFor="slide-scale">
          <input
            id="slide-scale"
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={slide.style.fontScale}
            onChange={(e) => onChange({ style: { ...slide.style, fontScale: Number(e.target.value) } })}
            className="accent-[var(--accent)]"
          />
        </Field>
        <Field label="Fonte do título" htmlFor="slide-font">
          <Select id="slide-font" value={slide.style.headingFont ?? ''} onChange={(e) => onChange({ style: { ...slide.style, headingFont: e.target.value || null } })}>
            <option value="">Da marca ({props.defaultHeadingFont})</option>
            {FONT_CHOICES.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={slide.style.offsetX === 0 && slide.style.offsetY === 0}
          onClick={() => onChange({ style: { ...slide.style, offsetX: 0, offsetY: 0 } })}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Recentralizar texto
        </Button>
      </section>

      <section className="flex gap-2 border-t border-line pt-4">
        <Button variant="secondary" size="sm" onClick={props.onDuplicate}>
          <Copy className="size-3.5" aria-hidden /> Duplicar
        </Button>
        <Button variant="danger" size="sm" disabled={total <= 1} onClick={props.onDelete}>
          <Trash2 className="size-3.5" aria-hidden /> Excluir
        </Button>
      </section>
    </div>
  );
}
