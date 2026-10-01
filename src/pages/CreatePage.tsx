import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAssets, useBrandKits } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { generateCarousel } from '../application/generateCarousel';
import { MOMENTUMM_STARTER, VISUAL_STYLE_LABELS, VISUAL_STYLES, type VisualStyle } from '../domain/brandKit';
import {
  CONTENT_TYPE_LABELS,
  CONTENT_TYPES,
  OBJECTIVE_LABELS,
  OBJECTIVES,
  SLIDE_COUNT_OPTIONS,
  type ContentType,
  type Objective,
  type SlideCountOption,
} from '../domain/content';
import { Alert, Button, Field, Select, Spinner, Textarea } from '../ui/primitives';

const STEPS = ['Analisando a copy', 'Encontrando o gancho', 'Estruturando os slides', 'Escolhendo imagens da biblioteca', 'Montando o design'];
const MIN_COPY_LENGTH = 20;

export function CreatePage() {
  const services = useServices();
  const navigate = useNavigate();
  const brands = useBrandKits();
  const assets = useAssets();

  const [copy, setCopy] = useState('');
  const [brandId, setBrandId] = useState('');
  const [contentType, setContentType] = useState<ContentType>('auto');
  const [slideCount, setSlideCount] = useState<SlideCountOption>('auto');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('minimalista');
  const [objective, setObjective] = useState<Objective>('engajamento');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingStarter, setCreatingStarter] = useState(false);

  const brand = brands.data.find((kit) => kit.id === brandId) ?? brands.data[0];

  useEffect(() => {
    if (brand) {
      setBrandId(brand.id);
      setVisualStyle(brand.visualStyle);
    }
  }, [brand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const createStarterBrand = async () => {
    setCreatingStarter(true);
    try {
      const created = await services.brandKits.create(MOMENTUMM_STARTER);
      brands.setData((current) => [...current, created]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreatingStarter(false);
    }
  };

  const generate = async () => {
    if (!brand) return;
    setGenerating(true);
    setError(null);
    try {
      const carousel = await generateCarousel(services, brand, { copy: copy.trim(), contentType, objective, visualStyle, slideCount }, assets.data);
      navigate(`/carrossel/${carousel.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setGenerating(false);
    }
  };

  if (brands.loading) return <Spinner />;

  const tooShort = copy.trim().length < MIN_COPY_LENGTH;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 text-center sm:mb-10">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Cole sua copy. Receba o carrossel pronto.</h1>
        <p className="mt-3 text-pretty text-sm text-muted sm:text-base">A IA estrutura os slides, escolhe imagens da sua biblioteca e monta o design no estilo da marca.</p>
      </header>

      {brands.error && <Alert>{brands.error}</Alert>}

      {brands.data.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-ink">Primeiro, uma marca</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Todo carrossel segue um Brand Kit: cores, fontes e estilo. Começa com o do Momentumm ou cria o seu.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" loading={creatingStarter} onClick={() => void createStarterBrand()}>
              Usar o kit Momentumm
            </Button>
            <Link to="/marcas" className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Criar do zero
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-line bg-surface p-2 shadow-sm">
          <label htmlFor="copy" className="sr-only">
            Copy ou ideia
          </label>
          <Textarea
            id="copy"
            value={copy}
            onChange={(event) => setCopy(event.target.value)}
            placeholder="Cole sua copy ou ideia aqui…"
            rows={10}
            className="min-h-56 border-0 bg-transparent px-4 py-4 text-base focus-visible:ring-0"
            disabled={generating}
          />

          <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Marca" htmlFor="brand">
              <Select id="brand" value={brand?.id} onChange={(e) => setBrandId(e.target.value)} disabled={generating}>
                {brands.data.map((kit) => (
                  <option key={kit.id} value={kit.id}>
                    {kit.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de carrossel" htmlFor="type">
              <Select id="type" value={contentType} onChange={(e) => setContentType(e.target.value as ContentType)} disabled={generating}>
                {CONTENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CONTENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Slides" htmlFor="count">
              <Select id="count" value={String(slideCount)} onChange={(e) => setSlideCount(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as SlideCountOption))} disabled={generating}>
                {SLIDE_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={String(count)}>
                    {count === 'auto' ? 'Automático' : count}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estilo visual" htmlFor="style">
              <Select id="style" value={visualStyle} onChange={(e) => setVisualStyle(e.target.value as VisualStyle)} disabled={generating}>
                {VISUAL_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {VISUAL_STYLE_LABELS[style]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Objetivo" htmlFor="objective">
              <Select id="objective" value={objective} onChange={(e) => setObjective(e.target.value as Objective)} disabled={generating}>
                {OBJECTIVES.map((item) => (
                  <option key={item} value={item}>
                    {OBJECTIVE_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-col gap-3 p-4 pt-0 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-faint">
              {assets.data.length > 0 ? `${assets.data.length} imagens na biblioteca` : 'Sem imagens na biblioteca: o carrossel sai só com texto.'}
              {services.ai.engine === 'heuristic' && ' · IA local (sem Claude)'}
            </p>
            <Button variant="primary" size="lg" disabled={tooShort} loading={generating} onClick={() => void generate()}>
              {!generating && <Sparkles className="size-4" aria-hidden />}
              Gerar carrossel
              {!generating && <ArrowRight className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 min-h-12">
        {error && <Alert>{error}</Alert>}
        <AnimatePresence>{generating && <GenerationSteps />}</AnimatePresence>
      </div>
    </div>
  );
}

function GenerationSteps() {
  const [step, setStep] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.ol
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs"
      aria-live="polite"
    >
      {STEPS.map((label, index) => (
        <li key={label} className={index <= step ? 'text-ink' : 'text-faint'}>
          {index < step ? '✓ ' : index === step ? '• ' : ''}
          {label}
        </li>
      ))}
    </motion.ol>
  );
}
