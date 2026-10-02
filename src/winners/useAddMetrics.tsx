import { useCallback, useState, type ReactNode } from 'react';
import { useAccounts, useBrandKits, useContentRecords } from '../app/data';
import { brandForCarousel, productOf } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import { existingRecordFor } from '../domain/winners/fromCarousel';
import type { ContentRecord } from '../domain/winners/record';
import { MetricsDialog } from './MetricsDialog';

/** "Adicionar métricas" from any screen that shows a carousel. */
export function useAddMetrics(onSaved?: (record: ContentRecord, carousel: Carousel) => void) {
  const records = useContentRecords();
  const accounts = useAccounts();
  const brands = useBrandKits();
  const [carousel, setCarousel] = useState<Carousel | null>(null);

  const recordOf = useCallback((item: Carousel) => existingRecordFor(item, records.data), [records.data]);

  let dialog: ReactNode = null;
  if (carousel) {
    const brand = brandForCarousel(carousel, brands.data, accounts.data);
    dialog = (
      <MetricsDialog
        carousel={carousel}
        existing={recordOf(carousel)}
        account={accounts.data.find((item) => item.id === carousel.source.accountId) ?? null}
        productName={brand ? (productOf(brand)?.name ?? null) : null}
        onClose={() => setCarousel(null)}
        onSaved={(saved) => {
          records.setData((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          onSaved?.(saved, carousel);
          setCarousel(null);
        }}
      />
    );
  }

  return { open: setCarousel, recordOf, dialog, ready: !records.loading && !accounts.loading && !brands.loading };
}
