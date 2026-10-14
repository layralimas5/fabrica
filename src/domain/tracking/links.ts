import { sanitizeUtm, validateDestination, type TrackingLink, type TrackingLinkInput } from './tracking';

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'outros'] as const;
const id = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** Everything saved as a tracked link goes through here (form, backup, local mode). */
export function sanitizeLinkInput(raw: Partial<TrackingLinkInput>): TrackingLinkInput {
  const destination = typeof raw.destination === 'string' ? validateDestination(raw.destination) : null;
  if (!destination) throw new Error('O destino precisa ser um endereço https.');
  if (!raw.projectId) throw new Error('Escolhe o projeto do link.');
  if (typeof raw.slug !== 'string' || !/^[a-z0-9]{6,16}$/.test(raw.slug)) throw new Error('Código do link inválido.');
  return {
    projectId: raw.projectId,
    slug: raw.slug,
    destination,
    platform: PLATFORMS.includes(raw.platform as (typeof PLATFORMS)[number]) ? (raw.platform as TrackingLink['platform']) : null,
    carouselId: id(raw.carouselId),
    recordId: id(raw.recordId),
    publicationId: id(raw.publicationId),
    label: typeof raw.label === 'string' ? raw.label.trim().slice(0, 120) : '',
    utm: sanitizeUtm(raw.utm ?? {}),
    groupId: id(raw.groupId),
  };
}
