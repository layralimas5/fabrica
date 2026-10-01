const requested = new Map<string, Promise<void>>();

function injectStylesheet(family: string): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;600;700;800;900&display=swap`;
    link.onload = () => resolve();
    link.onerror = () => {
      console.warn(`Fonte "${family}" não carregou; usando a padrão do sistema.`);
      resolve();
    };
    document.head.appendChild(link);
  });
}

/** Loads a Google Font (once) and waits until the given weights are usable on canvas. */
export async function ensureFont(family: string, weights: number[]): Promise<void> {
  if (!requested.has(family)) requested.set(family, injectStylesheet(family));
  await requested.get(family);
  await Promise.all(weights.map((weight) => document.fonts.load(`${weight} 40px "${family}"`, 'AaÇçÃãÉéÍíÓóÚú0123').catch(() => [])));
}
