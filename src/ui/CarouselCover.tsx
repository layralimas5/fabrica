import { useMemo } from 'react';
import { renderContextFor } from '../app/renderContextFor';
import { useServices } from '../app/services';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import { SlideCanvas } from './SlideCanvas';

interface CarouselCoverProps {
  carousel: Carousel;
  brand: BrandKit;
  assets: Asset[];
  accounts: Account[];
  scale?: number;
  className?: string;
}

/** First slide of a carousel as a thumbnail, cropped to the 4:5 grid. */
export function CarouselCover({ carousel, brand, assets, accounts, scale = 0.3, className = '!aspect-[4/5]' }: CarouselCoverProps) {
  const { assets: repo } = useServices();
  const context = useMemo(() => renderContextFor(carousel, brand, assets, repo, accounts), [carousel, brand, assets, repo, accounts]);
  return <SlideCanvas context={context} slide={carousel.slides[0]} index={0} scale={scale} label={`Capa de ${carousel.title}`} className={className} />;
}
