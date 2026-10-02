import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toAvatarDataUrl } from '../app/avatarImage';
import { useAccounts, useBrandKits } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { emptyAccount, MAX_ACCOUNT_NAME, normalizeHandle, type Account, type AccountInput } from '../domain/account';
import { isAcceptedImage, UPLOAD_RULES_MESSAGE } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import { PLATFORM_LABELS, PLATFORMS, type Platform } from '../domain/carousel';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner } from '../ui/primitives';

export function AccountsPage() {
  const services = useServices();
  const accounts = useAccounts();
  const brands = useBrandKits();
  const [editing, setEditing] = useState<{ id: string | null; input: AccountInput } | null>(null);

  if (accounts.loading || brands.loading) return <Spinner />;

  const save = async (input: AccountInput) => {
    const saved = editing?.id ? await services.accounts.update(editing.id, input) : await services.accounts.create(input);
    accounts.setData((current) => (editing?.id ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved]));
  };

  const remove = async () => {
    if (!editing?.id) return;
    await services.accounts.remove(editing.id);
    accounts.setData((current) => current.filter((item) => item.id !== editing.id));
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Contas"
        description="Os perfis que você produz. No modelo Post, o nome, o @ e a foto da conta escolhida aparecem no topo de cada slide."
        action={
          <Button variant="primary" onClick={() => setEditing({ id: null, input: emptyAccount('instagram') })}>
            <Plus className="size-4" aria-hidden /> Nova conta
          </Button>
        }
      />
      {accounts.error && <Alert>{accounts.error}</Alert>}

      {accounts.data.length === 0 ? (
        <EmptyState title="Nenhuma conta ainda" description="Cadastra o @, a rede social e a foto de cada perfil que você posta." />
      ) : (
        <div className="flex flex-col gap-8">
          {PLATFORMS.map((platform) => {
            const items = accounts.data.filter((account) => account.platform === platform);
            if (items.length === 0) return null;
            return (
              <section key={platform} aria-labelledby={`accounts-${platform}`}>
                <h2 id={`accounts-${platform}`} className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
                  {PLATFORM_LABELS[platform]}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((account) => (
                    <li key={account.id}>
                      <AccountCard account={account} brand={brands.data.find((kit) => kit.id === account.brandKitId)} onClick={() => setEditing({ id: account.id, input: toInput(account) })} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {editing && <AccountEditor key={editing.id ?? 'new'} isNew={!editing.id} initial={editing.input} brands={brands.data} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </div>
  );
}

function toInput(account: Account): AccountInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = account;
  return input;
}

function Avatar({ name, src, size = 'md' }: { name: string; src: string | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-20 text-2xl' : 'size-12 text-base';
  if (src) return <img src={src} alt="" className={`${box} shrink-0 rounded-full object-cover ring-1 ring-line`} />;
  return (
    <span className={`${box} grid shrink-0 place-items-center rounded-full bg-ink font-semibold text-surface`} aria-hidden>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

function AccountCard({ account, brand, onClick }: { account: Account; brand: BrandKit | undefined; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Avatar name={account.name} src={account.avatar} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{account.name}</span>
        <span className="block truncate text-sm text-muted">@{account.handle}</span>
        {brand && <span className="mt-1 block truncate text-xs text-faint">Marca: {brand.name}</span>}
      </span>
      <Badge>{PLATFORM_LABELS[account.platform]}</Badge>
    </button>
  );
}

interface AccountEditorProps {
  isNew: boolean;
  initial: AccountInput;
  brands: BrandKit[];
  onClose: () => void;
  onSave: (input: AccountInput) => Promise<void>;
  onDelete: () => Promise<void>;
}

function AccountEditor({ isNew, initial, brands, onClose, onSave, onDelete }: AccountEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const patch = <K extends keyof AccountInput>(key: K, value: AccountInput[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const handle = normalizeHandle(draft.handle);
  const valid = draft.name.trim().length > 0 && handle.length > 0;

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!isAcceptedImage(file)) return setError(`Essa foto não serve: ${UPLOAD_RULES_MESSAGE}.`);
    try {
      patch('avatar', await toAvatarDataUrl(file));
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <Dialog
      title={isNew ? 'Nova conta' : `Editar @${initial.handle}`}
      open
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" className="mr-auto" disabled={pending} onClick={() => window.confirm('Excluir essa conta? Os carrosséis dela continuam salvos.') && void run(onDelete)}>
              <Trash2 className="size-4" aria-hidden /> Excluir
            </Button>
          )}
          <Button variant="primary" loading={pending} disabled={!valid} onClick={() => void run(() => onSave({ ...draft, name: draft.name.trim(), handle }))}>
            Salvar conta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar name={draft.name} src={draft.avatar} size="lg" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4" aria-hidden /> {draft.avatar ? 'Trocar foto' : 'Escolher foto'}
            </Button>
            {draft.avatar && (
              <Button size="sm" variant="ghost" onClick={() => patch('avatar', null)}>
                Remover foto
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Foto de perfil da conta"
            onChange={(event) => {
              void pickPhoto(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rede social" htmlFor="acc-platform">
            <Select id="acc-platform" value={draft.platform} onChange={(e) => patch('platform', e.target.value as Platform)}>
              {PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {PLATFORM_LABELS[platform]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Usuário" htmlFor="acc-handle" hint={handle ? `Aparece como @${handle}` : 'Sem o @, sem espaço.'}>
            <Input id="acc-handle" value={draft.handle} onChange={(e) => patch('handle', e.target.value)} placeholder="ellarefina" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </Field>
          <Field label="Nome que aparece" htmlFor="acc-name" className="sm:col-span-2">
            <Input id="acc-name" value={draft.name} onChange={(e) => patch('name', e.target.value)} maxLength={MAX_ACCOUNT_NAME} placeholder="Ella Refina" />
          </Field>
          <Field label="Marca dessa conta" htmlFor="acc-brand" hint="Vem selecionada sozinha quando você escolhe essa conta na tela Criar." className="sm:col-span-2">
            <Select id="acc-brand" value={draft.brandKitId ?? ''} onChange={(e) => patch('brandKitId', e.target.value || null)}>
              <option value="">Escolher na hora</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
    </Dialog>
  );
}
