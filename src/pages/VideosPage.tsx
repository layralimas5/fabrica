import { CalendarPlus, Clapperboard, Download, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { useAssets, useBrandKits } from '../app/data';
import { slugify } from '../app/exportCarousel';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { videoTools } from '../app/videoTools';
import { accountLabel } from '../domain/account';
import { sanitizeEntryInput } from '../domain/calendar/calendar';
import { todayIso } from '../domain/schedule';
import { defaultLook, type VideoLook } from '../domain/video/look';
import { MAX_SCRIPT_LENGTH } from '../domain/video/videoScript';
import { Alert, Button, Field, PageHeader, Select, Spinner, Textarea } from '../ui/primitives';
import { ScenePicker } from '../videos/ScenePicker';
import type { PictureSource } from '../videos/scenePictures';
import { stageLabel, useVideoMaker, type MusicChoice, type VideoResult } from '../videos/useVideoMaker';
import { LookPanel, MusicPanel, Section, VoicePanel } from '../videos/VideoSettingsPanels';
import { VideoPreview } from '../videos/VideoPreview';

const EXAMPLE = `Você não precisa de mais disciplina.

Você precisa de menos metas ao mesmo tempo.

Escolhe uma só pra essa semana e protege ela como se fosse a única.

Comenta "uma" que eu te mando o meu método.`;

function download(result: VideoResult, title: string) {
  const link = document.createElement('a');
  link.href = result.url;
  link.download = `${slugify(title) || 'video'}.mp4`;
  link.click();
}

export function VideosPage() {
  const services = useServices();
  const scope = useAccountScope();
  const brands = useBrandKits();
  const assets = useAssets();
  const { speech } = videoTools();

  const [accountId, setAccountId] = useState<string | null>(scope.current?.id ?? null);
  const account = scope.accounts.find((item) => item.id === accountId) ?? null;
  const brand = brands.data.find((kit) => kit.id === account?.brandKitId) ?? brands.data[0] ?? null;

  const [script, setScript] = useState('');
  const [pictures, setPictures] = useState<(PictureSource | null)[]>([]);
  const [fallbackPicture, setFallbackPicture] = useState<PictureSource | null>(null);
  const [voiceId, setVoiceId] = useState(speech.voices[0].id);
  const [speed, setSpeed] = useState(1);
  const [look, setLook] = useState<VideoLook>(() => defaultLook(null));
  const [music, setMusic] = useState<MusicChoice | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId && scope.current) setAccountId(scope.current.id);
  }, [accountId, scope.current]);

  // The brand of the account sets colors and font; the caption choices and the hook stay.
  useEffect(() => {
    setLook((current) => {
      const base = defaultLook(brand);
      return { ...current, font: base.font, accent: base.accent, background: base.background, uppercase: base.uppercase };
    });
  }, [brand]);

  const settings = useMemo(() => ({ script, pictures, fallbackPicture, voiceId, speed, look, music }), [script, pictures, fallbackPicture, voiceId, speed, look, music]);
  const maker = useVideoMaker(settings);
  const { scenes, status } = maker;
  const working = status.kind === 'working';
  const title = look.headline.trim() || scenes[0]?.sentences[0]?.text || 'Vídeo';

  const setPicture = (index: number, value: PictureSource | null) =>
    setPictures((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });

  const addToCalendar = async (result: VideoResult) => {
    setSaving(true);
    try {
      await services.calendarEntries.create(
        sanitizeEntryInput({
          accountId,
          platform: account?.platform ?? 'instagram',
          kind: 'reels',
          title,
          date: todayIso(),
          status: 'pronto',
          notes: `Vídeo narrado de ${Math.round(result.duration)}s feito na Fábrica.\n\n${script}`,
        }),
      );
      setNotice({ tone: 'success', text: 'Entrou no Calendário de hoje como Reels pronto. Arraste para o dia em que vai postar.' });
    } catch (cause) {
      setNotice({ tone: 'error', text: errorMessage(cause) });
    } finally {
      setSaving(false);
    }
  };

  if (scope.loading || brands.loading) return <Spinner label="Carregando" />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Vídeos" description="Roteiro, imagens e voz viram um Reels narrado com legenda, pronto pra postar. Tudo no seu computador, sem custo." />

      {notice && (
        <div className="mb-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Section title="Conta">
            <Field label="Conta do vídeo" htmlFor="video-account" hint="A marca da conta define as cores e a fonte.">
              <Select id="video-account" value={accountId ?? ''} onChange={(event) => setAccountId(event.target.value || null)}>
                <option value="">Sem conta</option>
                {scope.active.map((item) => (
                  <option key={item.id} value={item.id}>
                    {accountLabel(item)}
                  </option>
                ))}
              </Select>
            </Field>
          </Section>

          <Section title="Roteiro" description="Um parágrafo por cena. Deixe uma linha em branco para trocar a imagem. Rótulos como “Cena 1:” ou “CTA:” não são lidos.">
            <Field label="Texto que a voz vai falar" htmlFor="video-script" hint={scenes.length ? `${scenes.length} ${scenes.length === 1 ? 'cena' : 'cenas'}` : undefined}>
              <Textarea id="video-script" rows={9} maxLength={MAX_SCRIPT_LENGTH} value={script} placeholder={EXAMPLE} onChange={(event) => setScript(event.target.value)} />
            </Field>
            {!script && (
              <Button size="sm" variant="ghost" className="self-start" onClick={() => setScript(EXAMPLE)}>
                Usar o exemplo
              </Button>
            )}
          </Section>

          <Section title="Imagens" description="A imagem padrão (seu avatar, por exemplo) entra em toda cena que não tiver imagem própria.">
            <ScenePicker label="Imagem padrão" text="Usada nas cenas sem imagem." value={fallbackPicture} fallback={null} assets={assets.data} onChange={setFallbackPicture} onError={(text) => setNotice({ tone: 'error', text })} />
            {scenes.map((scene, index) => (
              <ScenePicker
                key={index}
                label={`Cena ${index + 1}`}
                text={scene.sentences.map((sentence) => sentence.text).join(' ')}
                value={pictures[index] ?? null}
                fallback={fallbackPicture}
                assets={assets.data}
                onChange={(value) => setPicture(index, value)}
                onError={(text) => setNotice({ tone: 'error', text })}
              />
            ))}
          </Section>

          <VoicePanel voices={speech.voices} voiceId={voiceId} speed={speed} sample={maker.sample} canListen={scenes.length > 0 && !working} onVoice={setVoiceId} onSpeed={setSpeed} onListen={() => void maker.listen()} />
          <LookPanel look={look} onChange={(patch) => setLook((current) => ({ ...current, ...patch }))} />
          <MusicPanel music={music} onChange={setMusic} />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start">
          {status.kind === 'done' ? (
            <video src={status.result.url} controls playsInline className="mx-auto aspect-[9/16] w-full max-w-[300px] rounded-2xl bg-black shadow-sm" aria-label="Vídeo gerado" />
          ) : (
            <VideoPreview scenes={scenes} pictures={pictures} fallbackPicture={fallbackPicture} look={look} speed={speed} />
          )}

          <GeneratePanel
            status={status}
            canGenerate={scenes.length > 0}
            saving={saving}
            onGenerate={() => {
              setNotice(null);
              void maker.generate();
            }}
            onCancel={maker.cancel}
            onDownload={(result) => download(result, title)}
            onCalendar={(result) => void addToCalendar(result)}
            onEdit={maker.reset}
          />
          <p className="text-center text-[11px] text-faint">
            O vídeo fica só neste navegador até você baixar. Depois de postar, registre as métricas pelo <Link to="/calendario" className="underline underline-offset-2 hover:text-ink">Calendário</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}

interface GeneratePanelProps {
  status: ReturnType<typeof useVideoMaker>['status'];
  canGenerate: boolean;
  saving: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  onDownload: (result: VideoResult) => void;
  onCalendar: (result: VideoResult) => void;
  onEdit: () => void;
}

function GeneratePanel({ status, canGenerate, saving, onGenerate, onCancel, onDownload, onCalendar, onEdit }: GeneratePanelProps) {
  if (status.kind === 'working') {
    const { label, fraction } = stageLabel(status.stage);
    return (
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm" role="status" aria-live="polite">
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
          <div className={fraction === null ? 'h-full w-1/3 animate-pulse rounded-full bg-accent' : 'h-full rounded-full bg-accent transition-[width]'} style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }} />
        </div>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    );
  }

  if (status.kind === 'done') {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" onClick={() => onDownload(status.result)}>
          <Download className="size-4" aria-hidden /> Baixar MP4
        </Button>
        <Button onClick={() => onCalendar(status.result)} loading={saving}>
          <CalendarPlus className="size-4" aria-hidden /> Colocar no Calendário
        </Button>
        <Button variant="ghost" onClick={onEdit}>
          <RotateCcw className="size-4" aria-hidden /> Voltar e ajustar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {status.kind === 'error' && <Alert>{status.message}</Alert>}
      <Button variant="primary" size="lg" onClick={onGenerate} disabled={!canGenerate}>
        <Clapperboard className="size-4" aria-hidden /> Gerar vídeo
      </Button>
    </div>
  );
}
