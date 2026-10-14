/** Minimal Deno surface the Fábrica functions use, so `npm run typecheck:functions` checks them with tsc. */
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
declare module 'npm:@supabase/supabase-js@2' { export * from '@supabase/supabase-js'; }
