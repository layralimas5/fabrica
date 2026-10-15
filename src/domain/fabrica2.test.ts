import { describe, expect, it } from 'vitest';
import { duplicateCarousel, type Carousel } from './carousel';
import { restoreVersion, versionInput, versionsToPrune, MAX_VERSIONS_PER_CAROUSEL, type ContentVersion } from './contentVersion';
import { emptyProject, newTrackingKey, normalizeOrigin, sanitizeProjectInput, unregisteredProjectNames, validateProject, type Project } from './project';
import { linkConflict, normalizePermalink, parsePublicationRef, sanitizePublicationInput, type Publication } from './social/publication';

const project = (name: string, id = name): Project => ({ ...emptyProject(name), id, createdAt: '', updatedAt: '' });

describe('projects', () => {
  it('generates tracking keys in the shape the database accepts', () => {
    expect(newTrackingKey()).toMatch(/^pk_[0-9a-f]{24}$/);
    expect(newTrackingKey()).not.toBe(newTrackingKey());
  });

  it('allows the landing page origin and drops anything that is not https', () => {
    const input = sanitizeProjectInput({ ...emptyProject('Lumad'), landingUrl: 'lumad.app/comecar', allowedOrigins: ['http://evil.com', 'quiz.lumad.app/', 'not a url'] });
    expect(input.landingUrl).toBe('https://lumad.app/comecar');
    expect(input.allowedOrigins).toEqual(['https://quiz.lumad.app', 'https://lumad.app']);
    expect(normalizeOrigin('http://localhost:5173/x')).toBe('http://localhost:5173');
  });

  it('keeps a valid tracking key and replaces a broken one', () => {
    const key = newTrackingKey();
    expect(sanitizeProjectInput({ trackingKey: key }).trackingKey).toBe(key);
    expect(sanitizeProjectInput({ trackingKey: 'x' }).trackingKey).toMatch(/^pk_/);
  });

  it('rejects a second project with the same name, ignoring case', () => {
    const projects = [project('Momentumm', 'a')];
    expect(validateProject(emptyProject(' momentumm '.trim()), projects, null)).toMatch(/Já existe/);
    expect(validateProject(emptyProject('Momentumm'), projects, 'a')).toBeNull();
    expect(validateProject(emptyProject(''), projects, null)).toMatch(/nome/);
  });

  it('offers names typed in accounts and carousels that are not projects yet, once each', () => {
    expect(unregisteredProjectNames([project('Aura')], ['aura', 'Lumad', 'lumad ', '', 'Layra Lima'])).toEqual(['Layra Lima', 'Lumad']);
  });
});

describe('publication links', () => {
  it('recognizes post URLs of each network and drops share tracking', () => {
    expect(parsePublicationRef('https://www.instagram.com/p/Cx1AbC/?igsh=abc', 'tiktok')).toEqual({ platform: 'instagram', externalId: null, permalink: 'https://www.instagram.com/p/Cx1AbC/' });
    expect(parsePublicationRef('instagram.com/reel/Cz9', 'instagram')?.permalink).toBe('https://www.instagram.com/p/Cz9/');
    expect(parsePublicationRef('https://www.tiktok.com/@lumad/video/7301234567890123456?lang=pt', 'instagram')).toMatchObject({ platform: 'tiktok', externalId: '7301234567890123456' });
    expect(parsePublicationRef('https://m.facebook.com/lumad/posts/123', 'instagram')).toMatchObject({ platform: 'facebook', permalink: 'https://www.facebook.com/lumad/posts/123/' });
    expect(parsePublicationRef('17895695668004550', 'instagram')).toEqual({ platform: 'instagram', externalId: '17895695668004550', permalink: null });
  });

  it('refuses what is not a post', () => {
    expect(parsePublicationRef('https://www.instagram.com/momentumm/', 'instagram')).toBeNull();
    expect(parsePublicationRef('https://example.com/p/1', 'instagram')).toBeNull();
    expect(parsePublicationRef('   ', 'instagram')).toBeNull();
    expect(normalizePermalink('javascript:alert(1)')).toBeNull();
  });

  it('flags a post already linked to another content', () => {
    const linked: Publication = { ...sanitizePublicationInput({ platform: 'tiktok', externalId: '99999999', carouselId: 'c1' }), id: 'p1', createdAt: '', updatedAt: '' };
    const ref = { platform: 'tiktok' as const, externalId: '99999999', permalink: null };
    expect(linkConflict(ref, [linked], { carouselId: 'c2', recordId: null })?.id).toBe('p1');
    expect(linkConflict(ref, [linked], { carouselId: 'c1', recordId: null })).toBeNull();
  });

  it('accepts only https thumbnails and valid dates', () => {
    const clean = sanitizePublicationInput({ thumbnailUrl: 'http://x/y.jpg', publishedAt: 'ontem' });
    expect(clean.thumbnailUrl).toBeNull();
    expect(clean.publishedAt).toBeNull();
  });
});

const carousel = {
  id: 'c1',
  title: 'Gancho',
  caption: 'legenda',
  status: 'published',
  scheduledFor: '2026-10-01',
  metrics: null,
  experiment: { id: 'e', name: 'teste', variant: 'A' },
  source: { scheduledTime: '08:00' },
  slides: [{ id: 's1', title: 'Um', bullets: [], style: {}, card: null }],
} as unknown as Carousel;

describe('duplicating and versions', () => {
  it('duplicates as a new draft, unscheduled, outside the test, with new slide ids', () => {
    const copy = duplicateCarousel(carousel);
    expect(copy).toMatchObject({ title: 'Gancho (cópia)', status: 'draft', scheduledFor: null, experiment: null });
    expect(copy.source.scheduledTime).toBeNull();
    expect(copy.slides[0].id).not.toBe('s1');
  });

  it('restores the text and slides of a version and keeps the rest', () => {
    const version: ContentVersion = { ...versionInput({ ...carousel, title: 'Antigo', caption: 'velha' }, 'v1'), id: 'v', createdAt: '', updatedAt: '' };
    const restored = restoreVersion({ ...carousel, title: 'Novo', caption: 'nova', slides: [] }, version);
    expect(restored).toMatchObject({ title: 'Antigo', caption: 'velha', status: 'published' });
    expect(restored.slides).toHaveLength(1);
  });

  it('prunes the oldest versions past the limit', () => {
    const versions = Array.from({ length: MAX_VERSIONS_PER_CAROUSEL + 2 }, (_, index) => ({
      id: `v${index}`,
      carouselId: 'c1',
      label: '',
      snapshot: { title: '', caption: '', slides: [] },
      createdAt: `2026-10-${String(index + 1).padStart(2, '0')}`,
      updatedAt: '',
    }));
    expect(versionsToPrune(versions, 'c1')).toEqual(['v1', 'v0']);
  });
});
