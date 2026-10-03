import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Copy, ImageOff, Images, Layers, RotateCcw, Scissors, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { isPhotoLike, type Asset } from '../domain/asset';
import { FONT_CHOICES } from '../domain/brandKit';
import type { RenderContext } from '../app/slideRendering';
import { ShadePicker } from '../brand/ShadePicker';
import {
  CARD_POSITION_LABELS,
  CARD_POSITIONS,
  CARD_SIZE_RANGE,
  FONT_SCALE_RANGE,
  LINE_HEIGHT_RANGE,
  TEXT_WIDTH_RANGE,
  toCardSlide,
  toFullSlide,
  type CardPosition,
  type Slide,
  type SlideStyle,
} from '../domain/carousel';
import type { ImageShade } from '../domain/shade';
import { ROLE_LABELS } from '../domain/content';
import { compatibleLayouts, LAYOUTS, layoutWithImage, layoutWithoutImage, type LayoutId } from '../domain/layouts';
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
  onTextStyleForAll: (patch: Partial<Pick<SlideStyle, 'fontScale' | 'textWidth' | 'lineHeight'>>) => void;
  shadeContext: RenderContext;
  onShadeChange: (shade: ImageShade) => void;
  onPickImage: () => void;
  /** Opens the picker for the app cut-out instead of the slide photo. */
  onPickCard: () => void;
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
                onClick={() => onChange({ assetId: null, layout: LAYOUTS[slide.layout].needsImage ? layoutWithoutImage(props.shadeContext.visualStyle) : slide.layout })}
              >
                Remover
              </Button>
            )}
          </div>
        </div>
        {image && !LAYOUTS[slide.layout].needsImage && <p className="text-[11px] text-faint">Esse layout não mostra imagem. Troca pra um layout com imagem.</p>}
      </section>

      <CardSection slide={slide} assets={assets} visualStyle={props.shadeContext.visualStyle} onChange={onChange} onPickCard={props.onPickCard} />

      <section aria-labelledby="inspector-shade" className="flex flex-col gap-3">
        <h2 id="inspector-shade" className="text-xs font-semibold uppercase tracking-wider text-faint">
          Sombreamento das fotos
        </h2>
        <p className="-mt-1 text-xs text-faint">Vale pra todas as fotos do carrossel.</p>
        <ShadePicker context={props.shadeContext} photo={image ?? assets.find(isPhotoLike)} value={props.shadeContext.shade} onChange={props.onShadeChange} compact />
      </section>

      <section aria-labelledby="inspector-type" className="flex flex-col gap-3">
        <h2 id="inspector-type" className="text-xs font-semibold uppercase tracking-wider text-faint">
          Tipografia
        </h2>
        <p className="-mt-1 text-xs text-faint">Tamanho, largura e espaço entre linhas mudam em todos os slides.</p>
        <Field label={`Tamanho do texto: ${Math.round(slide.style.fontScale * 100)}%`} htmlFor="slide-scale">
          <input
            id="slide-scale"
            type="range"
            min={FONT_SCALE_RANGE.min}
            max={FONT_SCALE_RANGE.max}
            step={FONT_SCALE_RANGE.step}
            value={slide.style.fontScale}
            onChange={(e) => props.onTextStyleForAll({ fontScale: Number(e.target.value) })}
            className="accent-[var(--accent)]"
          />
        </Field>
        <Field label={`Largura do texto: ${Math.round(slide.style.textWidth * 100)}%`} hint="Mais estreito quebra a frase em mais linhas curtas." htmlFor="slide-width">
          <input
            id="slide-width"
            type="range"
            min={TEXT_WIDTH_RANGE.min}
            max={TEXT_WIDTH_RANGE.max}
            step={TEXT_WIDTH_RANGE.step}
            value={slide.style.textWidth}
            onChange={(e) => props.onTextStyleForAll({ textWidth: Number(e.target.value) })}
            className="accent-[var(--accent)]"
          />
        </Field>
        <Field label={`Espaço entre linhas: ${Math.round(slide.style.lineHeight * 100)}%`} htmlFor="slide-line-height">
          <input
            id="slide-line-height"
            type="range"
            min={LINE_HEIGHT_RANGE.min}
            max={LINE_HEIGHT_RANGE.max}
            step={LINE_HEIGHT_RANGE.step}
            value={slide.style.lineHeight}
            onChange={(e) => props.onTextStyleForAll({ lineHeight: Number(e.target.value) })}
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

interface CardSectionProps {
  slide: Slide;
  assets: Asset[];
  visualStyle: RenderContext['visualStyle'];
  onChange: (patch: Partial<Slide>) => void;
  onPickCard: () => void;
}

const POSITION_GLYPHS: Record<CardPosition, string> = { 'top-left': '↖', 'top-right': '↗', center: '•', 'bottom-left': '↙', 'bottom-right': '↘' };

/** The app on a slide: the print filling it, or a cut-out card floating over the slide photo. */
function CardSection({ slide, assets, visualStyle, onChange, onPickCard }: CardSectionProps) {
  const card = slide.card ?? null;
  const cardImage = card ? assets.find((asset) => asset.id === card.assetId) : undefined;
  const isProduct = slide.role === 'product';
  if (!isProduct && !card) {
    return (
      <section aria-labelledby="inspector-card" className="flex flex-col gap-2">
        <h2 id="inspector-card" className="text-xs font-semibold uppercase tracking-wider text-faint">
          Recorte do app
        </h2>
        <Button variant="ghost" size="sm" className="self-start" onClick={onPickCard}>
          <Layers className="size-3.5" aria-hidden /> Colocar um recorte por cima
        </Button>
      </section>
    );
  }

  const toCard = () => {
    const next = toCardSlide(slide);
    // Until a background photo is chosen, the slide shows only its text behind the card.
    onChange({ ...next, layout: next.assetId ? slide.layout : LAYOUTS[slide.layout].needsImage ? layoutWithoutImage(visualStyle) : slide.layout });
  };
  const toFull = () => {
    const next = toFullSlide(slide);
    onChange({ ...next, layout: next.assetId ? layoutWithImage(slide.layout, visualStyle) : slide.layout });
  };

  return (
    <section aria-labelledby="inspector-card" className="flex flex-col gap-3">
      <h2 id="inspector-card" className="text-xs font-semibold uppercase tracking-wider text-faint">
        {isProduct ? 'Como o app aparece' : 'Recorte do app'}
      </h2>
      {isProduct && (
        <div role="radiogroup" aria-label="Como o app aparece" className="grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1">
          {([
            ['full', 'Tela cheia', !card, toFull],
            ['card', 'Recorte', Boolean(card), toCard],
          ] as const).map(([id, label, active, action]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (active) return;
                // Without a print yet, "Recorte" goes straight to choosing the cut-out.
                if (id === 'card' && !slide.assetId) onPickCard();
                else action();
              }}
              className={clsx(
                'rounded-lg px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {card && (
        <>
          <div className="flex items-center gap-3">
            {cardImage ? <AssetThumb asset={cardImage} className="size-16 shrink-0 rounded-lg" /> : <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-subtle text-faint"><ImageOff className="size-5" aria-hidden /></div>}
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={onPickCard}>
                <Images className="size-3.5" aria-hidden /> Trocar recorte
              </Button>
              {!isProduct && (
                <Button variant="ghost" size="sm" onClick={() => onChange({ card: null })}>
                  Remover
                </Button>
              )}
            </div>
          </div>
          <div role="radiogroup" aria-label="Posição do recorte" className="flex flex-wrap gap-1.5">
            {CARD_POSITIONS.map((position) => (
              <button
                key={position}
                type="button"
                role="radio"
                aria-checked={card.position === position}
                aria-label={CARD_POSITION_LABELS[position]}
                title={CARD_POSITION_LABELS[position]}
                onClick={() => onChange({ card: { ...card, position } })}
                className={clsx(
                  'grid size-9 place-items-center rounded-lg border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  card.position === position ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:border-faint hover:text-ink',
                )}
              >
                <span aria-hidden>{POSITION_GLYPHS[position]}</span>
              </button>
            ))}
          </div>
          <Field label={`Tamanho do recorte: ${Math.round(card.size * 100)}%`} htmlFor="card-size">
            <input
              id="card-size"
              type="range"
              min={CARD_SIZE_RANGE.min}
              max={CARD_SIZE_RANGE.max}
              step={CARD_SIZE_RANGE.step}
              value={card.size}
              onChange={(e) => onChange({ card: { ...card, size: Number(e.target.value) } })}
              className="accent-[var(--accent)]"
            />
          </Field>
          {!slide.assetId && <p className="text-[11px] text-faint">Escolha em “Imagem” a foto que fica de fundo.</p>}
        </>
      )}
    </section>
  );
}
