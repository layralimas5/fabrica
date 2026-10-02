import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-canvas hover:bg-ink/85 shadow-sm',
  secondary: 'border border-line bg-surface text-ink hover:bg-subtle',
  ghost: 'text-muted hover:bg-subtle hover:text-ink',
  danger: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-10 px-3.5 text-sm gap-2',
  lg: 'h-12 px-5 text-[15px] gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'secondary', size = 'md', loading = false, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export const controlClass =
  'w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(controlClass, 'h-10', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(controlClass, 'resize-y leading-relaxed', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(controlClass, 'h-10 cursor-pointer pr-8', props.className)} />;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-faint">{hint}</p>}
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'success'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-xl px-3.5 py-2.5 text-sm',
        tone === 'error' && 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200',
        tone === 'info' && 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
        tone === 'success' && 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
      )}
    >
      {children}
    </div>
  );
}

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

interface DialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

export function Dialog({ title, open, onClose, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={title}
      className={clsx(
        'm-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-3xl',
        size === 'xl' && 'max-w-6xl',
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-32px)] flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            <Button variant="ghost" size="sm" aria-label="Fechar" onClick={onClose}>
              <X className="size-4" aria-hidden />
            </Button>
          </header>
          <div className="overflow-y-auto p-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'neutral' && 'bg-subtle text-muted',
        tone === 'accent' && 'bg-accent/12 text-accent',
        tone === 'success' && 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
        tone === 'warning' && 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
      )}
    >
      {children}
    </span>
  );
}
