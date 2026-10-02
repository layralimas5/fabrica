/** Darkening layer painted over every photo of a carousel, so text reads well on any image. */
export const SHADE_STYLES = ['none', 'uniform', 'bottom', 'top', 'vignette', 'cinema'] as const;
export type ShadeStyle = (typeof SHADE_STYLES)[number];

export const SHADE_STYLE_LABELS: Record<ShadeStyle, string> = {
  none: 'Nenhum',
  uniform: 'Escurecer tudo',
  bottom: 'Degradê embaixo',
  top: 'Degradê em cima',
  vignette: 'Vinheta (bordas)',
  cinema: 'Cinema (cima e baixo)',
};

export interface ImageShade {
  style: ShadeStyle;
  /** 0 to 1: how dark the strongest part of the shade gets. */
  intensity: number;
}

export const SHADE_INTENSITY = { min: 0.1, max: 0.9, step: 0.05 } as const;

export const DEFAULT_SHADE: ImageShade = { style: 'none', intensity: 0.45 };

/** Carousels saved before shades existed have none. */
export function shadeOf(source: { shade?: ImageShade }): ImageShade {
  return source.shade ?? DEFAULT_SHADE;
}
