import clsx from 'clsx';
import { Check, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { isPosted, type Carousel } from '../domain/carousel';

interface PostedToggleProps {
  carousel: Carousel;
  /** Saves the new state; the button shows a pending state until it resolves. */
  onChange: (posted: boolean) => Promise<void>;
  className?: string;
}

/** One carousel at a time: "Marcar como postado", and click again to undo. */
export function PostedToggle({ carousel, onChange, className }: PostedToggleProps) {
  const [pending, setPending] = useState(false);
  const posted = isPosted(carousel);

  const toggle = async () => {
    setPending(true);
    try {
      await onChange(!posted);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      aria-pressed={posted}
      disabled={pending}
      onClick={() => void toggle()}
      title={posted ? 'Postado. Clique pra desfazer.' : undefined}
      className={clsx(
        'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas disabled:opacity-60',
        posted
          ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-300'
          : 'border border-line bg-surface text-ink hover:bg-subtle',
        className,
      )}
    >
      {posted ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
      {posted ? 'Postado' : 'Marcar como postado'}
    </button>
  );
}
