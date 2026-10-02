import clsx from 'clsx';
import { CalendarDays, Download, Eye, Folder, FolderOpen, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { renderContextFor } from '../app/renderContextFor';
import { useAccounts, useAssets, useBrandKits, useCarousels } from '../app/data';
import { useServices } from '../app/services';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import { CAROUSEL_STATUSES, STATUS_LABELS, type Carousel, type CarouselStatus } from '../domain/carousel';
import { Alert, Badge, Button, EmptyState, Input, PageHeader, Select, Spinner } from '../ui/primitives';
import { CarouselViewer } from '../ui/CarouselViewer';
import { CarouselCover } from '../ui/CarouselCover';
import { formatDay } from '../domain/schedule';
import { useMarkWinner } from '../winners/useMarkWinner';

const STATUS_TONE: Record<CarouselStatus, 'neutral' | 'accent' | 'success' | 'warning'> = {
  draft: 'neutral',
  editing: 'warning',
  ready: 'accent',
  published: 'success',
};

export function ProjectsPage() {
  const services = useServices();
  const carousels = useCarousels();
  const brands = useBrandKits();
  const assets = useAssets();
  const accounts = useAccounts();
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<CarouselStatus | ''>('');
  /** null = every project; '' = carousels without a project. */
  const [place, setPlace] = useState<{ project: string | null; folder: string | null }>({ project: null, folder: null });
  const tree = useMemo(() => projectTree(carousels.data), [carousels.data]);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Carousel | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const winner = useMarkWinner();
  const created = (useLocation().state as { created?: number } | null)?.created;

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return carousels.data.filter(
      (carousel) =>
        (!search || carousel.title.toLowerCase().includes(search)) &&
        (!brandFilter || carousel.brandKitId === brandFilter) &&
        (!statusFilter || carousel.status === statusFilter) &&
        (place.project === null || carousel.project === place.project) &&
        (place.folder === null || carousel.folder === place.folder),
    );
  }, [carousels.data, query, brandFilter, statusFilter, place]);

  const remove = async (carousel: Carousel) => {
    if (!window.confirm(`Excluir "${carousel.title}"? Não dá pra desfazer.`)) return;
    try {
      await services.carousels.remove(carousel.id);
      carousels.setData((current) => current.filter((item) => item.id !== carousel.id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const contextOf = (carousel: Carousel): RenderContext | null => {
    const brand = brands.data.find((kit) => kit.id === carousel.brandKitId);
    return brand ? renderContextFor(carousel, brand, assets.data, services.assets, accounts.data) : null;
  };

  const exportFiltered = async () => {
    const oldestFirst = [...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const items = oldestFirst.flatMap((carousel) => {
      const context = contextOf(carousel);
      return context ? [{ context, carousel }] : [];
    });
    setError(null);
    setExporting({ done: 0, total: 1 });
    try {
      const { exportMany } = await import('../app/exportCarousel');
      await exportMany(items, 'png', (done, total) => setExporting({ done, total }), [place.project, place.folder].filter(Boolean).join(' ') || undefined);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setExporting(null);
    }
  };

  if (carousels.loading || brands.loading) return <Spinner />;
  const previewContext = previewing ? contextOf(previewing) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Projetos"
        description="Seus carrosséis, organizados por projeto e pasta."
        action={
          filtered.length > 0 && (
            <Button variant="secondary" loading={exporting !== null} onClick={() => void exportFiltered()}>
              {!exporting && <Download className="size-4" aria-hidden />}
              {exporting ? `Gerando ${exporting.done}/${exporting.total} slides` : `Baixar ${filtered.length} em ZIP`}
            </Button>
          )
        }
      />
      {created && created > 1 && (
        <div className="mb-6">
          <Alert tone="success">{created} carrosséis criados. Use "Baixar em ZIP" pra levar todos de uma vez, cada um na sua pasta com a legenda.</Alert>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input aria-label="Buscar por título" placeholder="Buscar por título…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Filtrar por marca" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
          <option value="">Todas as marcas</option>
          {brands.data.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrar por status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CarouselStatus | '')}>
          <option value="">Todos os status</option>
          {CAROUSEL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      {(error ?? carousels.error) && <div className="mb-4"><Alert>{error ?? carousels.error}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Projetos e pastas" className="flex flex-col gap-1 lg:sticky lg:top-8 lg:self-start">
        <PlaceButton active={place.project === null} onClick={() => setPlace({ project: null, folder: null })} icon={FolderOpen} label="Todos" count={carousels.data.length} />
        {tree.map((node) => (
          <div key={node.project || '__none__'} className="flex flex-col gap-0.5">
            <PlaceButton
              active={place.project === node.project && place.folder === null}
              onClick={() => setPlace({ project: node.project, folder: null })}
              icon={Folder}
              label={node.project || 'Sem projeto'}
              count={node.count}
            />
            {place.project === node.project &&
              node.folders.map((folder) => (
                <PlaceButton
                  key={folder.name || '__root__'}
                  active={place.folder === folder.name}
                  onClick={() => setPlace({ project: node.project, folder: folder.name })}
                  label={folder.name || 'Sem pasta'}
                  count={folder.count}
                  nested
                />
              ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0">
      {filtered.length === 0 ? (
        <EmptyState
          title={carousels.data.length === 0 ? 'Nenhum carrossel ainda' : 'Nada com esses filtros'}
          description={carousels.data.length === 0 ? 'Cola uma copy na tela Criar e o primeiro aparece aqui.' : 'Tenta outra busca ou limpa os filtros.'}
          action={carousels.data.length === 0 ? <Link to="/criar" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Criar o primeiro</Link> : undefined}
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((carousel) => {
            const brand = brands.data.find((kit) => kit.id === carousel.brandKitId);
            return (
              <li key={carousel.id} className="group relative overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-md">
                <Link to={`/carrossel/${carousel.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                  {brand && <CarouselCover carousel={carousel} brand={brand} assets={assets.data} accounts={accounts.data} />}
                  <div className="p-4">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{carousel.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {brand?.name ?? 'Marca removida'} · {carousel.slides.length} slides · {new Date(carousel.updatedAt).toLocaleDateString('pt-BR')}
                    </p>
                    {(carousel.project || carousel.folder) && <p className="mt-1 truncate text-xs text-faint">{[carousel.project, carousel.folder].filter(Boolean).join(' / ')}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS_TONE[carousel.status]}>{STATUS_LABELS[carousel.status]}</Badge>
                      {winner.isWinner(carousel) && <Badge tone="warning">⭐ Vencedor</Badge>}
                      {carousel.scheduledFor && (
                        <Badge>
                          <CalendarDays className="mr-1 size-3" aria-hidden />
                          {formatDay(carousel.scheduledFor)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="absolute right-3 top-3 flex gap-1.5 opacity-100 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!winner.ready}
                    aria-label={winner.isWinner(carousel) ? `Ver ${carousel.title} nos vencedores` : `Marcar ${carousel.title} como vencedor`}
                    title={winner.isWinner(carousel) ? 'Vencedor' : 'Marcar como vencedor'}
                    onClick={() => winner.mark(carousel)}
                  >
                    <Star className={winner.isWinner(carousel) ? 'size-3.5 fill-amber-400 text-amber-500' : 'size-3.5'} aria-hidden />
                  </Button>
                  <Button variant="secondary" size="sm" aria-label={`Ver prévia de ${carousel.title}`} onClick={() => setPreviewing(carousel)}>
                    <Eye className="size-3.5" aria-hidden />
                  </Button>
                  <Button variant="secondary" size="sm" aria-label={`Excluir ${carousel.title}`} onClick={() => void remove(carousel)}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
      </div>

      {winner.dialog}
      {previewing && previewContext && <CarouselViewer open onClose={() => setPreviewing(null)} context={previewContext} carousel={previewing} />}
    </div>
  );
}

interface ProjectNode {
  project: string;
  count: number;
  folders: { name: string; count: number }[];
}

/** Projects with their folders and counts; carousels without a project come last. */
function projectTree(carousels: Carousel[]): ProjectNode[] {
  const projects = new Map<string, Map<string, number>>();
  for (const carousel of carousels) {
    const folders = projects.get(carousel.project) ?? new Map<string, number>();
    folders.set(carousel.folder, (folders.get(carousel.folder) ?? 0) + 1);
    projects.set(carousel.project, folders);
  }
  return [...projects.entries()]
    .map(([project, folders]) => ({
      project,
      count: [...folders.values()].reduce((sum, count) => sum + count, 0),
      folders: [...folders.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => (a.project ? 0 : 1) - (b.project ? 0 : 1) || a.project.localeCompare(b.project));
}

interface PlaceButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: typeof Folder;
  nested?: boolean;
}

function PlaceButton({ active, onClick, label, count, icon: Icon, nested = false }: PlaceButtonProps) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        nested && 'ml-5 py-1.5 text-[13px]',
        active ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-subtle hover:text-ink',
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs text-faint">{count}</span>
    </button>
  );
}
