import clsx from 'clsx';
import { useMemo } from 'react';
import type { RenderContext } from '../app/slideRendering';
import { useServices } from '../app/services';
import type { Asset } from '../domain/asset';
import { VISUAL_STYLE_LABELS, VISUAL_STYLES, type BrandKitInput, type VisualStyle } from '../domain/brandKit';
import { DEFAULT_SLIDE_STYLE, type Slide } from '../domain/carousel';
import { DEFAULT_SHADE, type ImageShade } from '../domain/shade';
import type { AccountIdentity } from '../domain/account';
import type { LayoutId } from '../domain/layouts';
import { SlideCanvas } from '../ui/SlideCanvas';

const THUMB_SCALE = 0.14;
const SAMPLE_TEXT = 'Você não precisa de mais motivação.';

/** The layout that best shows what each style looks like. */
function sampleLayout(style: VisualStyle, hasPhoto: boolean): LayoutId {
  if (style === 'tiktok') return hasPhoto ? 'native_photo' : 'big_statement';
  if (style === 'post') return hasPhoto ? 'post_image' : 'post_text';
  if (style === 'lifestyle' && hasPhoto) return 'image_full_quote';
  return 'text_center';
}

export function sampleSlide(style: VisualStyle, photoId: string | null): Slide {
  return {
    id: `style-${style}`,
    role: 'hook',
    title: SAMPLE_TEXT,
    subtitle: null,
    body: null,
    bullets: [],
    assetId: photoId,
    layout: sampleLayout(style, photoId !== null),
    style: DEFAULT_SLIDE_STYLE,
  };
}

interface StylePickerProps {
  label: string;
  draft: BrandKitInput;
  photo: Asset | undefined;
  assets: Asset[];
  selected: VisualStyle[];
  onToggle: (style: VisualStyle) => void;
  /** Checkbox semantics (format tests) instead of a single choice. */
  multiple?: boolean;
  disabled?: boolean;
  shade?: ImageShade;
  account?: AccountIdentity | null;
}

/** Every option is a live thumbnail of the brand in that style. */
export function StylePicker({ label, draft, photo, assets, selected, onToggle, multiple = false, disabled = false, shade = DEFAULT_SHADE, account = null }: StylePickerProps) {
  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label={label} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {VISUAL_STYLES.map((style) => (
        <StyleOption
          key={style}
          style={style}
          draft={draft}
          photo={photo}
          assets={assets}
          selected={selected.includes(style)}
          multiple={multiple}
          disabled={disabled}
          shade={shade}
          account={account}
          onSelect={() => onToggle(style)}
        />
      ))}
    </div>
  );
}

interface StyleOptionProps {
  style: VisualStyle;
  draft: BrandKitInput;
  photo: Asset | undefined;
  assets: Asset[];
  selected: boolean;
  multiple: boolean;
  disabled: boolean;
  shade: ImageShade;
  account: AccountIdentity | null;
  onSelect: () => void;
}

function StyleOption({ style, draft, photo, assets, selected, multiple, disabled, shade, account, onSelect }: StyleOptionProps) {
  const { assets: repo } = useServices();
  const context: RenderContext = useMemo(
    () => ({ brand: { ...draft, id: 'style-preview', createdAt: '', updatedAt: '' }, assets, repo, format: '4:5', visualStyle: style, total: 1, shade, account }),
    [draft, assets, repo, style, shade, account],
  );
  const slide = useMemo(() => sampleSlide(style, photo?.id ?? null), [style, photo]);

  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={clsx(
        'group flex flex-col disabled:opacity-60 gap-1.5 rounded-xl p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        selected ? 'bg-accent/10 ring-2 ring-accent' : 'ring-1 ring-line hover:ring-faint',
      )}
    >
      <SlideCanvas context={context} slide={slide} index={0} scale={THUMB_SCALE} label="" className="pointer-events-none rounded-lg" />
      <span className={clsx('truncate px-0.5 text-xs', selected ? 'font-medium text-ink' : 'text-muted group-hover:text-ink')}>{VISUAL_STYLE_LABELS[style]}</span>
    </button>
  );
}
