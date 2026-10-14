import type { Carousel, Slide } from './carousel';

/** A saved copy of a carousel's text and slides, to go back to after edits. */
export interface ContentVersion {
  id: string;
  carouselId: string;
  label: string;
  snapshot: VersionSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSnapshot {
  title: string;
  caption: string;
  slides: Slide[];
}

export type ContentVersionInput = Omit<ContentVersion, 'id' | 'createdAt' | 'updatedAt'>;

export const MAX_VERSION_LABEL = 80;
/** Older versions beyond this are dropped when a new one is saved. */
export const MAX_VERSIONS_PER_CAROUSEL = 30;

export function snapshotOf(carousel: Pick<Carousel, 'title' | 'caption' | 'slides'>): VersionSnapshot {
  return { title: carousel.title, caption: carousel.caption, slides: structuredClone(carousel.slides) };
}

export function versionInput(carousel: Carousel, label: string): ContentVersionInput {
  return { carouselId: carousel.id, label: label.trim().slice(0, MAX_VERSION_LABEL) || defaultVersionLabel(new Date()), snapshot: snapshotOf(carousel) };
}

export function defaultVersionLabel(date: Date): string {
  return `Versão de ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function sanitizeVersionInput(raw: Partial<ContentVersionInput>): ContentVersionInput {
  const snapshot = raw.snapshot;
  const slides = Array.isArray(snapshot?.slides) ? snapshot.slides.slice(0, 20) : [];
  return {
    carouselId: typeof raw.carouselId === 'string' ? raw.carouselId : '',
    label: typeof raw.label === 'string' ? raw.label.trim().slice(0, MAX_VERSION_LABEL) : '',
    snapshot: {
      title: typeof snapshot?.title === 'string' ? snapshot.title.slice(0, 200) : '',
      caption: typeof snapshot?.caption === 'string' ? snapshot.caption.slice(0, 2200) : '',
      slides,
    },
  };
}

/** Ids of the versions that fall outside the limit, oldest first. */
export function versionsToPrune(versions: ContentVersion[], carouselId: string): string[] {
  return versions
    .filter((version) => version.carouselId === carouselId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(MAX_VERSIONS_PER_CAROUSEL)
    .map((version) => version.id);
}

/** A restored version keeps everything else of the carousel (status, account, schedule). */
export function restoreVersion<T extends Pick<Carousel, 'title' | 'caption' | 'slides'>>(carousel: T, version: ContentVersion): T {
  const slides = version.snapshot.slides.length ? structuredClone(version.snapshot.slides) : carousel.slides;
  return { ...carousel, title: version.snapshot.title || carousel.title, caption: version.snapshot.caption, slides };
}
