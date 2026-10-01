import type { Services } from './ports';

/** Renames a library folder and keeps carousels that were scoped to it pointing at the new name. */
export async function renameFolder(services: Services, from: string, to: string): Promise<void> {
  await services.assets.renameFolder(from, to);

  const carousels = await services.carousels.list();
  const affected = carousels.filter((carousel) => (carousel.source.folders ?? []).includes(from));
  for (const { id, createdAt: _c, updatedAt: _u, ...input } of affected) {
    const folders = [...new Set(input.source.folders.map((folder) => (folder === from ? to : folder)))];
    await services.carousels.update(id, { ...input, source: { ...input.source, folders } });
  }
}
