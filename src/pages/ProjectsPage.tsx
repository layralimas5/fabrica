import { Download, Eye, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { renderContextFor } from '../app/renderContextFor';
import { useAssets, useBrandKits, useCarousels } from '../app/data';
import { useServices } from '../app/services';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import { CAROUSEL_STATUSES, STATUS_LABELS, type Carousel, type CarouselStatus } from '../domain/carousel';
import { Alert, Badge, Button, EmptyState, Input, PageHeader, Select, Spinner } from '../ui/primitives';
import { CarouselViewer } from '../ui/CarouselViewer';
import { SlideCanvas } from '../ui/SlideCanvas';

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
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<CarouselStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Carousel | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const created = (useLocation().state as { created?: number } | null)?.created;

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return carousels.data.filter(
      (carousel) =>
        (!search || carousel.title.toLowerCase().includes(search)) &&
        (!brandFilter || carousel.brandKitId === brandFilter) &&
        (!statusFilter || carousel.status === statusFilter),
    );
  }, [carousels.data, query, brandFilter, statusFilter]);

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
    return brand ? renderContextFor(carousel, brand, assets.data, services.assets) : null;
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
      await exportMany(items, 'png', (done, total) => setExporting({ done, total }));
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
        description="Todos os carrosséis que você já gerou."
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
                  {brand && <CoverPreview carousel={carousel} brand={brand} assets={assets.data} />}
                  <div className="p-4">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{carousel.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {brand?.name ?? 'Marca removida'} · {carousel.slides.length} slides · {new Date(carousel.updatedAt).toLocaleDateString('pt-BR')}
                    </p>
                    <div className="mt-3">
                      <Badge tone={STATUS_TONE[carousel.status]}>{STATUS_LABELS[carousel.status]}</Badge>
                    </div>
                  </div>
                </Link>
                <div className="absolute right-3 top-3 flex gap-1.5 opacity-100 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
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

      {previewing && previewContext && <CarouselViewer open onClose={() => setPreviewing(null)} context={previewContext} carousel={previewing} />}
    </div>
  );
}

function CoverPreview({ carousel, brand, assets }: { carousel: Carousel; brand: BrandKit; assets: Asset[] }) {
  const { assets: repo } = useServices();
  const context = useMemo(() => renderContextFor(carousel, brand, assets, repo), [carousel, brand, assets, repo]);
  return <SlideCanvas context={context} slide={carousel.slides[0]} index={0} scale={0.3} label={`Capa de ${carousel.title}`} className="!aspect-[4/5]" />;
}
