import { Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAssets, useBrandKits, useCarousels } from '../app/data';
import { useServices } from '../app/services';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import { CAROUSEL_STATUSES, STATUS_LABELS, type Carousel, type CarouselStatus } from '../domain/carousel';
import { Alert, Badge, Button, EmptyState, Input, PageHeader, Select, Spinner } from '../ui/primitives';
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

  if (carousels.loading || brands.loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Projetos" description="Todos os carrosséis que você já gerou." />

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
                <Button variant="secondary" size="sm" aria-label={`Excluir ${carousel.title}`} className="absolute right-3 top-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" onClick={() => void remove(carousel)}>
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CoverPreview({ carousel, brand, assets }: { carousel: Carousel; brand: BrandKit; assets: Asset[] }) {
  const { assets: repo } = useServices();
  const context: RenderContext = useMemo(
    () => ({ brand, assets, repo, format: carousel.format, visualStyle: carousel.source.visualStyle, total: carousel.slides.length }),
    [brand, assets, repo, carousel.format, carousel.source.visualStyle, carousel.slides.length],
  );
  return <SlideCanvas context={context} slide={carousel.slides[0]} index={0} scale={0.3} label={`Capa de ${carousel.title}`} className="!aspect-[4/5]" />;
}
