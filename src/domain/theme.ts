import type { BrandKit, Spacing, VisualStyle } from './brandKit';

export interface SlideTheme {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  emphasisBackground: string;
  emphasisText: string;
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  bodyWeight: number;
  uppercase: boolean;
  tracking: number;
  padding: number;
  radius: number;
  shadow: boolean;
  imageOverlay: number;
  grayscale: boolean;
  ruleLines: boolean;
  handle: string;
}

const PADDING: Record<Spacing, number> = { compact: 72, normal: 96, airy: 128 };

/** Brand kit is the source of truth; the visual style only shifts emphasis inside the brand palette. */
export function resolveTheme(brand: BrandKit, style: VisualStyle): SlideTheme {
  const { colors, typography } = brand;
  const base: SlideTheme = {
    background: colors.background,
    surface: colors.surface,
    text: colors.text,
    muted: colors.muted,
    accent: colors.secondary,
    accentText: readableOn(colors.secondary),
    emphasisBackground: colors.primary,
    emphasisText: readableOn(colors.primary),
    headingFont: typography.headingFont,
    bodyFont: typography.bodyFont,
    headingWeight: typography.headingWeight,
    bodyWeight: typography.bodyWeight,
    uppercase: typography.headingUppercase,
    tracking: typography.headingTracking,
    padding: PADDING[brand.spacing],
    radius: brand.radius,
    shadow: brand.shadow,
    imageOverlay: brand.imageOverlay / 100,
    grayscale: brand.imageGrayscale,
    ruleLines: false,
    handle: brand.handle,
  };

  switch (style) {
    case 'minimalista':
      return { ...base, padding: base.padding + 16 };
    case 'editorial':
      return { ...base, ruleLines: true, tracking: Math.min(base.tracking, -0.02) };
    case 'clean':
      return { ...base, background: colors.surface, shadow: true };
    case 'bold':
      return { ...base, uppercase: true, headingWeight: Math.max(base.headingWeight, 800), background: colors.primary, text: readableOn(colors.primary), muted: withAlpha(readableOn(colors.primary), 0.72), emphasisBackground: colors.secondary, emphasisText: readableOn(colors.secondary) };
    case 'dark':
      return { ...base, background: '#0d0d10', surface: '#18181c', text: '#f5f5f4', muted: '#a1a1aa', emphasisBackground: colors.secondary, emphasisText: readableOn(colors.secondary) };
    case 'lifestyle':
      return { ...base, imageOverlay: Math.max(base.imageOverlay, 0.4), radius: Math.max(base.radius, 32) };
  }
}

export function readableOn(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#111111' : '#ffffff';
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0');
  const value = Number.parseInt(full.slice(0, 6), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}
