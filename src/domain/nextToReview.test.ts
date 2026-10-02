import { describe, expect, it } from 'vitest';
import { nextToReview, type Carousel } from './carousel';

const carousel = (id: string, createdAt: string, overrides: Partial<Carousel> = {}): Carousel =>
  ({ id, createdAt, status: 'draft', project: 'Momentumm', folder: 'Outubro', ...overrides }) as Carousel;

describe('nextToReview', () => {
  const batch = [
    carousel('a', '2026-10-01T10:00:00Z', { status: 'ready' }),
    carousel('b', '2026-10-01T10:00:01Z'),
    carousel('c', '2026-10-01T10:00:02Z', { status: 'published' }),
    carousel('d', '2026-10-01T10:00:03Z'),
    carousel('x', '2026-10-01T10:00:04Z', { folder: 'Novembro' }),
  ];

  it('goes to the next unsaved carousel of the same project and folder', () => {
    expect(nextToReview(batch[1], batch)?.id).toBe('d');
  });

  it('wraps to earlier ones still pending and ends when the batch is done', () => {
    expect(nextToReview(batch[3], batch)?.id).toBe('b');
    expect(nextToReview(batch[3], batch.filter((item) => item.id !== 'b'))).toBeNull();
  });
});
