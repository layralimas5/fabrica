import { useCallback, useState, type ReactNode } from 'react';
import { useAccounts, useBrandKits, useContentRecords } from '../app/data';
import { brandForCarousel, productOf } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import { existingRecordFor } from '../domain/winners/fromCarousel';
import type { ContentRecord } from '../domain/winners/record';
import { MetricsDialog } from './MetricsDialog';

type Target = { kind: 'carousel'; carousel: Carousel } | { kind: 'record'; record: ContentRecord };

/** "Adicionar métricas" from any screen that shows a carousel, or a content made elsewhere. */
export function useAddMetrics(onSaved?: (record: ContentRecord, carousel: Carousel | null) => void) {
  const records = useContentRecords();
  const accounts = useAccounts();
  const brands = useBrandKits();
  const [target, setTarget] = useState<Target | null>(null);

  const recordOf = useCallback((item: Carousel) => existingRecordFor(item, records.data), [records.data]);

  const open = useCallback((carousel: Carousel) => setTarget({ kind: 'carousel', carousel }), []);
  const openRecord = useCallback((record: ContentRecord) => setTarget({ kind: 'record', record }), []);

  let dialog: ReactNode = null;
  if (target) {
    const carousel = target.kind === 'carousel' ? target.carousel : null;
    const brand = carousel ? brandForCarousel(carousel, brands.data, accounts.data) : null;
    dialog = (
      <MetricsDialog
        carousel={carousel}
        existing={carousel ? recordOf(carousel) : target.kind === 'record' ? (records.data.find((item) => item.id === target.record.id) ?? target.record) : null}
        account={accounts.data.find((item) => item.id === (carousel?.source.accountId ?? (target.kind === 'record' ? target.record.accountId : null))) ?? null}
        productName={brand ? (productOf(brand)?.name ?? null) : null}
        onClose={() => setTarget(null)}
        onSaved={(saved) => {
          records.setData((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          onSaved?.(saved, carousel);
          setTarget(null);
        }}
      />
    );
  }

  return { open, openRecord, recordOf, dialog, ready: !records.loading && !accounts.loading && !brands.loading };
}
