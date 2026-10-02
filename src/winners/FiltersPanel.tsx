import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CONTENT_TYPE_LABELS, CONTENT_TYPES, OBJECTIVE_LABELS, OBJECTIVES } from '../domain/content';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  PERIOD_LABELS,
  PERIODS,
  PRODUCT_FILTER_LABELS,
  PRODUCT_FILTERS,
  SORT_GROUPS,
  SORT_LABELS,
  type SortOption,
  type WinnerFilters,
} from '../domain/winners/filters';
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_FORMATS,
  CONTENT_PLATFORM_LABELS,
  CONTENT_PLATFORMS,
  HOOK_TYPE_LABELS,
  HOOK_TYPES,
  PILLAR_LABELS,
  PILLARS,
  WINNER_TYPE_INFO,
  WINNER_TYPES,
} from '../domain/winners/record';
import { Button, Field, Input, Select } from '../ui/primitives';
import { Chip, ChipGroup, RemovableChip } from './chips';

interface FiltersPanelProps {
  filters: WinnerFilters;
  onChange: (filters: WinnerFilters) => void;
  accountOptions: { key: string; label: string }[];
  themeOptions: string[];
  sort?: SortOption;
  onSort?: (sort: SortOption) => void;
  /** Hidden on the analysis page, where everything measured counts. */
  showHighlights?: boolean;
}

export function FiltersPanel({ filters, onChange, accountOptions, themeOptions, sort, onSort, showHighlights = true }: FiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const count = activeFilterCount(filters);
  const set = (patch: Partial<WinnerFilters>) => onChange({ ...filters, ...patch });
  const accountLabel = (key: string) => accountOptions.find((option) => option.key === key)?.label ?? key;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            type="search"
            aria-label="Buscar por título, gancho, tema, copy ou estrutura"
            placeholder="Buscar: disciplina, confronto, POV…"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            className="pl-9"
          />
        </div>
        {sort && onSort && (
          <Select aria-label="Ordenar por" value={sort} onChange={(e) => onSort(e.target.value as SortOption)} className="!w-auto min-w-0 flex-1 basis-48 sm:flex-none">
            {SORT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option} value={option}>
                    {SORT_LABELS[option]}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
        <Button variant={open || count > 0 ? 'primary' : 'secondary'} aria-expanded={open} aria-controls="winner-filters" onClick={() => setOpen((current) => !current)}>
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros{count > 0 && <span className="tabular-nums">· {count}</span>}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="winner-filters"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-5 rounded-2xl border border-line bg-surface p-5 md:grid-cols-2">
              <ChipGroup label="Plataforma" options={CONTENT_PLATFORMS} labelOf={(item) => CONTENT_PLATFORM_LABELS[item]} selected={filters.platforms} onChange={(platforms) => set({ platforms })} />
              {accountOptions.length > 0 && (
                <ChipGroup label="Conta" options={accountOptions.map((option) => option.key)} labelOf={accountLabel} selected={filters.accounts} onChange={(accounts) => set({ accounts })} />
              )}
              <ChipGroup label="Formato" options={CONTENT_FORMATS} labelOf={(item) => CONTENT_FORMAT_LABELS[item]} selected={filters.formats} onChange={(formats) => set({ formats })} />
              <ChipGroup label="Tipo de gancho" options={HOOK_TYPES} labelOf={(item) => HOOK_TYPE_LABELS[item]} selected={filters.hookTypes} onChange={(hookTypes) => set({ hookTypes })} />
              <ChipGroup label="Objetivo" options={OBJECTIVES} labelOf={(item) => OBJECTIVE_LABELS[item]} selected={filters.objectives} onChange={(objectives) => set({ objectives })} />
              <ChipGroup
                label="Tipo de carrossel"
                options={CONTENT_TYPES.filter((type) => type !== 'auto') as Exclude<(typeof CONTENT_TYPES)[number], 'auto'>[]}
                labelOf={(item) => CONTENT_TYPE_LABELS[item]}
                selected={filters.contentTypes}
                onChange={(contentTypes) => set({ contentTypes })}
              />
              <ChipGroup label="Pilar" options={PILLARS} labelOf={(item) => PILLAR_LABELS[item]} selected={filters.pillars} onChange={(pillars) => set({ pillars })} />
              {themeOptions.length > 0 && <ChipGroup label="Tema" options={themeOptions} labelOf={(item) => item} selected={filters.themes} onChange={(themes) => set({ themes })} />}
              <ChipGroup label="Produto" options={PRODUCT_FILTERS} labelOf={(item) => PRODUCT_FILTER_LABELS[item]} selected={filters.products} onChange={(products) => set({ products })} />
              {showHighlights && (
                <ChipGroup
                  label="Tipo de vencedor"
                  options={WINNER_TYPES}
                  labelOf={(item) => `${WINNER_TYPE_INFO[item].emoji} ${WINNER_TYPE_INFO[item].short}`}
                  selected={filters.winnerTypes}
                  onChange={(winnerTypes) => set({ winnerTypes })}
                />
              )}
              <div className="flex flex-col gap-3">
                <ChipGroup label="Período" options={PERIODS} labelOf={(item) => PERIOD_LABELS[item]} selected={[filters.period]} onChange={(next) => set({ period: next[0] ?? 'all' })} single />
                {filters.period === 'custom' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="De" htmlFor="filter-from">
                      <Input id="filter-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
                    </Field>
                    <Field label="Até" htmlFor="filter-to">
                      <Input id="filter-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
                    </Field>
                  </div>
                )}
              </div>
              {showHighlights && (
                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-muted">Destaques</legend>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={filters.onlyFavorites} onClick={() => set({ onlyFavorites: !filters.onlyFavorites })}>
                      ♥ Favoritos
                    </Chip>
                    <Chip active={filters.onlyMainModels} onClick={() => set({ onlyMainModels: !filters.onlyMainModels })}>
                      🏆 Modelos principais
                    </Chip>
                  </div>
                </fieldset>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {count > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
          {filters.platforms.map((item) => (
            <Active key={item} onRemove={() => set({ platforms: filters.platforms.filter((value) => value !== item) })}>{CONTENT_PLATFORM_LABELS[item]}</Active>
          ))}
          {filters.accounts.map((item) => (
            <Active key={item} onRemove={() => set({ accounts: filters.accounts.filter((value) => value !== item) })}>{accountLabel(item)}</Active>
          ))}
          {filters.formats.map((item) => (
            <Active key={item} onRemove={() => set({ formats: filters.formats.filter((value) => value !== item) })}>{CONTENT_FORMAT_LABELS[item]}</Active>
          ))}
          {filters.hookTypes.map((item) => (
            <Active key={item} onRemove={() => set({ hookTypes: filters.hookTypes.filter((value) => value !== item) })}>{HOOK_TYPE_LABELS[item]}</Active>
          ))}
          {filters.objectives.map((item) => (
            <Active key={item} onRemove={() => set({ objectives: filters.objectives.filter((value) => value !== item) })}>{OBJECTIVE_LABELS[item]}</Active>
          ))}
          {filters.contentTypes.map((item) => (
            <Active key={item} onRemove={() => set({ contentTypes: filters.contentTypes.filter((value) => value !== item) })}>{CONTENT_TYPE_LABELS[item]}</Active>
          ))}
          {filters.pillars.map((item) => (
            <Active key={item} onRemove={() => set({ pillars: filters.pillars.filter((value) => value !== item) })}>{PILLAR_LABELS[item]}</Active>
          ))}
          {filters.themes.map((item) => (
            <Active key={item} onRemove={() => set({ themes: filters.themes.filter((value) => value !== item) })}>{item}</Active>
          ))}
          {filters.products.map((item) => (
            <Active key={item} onRemove={() => set({ products: filters.products.filter((value) => value !== item) })}>{PRODUCT_FILTER_LABELS[item]}</Active>
          ))}
          {filters.winnerTypes.map((item) => (
            <Active key={item} onRemove={() => set({ winnerTypes: filters.winnerTypes.filter((value) => value !== item) })}>
              {`${WINNER_TYPE_INFO[item].emoji} ${WINNER_TYPE_INFO[item].short}`}
            </Active>
          ))}
          {filters.period !== 'all' && <Active onRemove={() => set({ period: 'all', from: '', to: '' })}>{PERIOD_LABELS[filters.period]}</Active>}
          {filters.onlyFavorites && <Active onRemove={() => set({ onlyFavorites: false })}>Favoritos</Active>}
          {filters.onlyMainModels && <Active onRemove={() => set({ onlyMainModels: false })}>Modelos principais</Active>}
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}
            className={clsx('ml-1 rounded-md px-1.5 text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent')}
          >
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}

function Active({ children, onRemove }: { children: string; onRemove: () => void }): ReactNode {
  return <RemovableChip onRemove={onRemove}>{children}</RemovableChip>;
}
