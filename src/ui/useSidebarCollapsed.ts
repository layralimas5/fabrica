import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'fabrica.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function storeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // A per-browser convenience: the sidebar simply opens expanded next time.
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Desktop sidebar collapsed to icons, remembered per browser and toggled with Ctrl/⌘ + B. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);

  useEffect(() => storeCollapsed(collapsed), [collapsed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'b' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (isEditable(event.target)) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return { collapsed, toggle };
}
