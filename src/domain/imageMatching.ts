import { isPhotoLike, type Asset } from './asset';

const STOPWORDS = new Set(
  'a o as os um uma uns umas de do da dos das em no na nos nas por pra para com sem que e ou mas se seu sua seus suas meu minha voce você ele ela eles elas isso isto esse essa este esta nao não mais muito muita ja já so só tambem também como quando porque entao então ser estar ter ha há foi era sao são vai vou the and'.split(' '),
);

function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word;
}

export function keywords(text: string): Set<string> {
  const normalized = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const words = normalized.match(/[a-z0-9]{3,}/g) ?? [];
  return new Set(words.filter((word) => !STOPWORDS.has(word)).map(stem));
}

export function scoreAsset(asset: Asset, slideKeywords: Set<string>): number {
  let score = 0;
  for (const tag of asset.tags) {
    for (const part of keywords(tag)) if (slideKeywords.has(part)) score += 3;
  }
  for (const part of keywords(`${asset.folder} ${asset.name}`)) if (slideKeywords.has(part)) score += 1;
  return score;
}

/**
 * Picks the best-scoring photo for each slide that needs one, without repeating images
 * while unused ones remain. Ties are broken randomly so batches don't look identical.
 */
export function matchImages(slideTexts: (string | null)[], assets: Asset[], random: () => number = Math.random): (string | null)[] {
  const photos = assets.filter(isPhotoLike);
  if (photos.length === 0) return slideTexts.map(() => null);

  const used = new Set<string>();
  return slideTexts.map((text) => {
    if (text === null) return null;
    const words = keywords(text);
    const pool = photos.filter((asset) => !used.has(asset.id));
    const candidates = pool.length > 0 ? pool : photos;
    const ranked = candidates
      .map((asset) => ({ asset, score: scoreAsset(asset, words) + random() * 0.5 }))
      .sort((a, b) => b.score - a.score);
    const chosen = ranked[0].asset;
    used.add(chosen.id);
    return chosen.id;
  });
}
