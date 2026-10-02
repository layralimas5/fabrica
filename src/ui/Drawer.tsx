import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './primitives';

interface DrawerProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Side panel over the page (native <dialog>: focus trap, Esc and backdrop for free). Full width on phones. */
export function Drawer({ title, open, onClose, children, footer }: DrawerProps) {
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
      onClick={(event) => event.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-md border-l border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30 sm:w-[28rem]"
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="min-w-0 truncate text-base font-semibold tracking-tight">{title}</h2>
            <Button variant="ghost" size="sm" aria-label="Fechar" onClick={onClose}>
              <X className="size-4" aria-hidden />
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
