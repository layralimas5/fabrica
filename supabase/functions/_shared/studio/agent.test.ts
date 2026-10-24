import { describe, expect, it } from 'vitest';
import { STUDIO_CHANNELS, videoIdempotencyKey, videoPublishProblems, type VideoJob } from '../../../../src/domain/studio/videoJob.ts';
import type { SocialConnection } from '../../../../src/domain/social/connection.ts';
import { AGENT_CHANNELS, agentPostProblems, agentPublishingRow, agentVideoProblems, type AgentPostInput, type Platform } from './agent.ts';

const now = new Date('2026-10-24T12:00:00Z');
const postAt = new Date('2026-10-25T19:00:00Z');
const outputs = { vertical: { path: 'u/j/vertical.mp4', durationSec: 40 }, long: { path: null, durationSec: 600 } };
const input = (extra: Partial<AgentPostInput> = {}): AgentPostInput => ({ videoJobId: 'job-1', connectionId: 'con-1', format: 'vertical', title: 'Título', caption: 'Legenda', privacy: 'public', postAt, ...extra });

function appProblems(platform: Platform, status: string, plan: AgentPostInput, jobStatus = 'ready') {
  const job = { status: jobStatus, outputs } as unknown as Pick<VideoJob, 'status' | 'outputs'>;
  const connection = { platform, status, scopes: [] } as unknown as Pick<SocialConnection, 'platform' | 'status' | 'scopes'>;
  return videoPublishProblems(job, connection, { ...plan, privacy: plan.privacy }, now);
}

describe('agent rules mirror the app', () => {
  const cases: Array<[Platform, string, AgentPostInput, string]> = [
    ['instagram', 'connected', input(), 'ready'],
    ['instagram', 'connected', input({ format: 'long' }), 'ready'],
    ['tiktok', 'expired', input(), 'ready'],
    ['youtube', 'connected', input({ format: 'long', title: '' }), 'ready'],
    ['youtube', 'connected', input({ caption: 'a <b>' }), 'working'],
    ['facebook', 'connected', input({ postAt: new Date(now.getTime() + 60_000) }), 'ready'],
  ];
  it.each(cases)('%s %s', (platform, status, plan, jobStatus) => {
    const agent = agentPostProblems({ job: { status: jobStatus, outputs }, connection: { platform, status } }, plan, now);
    expect(agent).toEqual(appProblems(platform, status, plan, jobStatus).map((problem) => problem.replace(' Reconecta antes de agendar.', '').replace(' (grande demais pro Storage)', '')));
  });

  it('agent channels exist in the studio and write from a briefing', () => {
    for (const id of AGENT_CHANNELS) expect(STUDIO_CHANNELS.find((channel) => channel.id === id)?.modes).toContain('create');
  });
});

describe('agent publishing row', () => {
  it('is always awaiting approval, with the same idempotency key as the app', () => {
    const row = agentPublishingRow('u1', 'instagram', input());
    expect(row.status).toBe('awaiting_approval');
    expect(row.user_id).toBe('u1');
    expect(row.idempotency_key).toBe(videoIdempotencyKey('job-1', 'con-1', 'vertical', postAt));
    expect(row.data).toMatchObject({ kind: 'video', caption: 'Legenda', postAt: postAt.toISOString(), proposedBy: 'escritorio' });
  });

  it('TikTok arrives in the drafts 10 minutes earlier and without caption', () => {
    const row = agentPublishingRow('u1', 'tiktok', input());
    expect(row.scheduled_at).toBe('2026-10-25T18:50:00.000Z');
    expect(row.data.caption).toBe('');
    expect(row.data.postAt).toBe(postAt.toISOString());
  });

  it('YouTube is uploaded by the studio with the chosen privacy', () => {
    expect(agentPublishingRow('u1', 'youtube', input({ privacy: 'unlisted' })).data).toMatchObject({ uploader: 'studio', privacy: 'unlisted' });
  });
});

describe('agent video request', () => {
  it('accepts a full briefing and refuses unknown channel or thin briefing', () => {
    expect(agentVideoProblems({ channel: 'nivora', title: 'IA da semana', brief: 'Três ferramentas de IA que surgiram esta semana', formats: ['vertical'], projectId: null })).toEqual([]);
    expect(agentVideoProblems({ channel: 'lumo', title: 'x', brief: 'curto', formats: [], projectId: null })).toHaveLength(3);
  });
});
