import { describe, expect, it } from 'vitest';
import { batchProblem, buildBatchPrompt, learningsFrom, type BatchRequest } from './batch';

const request: BatchRequest = {
  project: { name: 'Lumad', description: 'App de viagem solo.', landingUrl: '', conversionGoal: 'Cadastro' },
  objective: 'conversao',
  platforms: ['instagram', 'tiktok'],
  count: 5,
  tone: 'direto',
  format: '4:5',
  slides: 7,
  direction: '',
};

describe('batch generation', () => {
  it('writes a briefing with the project, the order and the answer format, skipping empty fields', () => {
    const prompt = buildBatchPrompt(request, []);
    expect(prompt).toContain('5 carrosséis novos');
    expect(prompt).toContain('Instagram e TikTok');
    expect(prompt).toContain('CARROSSEL 1: <título>');
    expect(prompt).not.toContain('Landing page');
    expect(prompt).not.toContain('O que já funcionou');
  });

  it('carries only learnings from groups with enough contents', () => {
    const rows = (label: string, engagement: number, contents: number) => ({ label, contents, views: 1000, engagement, clicksPerThousand: null, small: contents < 3 });
    const learnings = learningsFrom([
      { title: 'Ganchos', rows: [rows('Lista', 0.09, 4), rows('Dor', 0.05, 5)] },
      { title: 'CTAs', rows: [rows('Comenta QUERO', 0.2, 1), rows('Salva', 0.05, 4)] },
    ]);
    expect(learnings).toEqual(['Ganchos: "Lista" teve o maior engajamento (9% em 4 conteúdos).']);
    expect(buildBatchPrompt(request, learnings)).toContain('dados reais');
  });

  it('asks for what is missing', () => {
    expect(batchProblem({ ...request, platforms: [] })).toMatch(/rede/);
    expect(batchProblem({ ...request, slides: 20 })).toMatch(/3 a 10/);
    expect(batchProblem(request)).toBeNull();
  });
});
