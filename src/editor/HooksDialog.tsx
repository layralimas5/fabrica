import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { brandContext } from '../application/generateCarousel';
import type { BrandKit } from '../domain/brandKit';
import { Alert, Button, Dialog, Spinner } from '../ui/primitives';

const HOOK_COUNT = 5;

interface HooksDialogProps {
  open: boolean;
  hook: string;
  copy: string;
  brand: BrandKit;
  onPick: (hook: string) => void;
  onClose: () => void;
}

export function HooksDialog({ open, hook, copy, brand, onPick, onClose }: HooksDialogProps) {
  const { ai } = useServices();
  const [hooks, setHooks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHooks(await ai.generateHooks({ hook, copy, brand: brandContext(brand), count: HOOK_COUNT }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [ai, hook, copy, brand]);

  useEffect(() => {
    if (open) void load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog
      title="Novos ganchos para o slide 1"
      open={open}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={() => void load()} loading={loading}>
          {!loading && <RefreshCw className="size-4" aria-hidden />} Gerar outros
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Atual: <span className="text-ink">{hook}</span>
      </p>
      {error && <Alert>{error}</Alert>}
      {loading && hooks.length === 0 ? (
        <Spinner label="Escrevendo ganchos" />
      ) : (
        <ul className="flex flex-col gap-2">
          {hooks.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => onPick(option)}
                className="w-full rounded-xl border border-line px-4 py-3 text-left text-[15px] font-medium text-ink transition-colors hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
