import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { thumbnailUrlOf } from '../app/imageCache';
import { useServices } from '../app/services';
import type { Asset } from '../domain/asset';

export function AssetThumb({ asset, className }: { asset: Asset; className?: string }) {
  const { assets } = useServices();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    thumbnailUrlOf(assets, asset)
      .then((value) => active && setUrl(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [assets, asset]);

  return (
    <div className={clsx('overflow-hidden bg-subtle', className)}>
      {url && <img src={url} alt={asset.name} loading="lazy" decoding="async" className="size-full object-cover" />}
      {failed && <span className="grid size-full place-items-center p-2 text-center text-[11px] text-muted">Indisponível</span>}
    </div>
  );
}
