import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useServices, useSession } from '../app/services';
import { errorMessage } from '../app/useResource';
import { Alert, Button, Field, Input } from '../ui/primitives';

export function LoginPage() {
  const { auth } = useServices();
  const { user } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (user) return <Navigate to="/criar" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') await auth.signInWithPassword(email.trim(), password);
      else {
        const { needsConfirmation } = await auth.signUp(email.trim(), password);
        if (needsConfirmation) setNotice('Conta criada. Confirma o e-mail que acabei de mandar e depois entra.');
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 grid size-10 place-items-center rounded-xl bg-ink text-base font-bold text-canvas" aria-hidden>
            F
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Fábrica</h1>
          <p className="mt-2 text-sm text-muted">Cole sua copy e receba um carrossel pronto no seu estilo.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <Field label="E-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha" htmlFor="password" hint={mode === 'signup' ? 'Pelo menos 6 caracteres.' : undefined}>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
          <Button type="submit" variant="primary" size="lg" loading={pending}>
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </Button>
          <button
            type="button"
            className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Não tem conta? Criar agora' : 'Já tenho conta'}
          </button>
        </form>

        {auth.mode === 'demo' && (
          <p className="mt-4 text-center text-xs text-faint">Modo demo: qualquer e-mail funciona e tudo fica salvo só neste navegador.</p>
        )}
      </div>
    </main>
  );
}
