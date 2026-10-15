import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/primitives';
import { copyText } from './useTracking';

/** Read-only value with a copy button that says when it copied (or that the browser blocked it). */
export function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'blocked'>('idle');
  const copy = async () => {
    setState((await copyText(value)) ? 'copied' : 'blocked');
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex min-w-0 items-start gap-2">
        {multiline ? (
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-line bg-subtle px-3 py-2 text-[11px] leading-relaxed text-ink">{value}</pre>
        ) : (
          <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-subtle px-3 py-2 text-xs text-ink" title={value}>
            {value}
          </code>
        )}
        <Button variant="secondary" size="sm" onClick={() => void copy()} aria-label={`Copiar ${label}`} className="mt-0.5">
          {state === 'copied' ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {state === 'copied' ? 'Copiado' : state === 'blocked' ? 'Copie à mão' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}
