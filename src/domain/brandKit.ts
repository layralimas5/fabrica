export const VISUAL_STYLES = ['minimalista', 'editorial', 'clean', 'bold', 'dark', 'lifestyle', 'post', 'tiktok'] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

export const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = {
  minimalista: 'Minimalista',
  editorial: 'Editorial',
  clean: 'Clean',
  bold: 'Bold',
  dark: 'Dark',
  lifestyle: 'Lifestyle',
  post: 'Post (estilo tweet)',
  tiktok: 'TikTok (foto + texto)',
};

export const PHOTO_TEXT_STYLES = ['outline', 'shadow', 'box-light', 'box-dark', 'plain'] as const;
export type PhotoTextStyle = (typeof PHOTO_TEXT_STYLES)[number];

export const PHOTO_TEXT_STYLE_LABELS: Record<PhotoTextStyle, string> = {
  outline: 'Contorno preto (clássico do TikTok)',
  shadow: 'Sombra suave',
  'box-light': 'Caixa branca, letra preta',
  'box-dark': 'Caixa preta, letra branca',
  plain: 'Sem efeito',
};

export type PhotoTextPosition = 'top' | 'center' | 'bottom';

/** How text sits on top of a full-bleed photo (TikTok style). */
export interface PhotoText {
  style: PhotoTextStyle;
  size: number;
  position: PhotoTextPosition;
  color: string;
}

export const DEFAULT_PHOTO_TEXT: PhotoText = { style: 'outline', size: 58, position: 'center', color: '#ffffff' };

/** Older brand kits were saved before photoText existed. */
export function photoTextOf(brand: Pick<BrandKit, 'photoText'>): PhotoText {
  return { ...DEFAULT_PHOTO_TEXT, ...brand.photoText };
}

/** What the brand sells. AI carousels can show it in one slide as part of the solution. */
export interface BrandProduct {
  name: string;
  pitch: string;
  /** Screenshot or photo of the product, shown in the product slide. */
  imageAssetId: string | null;
}

export const EMPTY_PRODUCT: BrandProduct = { name: '', pitch: '', imageAssetId: null };

/** The brand's product, or null when none is set. Older brand kits were saved before products existed. */
export function productOf(brand: Pick<BrandKit, 'product'>): BrandProduct | null {
  const product = brand.product;
  return product && product.name.trim() ? product : null;
}

export type Spacing = 'compact' | 'normal' | 'airy';

export interface BrandColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
}

export interface BrandTypography {
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  bodyWeight: number;
  headingUppercase: boolean;
  headingTracking: number;
}

export interface BrandKit {
  id: string;
  name: string;
  handle: string;
  logoAssetId: string | null;
  /** Profile picture shown in the post-style header. */
  avatarAssetId: string | null;
  photoText: PhotoText;
  product: BrandProduct;
  colors: BrandColors;
  typography: BrandTypography;
  visualStyle: VisualStyle;
  spacing: Spacing;
  radius: number;
  shadow: boolean;
  imageOverlay: number;
  imageGrayscale: boolean;
  voice: string;
  createdAt: string;
  updatedAt: string;
}

export type BrandKitInput = Omit<BrandKit, 'id' | 'createdAt' | 'updatedAt'>;

export const FONT_CHOICES = [
  'Inter',
  'DM Sans',
  'Manrope',
  'Montserrat',
  'Poppins',
  'Space Grotesk',
  'TikTok Sans',
  'Playfair Display',
  'Fraunces',
  'Cormorant Garamond',
  'DM Serif Display',
  'Libre Baskerville',
] as const;

export function defaultBrandKit(overrides: Partial<BrandKitInput> = {}): BrandKitInput {
  return {
    name: 'Nova marca',
    handle: '',
    logoAssetId: null,
    avatarAssetId: null,
    photoText: { ...DEFAULT_PHOTO_TEXT },
    product: { ...EMPTY_PRODUCT },
    colors: {
      primary: '#111111',
      secondary: '#6d5dfc',
      background: '#f7f6f3',
      surface: '#ffffff',
      text: '#111111',
      muted: '#5f5f5f',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      headingWeight: 800,
      bodyWeight: 500,
      headingUppercase: false,
      headingTracking: -0.03,
    },
    visualStyle: 'minimalista',
    spacing: 'normal',
    radius: 24,
    shadow: false,
    imageOverlay: 35,
    imageGrayscale: false,
    voice: '',
    ...overrides,
  };
}

export const MOMENTUMM_STARTER: BrandKitInput = defaultBrandKit({
  name: 'Momentumm',
  handle: '@momentumm.app',
  colors: {
    primary: '#0f0f12',
    secondary: '#7c6cff',
    background: '#f4f3ef',
    surface: '#ffffff',
    text: '#0f0f12',
    muted: '#55545c',
  },
  typography: {
    headingFont: 'Manrope',
    bodyFont: 'Inter',
    headingWeight: 800,
    bodyWeight: 500,
    headingUppercase: false,
    headingTracking: -0.035,
  },
  visualStyle: 'minimalista',
  voice: 'Minimalista, moderno, tecnológico e aspiracional. Pouco texto, frases curtas, forte contraste. Fala de produtividade sem culpa.',
  product: {
    name: 'Momentumm',
    pitch:
      'App para quem tem metas mas sofre com falta de constância, organização e disciplina. Conecta metas a ações do dia, dá propósito aos hábitos e deixa o progresso visível, pra manter a rotina sem depender de motivação e recomeçar sem culpa.',
    imageAssetId: null,
  },
});

export const TIKTOK_STARTER: BrandKitInput = defaultBrandKit({
  name: 'Ella Refina',
  handle: '@ellarefina',
  typography: {
    headingFont: 'TikTok Sans',
    bodyFont: 'TikTok Sans',
    headingWeight: 600,
    bodyWeight: 500,
    headingUppercase: false,
    headingTracking: 0,
  },
  visualStyle: 'tiktok',
  imageOverlay: 15,
  photoText: { ...DEFAULT_PHOTO_TEXT },
  voice: 'Frases curtas, íntimas e reflexivas, como quem fala com uma amiga. Estética, rotina e autocuidado.',
});
