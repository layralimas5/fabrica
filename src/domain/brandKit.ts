export const VISUAL_STYLES = ['minimalista', 'editorial', 'clean', 'bold', 'dark', 'lifestyle'] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

export const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = {
  minimalista: 'Minimalista',
  editorial: 'Editorial',
  clean: 'Clean',
  bold: 'Bold',
  dark: 'Dark',
  lifestyle: 'Lifestyle',
};

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
});
