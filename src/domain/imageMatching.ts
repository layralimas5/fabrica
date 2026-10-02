import { isPhotoLike, type Asset } from './asset';

/** The fields photo matching looks at. */
export type MatchableAsset = Pick<Asset, 'id' | 'name' | 'folder' | 'kind' | 'tags'>;

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

export function scoreAsset(asset: MatchableAsset, slideKeywords: Set<string>): number {
  let score = 0;
  for (const tag of asset.tags) {
    for (const part of keywords(tag)) if (slideKeywords.has(part)) score += 3;
  }
  for (const part of keywords(`${asset.folder} ${asset.name}`)) if (slideKeywords.has(part)) score += 1;
  return score;
}

/** A photo only goes on a slide when at least its name, folder or one tag relates to the text. */
export const MIN_MATCH_SCORE = 1;

/**
 * Picks the best-scoring photo for each slide that needs one, never a photo unrelated to the text
 * (those slides get null and render as text). Avoids repeats while related unused photos remain;
 * ties are broken randomly so batches don't look identical.
 */
export function matchImages(slideTexts: (string | null)[], assets: MatchableAsset[], random: () => number = Math.random): (string | null)[] {
  const photos = assets.filter(isPhotoLike);
  if (photos.length === 0) return slideTexts.map(() => null);

  const used = new Set<string>();
  return slideTexts.map((text) => {
    if (text === null) return null;
    const words = keywords(text);
    const related = photos
      .map((asset) => ({ asset, score: scoreAsset(asset, words) }))
      .filter(({ score }) => score >= MIN_MATCH_SCORE);
    if (related.length === 0) return null;

    const unused = related.filter(({ asset }) => !used.has(asset.id));
    const ranked = (unused.length > 0 ? unused : related)
      .map((entry) => ({ ...entry, score: entry.score + random() * 0.5 }))
      .sort((a, b) => b.score - a.score);
    const chosen = ranked[0].asset;
    used.add(chosen.id);
    return chosen.id;
  });
}
