import type { Carousel } from '../carousel';
import { addDays } from '../schedule';
import type { SocialConnection } from '../social/connection';
import { activeJobFor, publishProblems, saoPauloDate, type PublishingJob } from './job';

/**
 * Scheduling many carousels at once: each one gets an account and the next free slot of that account
 * (start day, then the chosen times, day after day). Nothing is created here; the dialog shows the plan first.
 */

export interface BatchOptions {
  /** Connected accounts that receive posts, in the order picked. */
  connectionIds: string[];
  /** A carousel goes to the connected account linked to its own Fábrica account, when that one is picked. */
  preferOwnAccount: boolean;
  startDay: string;
  /** 'HH:MM' in Brasília, each one a slot per day and per account. */
  times: string[];
}

export interface BatchEntry {
  carousel: Carousel;
  connection: SocialConnection | null;
  when: Date | null;
  problems: string[];
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DAYS_AHEAD = 365;

export function validTimes(times: string[]): string[] {
  return [...new Set(times.filter((time) => TIME.test(time)))].sort();
}

/** Round robin over the picked accounts, unless the carousel's own account is among them. */
function assign(carousels: Carousel[], picked: SocialConnection[], preferOwnAccount: boolean): (SocialConnection | null)[] {
  let next = 0;
  return carousels.map((carousel) => {
    if (picked.length === 0) return null;
    const own = preferOwnAccount ? picked.find((connection) => connection.accountId !== null && connection.accountId === carousel.source.accountId) : undefined;
    if (own) return own;
    const connection = picked[next % picked.length];
    next += 1;
    return connection;
  });
}

/** Slots of one account from the start day on, skipping the ones less than 5 minutes ahead and the ones already taken. */
function slotsFrom(options: BatchOptions, times: string[], taken: Set<number>, now: Date): () => Date | null {
  let day = 0;
  let index = 0;
  return () => {
    while (day <= MAX_DAYS_AHEAD) {
      const when = saoPauloDate(addDays(options.startDay, day), times[index]);
      index += 1;
      if (index === times.length) {
        index = 0;
        day += 1;
      }
      if (when.getTime() >= now.getTime() + 5 * 60 * 1000 && !taken.has(when.getTime())) return when;
    }
    return null;
  };
}

export function planBatch(carousels: Carousel[], connections: SocialConnection[], jobs: PublishingJob[], options: BatchOptions, now: Date): BatchEntry[] {
  const picked = options.connectionIds.flatMap((id) => connections.filter((connection) => connection.id === id));
  const times = validTimes(options.times);
  const oldestFirst = [...carousels].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const queued = oldestFirst.map((carousel) => activeJobFor(jobs, carousel.id));
  const targets = assign(oldestFirst, picked, options.preferOwnAccount);
  const nextSlot = new Map<string, () => Date | null>();

  return oldestFirst.map((carousel, index) => {
    const connection = targets[index];
    const job = queued[index];
    if (job && job.status !== 'failed') return { carousel, connection, when: new Date(job.postAt), problems: ['Já está na fila de publicação.'] };
    if (!connection) return { carousel, connection, when: null, problems: ['Escolhe pelo menos uma conta.'] };
    if (times.length === 0) return { carousel, connection, when: null, problems: ['Escolhe pelo menos um horário.'] };
    if (!nextSlot.has(connection.id)) {
      const taken = new Set(jobs.filter((item) => item.connectionId === connection.id && item.status !== 'cancelled' && item.status !== 'failed').map((item) => new Date(item.postAt).getTime()));
      nextSlot.set(connection.id, slotsFrom(options, times, taken, now));
    }
    const when = (nextSlot.get(connection.id) as () => Date | null)();
    if (!when) return { carousel, connection, when: null, problems: ['Não sobrou horário livre no próximo ano.'] };
    return { carousel, connection, when, problems: publishProblems(carousel, connection, when, now) };
  });
}
