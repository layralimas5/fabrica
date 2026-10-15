import { toAccountInput } from '../domain/account';
import { toCarouselInput } from '../domain/carousel';
import { sameProject, sanitizeProjectInput, validateProject, type Project, type ProjectInput } from '../domain/project';
import type { Services } from './ports';

/**
 * Saves a project. Accounts and carousels point to their project by name, so renaming a project
 * renames it in every one of them too: nothing of its history is left behind under the old name.
 */
export async function saveProject(services: Services, raw: ProjectInput, editing: Project | null, projects: Project[]): Promise<Project> {
  const input = sanitizeProjectInput(raw);
  const problem = validateProject(input, projects, editing?.id ?? null);
  if (problem) throw new Error(problem);

  if (!editing) return services.projects.create(input);
  const saved = await services.projects.update(editing.id, input);
  if (editing.name === input.name) return saved;

  for (const account of await services.accounts.list()) {
    if (sameProject(account.project, editing.name)) await services.accounts.update(account.id, { ...toAccountInput(account), project: input.name });
  }
  for (const carousel of await services.carousels.list()) {
    if (sameProject(carousel.project, editing.name)) await services.carousels.update(carousel.id, { ...toCarouselInput(carousel), project: input.name });
  }
  return saved;
}
