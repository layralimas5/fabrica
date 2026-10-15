import { Link } from 'react-router-dom';
import type { DashItem } from '../domain/dashboard/items';
import { linksOfContent, resultsByLink, shortLink, TRACKING_EVENT_LABELS, type TrackingEvent, type TrackingLink } from '../domain/tracking/tracking';
import { CopyField } from './CopyField';

/** Links made for a content and what each one brought (last known origin), inside the content detail. */
export function ContentConversions({ item, links, events, shortLinkBase }: { item: DashItem; links: TrackingLink[]; events: TrackingEvent[]; shortLinkBase: string }) {
  const own = linksOfContent(links, item);
  const results = resultsByLink(events, own, 'last');
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Links rastreáveis e conversões</h3>
      {own.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum link rastreável desse conteúdo. Sem link, as visitas e cadastros não podem ser atribuídos a ele.{' '}
          <Link to="/conversoes" className="font-medium text-accent underline-offset-4 hover:underline">
            Gerar link
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {results.map(({ link, counts }) => (
            <li key={link.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <CopyField label={`${link.utm.source}${link.label ? ` · ${link.label}` : ''}`} value={shortLink(shortLinkBase, link.slug)} />
              <dl className="grid grid-cols-3 gap-2 text-xs">
                {(['click', 'lp_view', 'quiz_complete', 'signup', 'trial_start', 'subscription'] as const).map((name) => (
                  <div key={name}>
                    <dt className="text-faint">{TRACKING_EVENT_LABELS[name]}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-ink">{counts[name]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
          <li className="text-[11px] text-faint">Atribuição pela última origem conhecida, no período inteiro de eventos guardados (até 200 dias).</li>
        </ul>
      )}
    </section>
  );
}
