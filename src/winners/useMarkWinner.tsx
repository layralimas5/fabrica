import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccounts, useBrandKits, useContentRecords } from '../app/data';
import { productOf } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import { existingRecordFor, recordFromCarousel } from '../domain/winners/fromCarousel';
import { toRecordInput, type ContentRecordInput } from '../domain/winners/record';
import { WinnerFormDialog } from './WinnerFormDialog';

/** "⭐ Marcar como vencedor" from any screen that shows a carousel. */
/** @param onWinner runs when a carousel is saved as a winner, so its status can follow. */
export function useMarkWinner(onWinner?: (carousel: Carousel) => void) {
  const records = useContentRecords();
  const accounts = useAccounts();
  const brands = useBrandKits();
  const navigate = useNavigate();
  const [open, setOpen] = useState<{ initial: ContentRecordInput; recordId: string | null; carousel: Carousel } | null>(null);

  const recordOf = useCallback((carousel: Carousel) => existingRecordFor(carousel, records.data), [records.data]);

  const mark = useCallback(
    (carousel: Carousel) => {
      const existing = recordOf(carousel);
      if (existing?.winner) return navigate(`/vencedores/${existing.id}`);
      if (existing) return setOpen({ initial: { ...toRecordInput(existing), winner: true }, recordId: existing.id, carousel });
      const account = accounts.data.find((item) => item.id === carousel.source.accountId) ?? null;
      const brand = brands.data.find((kit) => kit.id === carousel.brandKitId);
      setOpen({ initial: recordFromCarousel(carousel, account, brand ? (productOf(brand)?.name ?? null) : null), recordId: null, carousel });
    },
    [recordOf, accounts.data, brands.data, navigate],
  );

  const isWinner = useCallback((carousel: Carousel) => Boolean(recordOf(carousel)?.winner), [recordOf]);

  const dialog: ReactNode = open && (
    <WinnerFormDialog
      open
      onClose={() => setOpen(null)}
      initial={open.initial}
      recordId={open.recordId}
      accounts={accounts.data}
      library={records.data}
      onSaved={(saved) => {
        records.setData((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
        setOpen(null);
        if (saved.winner) {
          onWinner?.(open.carousel);
          navigate(`/vencedores/${saved.id}`);
        }
      }}
    />
  );

  return { mark, isWinner, dialog, ready: !records.loading && !accounts.loading && !brands.loading };
}
