import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderContextFor } from '../app/renderContextFor';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { winnerContext, type CreateHandoff } from '../application/winnerHandoff';
import { emptyRecordInput, toRecordInput, type ContentRecord, type ContentRecordInput } from '../domain/winners/record';
import type { RemixMode } from '../domain/winners/remix';
import { CarouselViewer } from '../ui/CarouselViewer';
import { RemixDialog } from './RemixDialog';
import type { CardAction } from './WinnerCard';
import type { WinnerLibrary } from './useWinnerLibrary';
import { WinnerFormDialog } from './WinnerFormDialog';

type OpenDialog =
  | { kind: 'form'; initial: ContentRecordInput; recordId: string | null; title?: string }
  | { kind: 'remix'; record: ContentRecord; mode: RemixMode }
  | { kind: 'viewer'; record: ContentRecord }
  | null;

const REMIX_ACTIONS: Partial<Record<CardAction, RemixMode>> = { model: 'model', variations: 'variations', family: 'family' };

/** Every action a winner offers (card menu or detail page), with the dialogs they open. */
export function useWinnerActions(library: WinnerLibrary) {
  const services = useServices();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [error, setError] = useState<string | null>(null);
  const { records, carousels, accounts, brands, assets } = library;

  const saveLocally = useCallback((saved: ContentRecord) => records.setData((current) => (current.some((item) => item.id === saved.id) ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current])), [records]);

  const patch = useCallback(
    async (record: ContentRecord, change: Partial<ContentRecordInput>) => {
      setError(null);
      try {
        saveLocally(await services.contentRecords.update(record.id, { ...toRecordInput(record), ...change }));
      } catch (cause) {
        setError(errorMessage(cause));
      }
    },
    [services.contentRecords, saveLocally],
  );

  const run = useCallback(
    (action: CardAction, record: ContentRecord) => {
      const remixMode = REMIX_ACTIONS[action];
      if (remixMode) return setDialog({ kind: 'remix', record, mode: remixMode });
      switch (action) {
        case 'view': {
          const hasCarousel = record.carouselId && carousels.data.some((item) => item.id === record.carouselId);
          return hasCarousel ? setDialog({ kind: 'viewer', record }) : navigate(`/vencedores/${record.id}?aba=metricas`);
        }
        case 'structure':
          return navigate(`/vencedores/${record.id}`);
        case 'edit':
          return setDialog({ kind: 'form', initial: toRecordInput(record), recordId: record.id });
        case 'favorite':
          return void patch(record, { favorite: !record.favorite });
        case 'mainModel':
          return void patch(record, { mainModel: !record.mainModel, winner: true });
        case 'unmark':
          if (window.confirm(`Tirar "${record.title}" dos vencedores? Os resultados continuam salvos e seguem contando na análise.`)) void patch(record, { winner: false, mainModel: false });
          return;
      }
    },
    [carousels.data, navigate, patch],
  );

  const addExternal = useCallback(() => setDialog({ kind: 'form', initial: { ...emptyRecordInput(), format: 'ugc', platform: 'tiktok' }, recordId: null, title: 'Adicionar conteúdo de fora' }), []);
  const openForm = useCallback((initial: ContentRecordInput, recordId: string | null, title?: string) => setDialog({ kind: 'form', initial, recordId, title }), []);

  const handoff = useCallback(
    (data: CreateHandoff) => {
      setDialog(null);
      navigate('/criar', { state: { handoff: data } });
    },
    [navigate],
  );

  const knownThemes = useMemo(() => [...new Set(records.data.map((item) => item.theme).filter(Boolean))], [records.data]);
  const close = () => setDialog(null);

  let dialogs: ReactNode = null;
  if (dialog?.kind === 'form') {
    dialogs = (
      <WinnerFormDialog
        open
        onClose={close}
        initial={dialog.initial}
        recordId={dialog.recordId}
        title={dialog.title}
        accounts={accounts.data}
        library={records.data}
        onSaved={(saved) => {
          saveLocally(saved);
          close();
        }}
      />
    );
  } else if (dialog?.kind === 'remix') {
    dialogs = (
      <RemixDialog
        open
        onClose={close}
        initialMode={dialog.mode}
        record={dialog.record}
        context={winnerContext(dialog.record, carousels.data, accounts.data, brands.data)}
        knownThemes={knownThemes}
        onHandoff={handoff}
      />
    );
  } else if (dialog?.kind === 'viewer') {
    const { carousel, brand } = winnerContext(dialog.record, carousels.data, accounts.data, brands.data);
    if (carousel && brand) dialogs = <CarouselViewer open onClose={close} context={renderContextFor(carousel, brand, assets.data, services.assets, accounts.data)} carousel={carousel} />;
  }

  return { run, patch, addExternal, openForm, dialogs, error };
}
