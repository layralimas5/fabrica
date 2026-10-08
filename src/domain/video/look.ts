import type { BrandKit } from '../brandKit';

export const CAPTION_STYLES = ['destaque', 'caixa', 'simples'] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  destaque: 'Palavra falada em cor',
  caixa: 'Palavra falada em caixa',
  simples: 'Legenda simples',
};

export const CAPTION_POSITIONS = ['meio', 'baixo'] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];
export const CAPTION_POSITION_LABELS: Record<CaptionPosition, string> = { meio: 'No meio', baixo: 'Embaixo' };

/** How the video looks: the account's brand colors and font, plus the caption choices. */
export interface VideoLook {
  captionStyle: CaptionStyle;
  captionPosition: CaptionPosition;
  uppercase: boolean;
  font: string;
  weight: number;
  /** Color of the spoken word. */
  accent: string;
  /** Background when a scene has no picture. */
  background: string;
  /** Fixed text at the top during the whole video (the hook). Empty hides it. */
  headline: string;
  /** Slow zoom and pan over the pictures. */
  motion: boolean;
}

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
export const MAX_HEADLINE = 90;

export function defaultLook(brand: Pick<BrandKit, 'colors' | 'typography'> | null): VideoLook {
  return {
    captionStyle: 'destaque',
    captionPosition: 'meio',
    uppercase: brand?.typography.headingUppercase ?? false,
    font: brand?.typography.headingFont || 'Montserrat',
    weight: 800,
    accent: brand?.colors.primary || '#FFD60A',
    background: brand?.colors.background || '#0b0b0d',
    headline: '',
    motion: true,
  };
}
