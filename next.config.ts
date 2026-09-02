import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// next.config is evaluated before Next loads .env files, so the Supabase URL
// has to be read explicitly here or remotePatterns comes out empty.
loadEnvConfig(process.cwd());

const supabaseUrl = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
})();

if (!supabaseUrl) {
  console.warn('[next.config] NEXT_PUBLIC_SUPABASE_URL is missing or invalid; remote images are disabled.');
}

/** True only for a Supabase running on this machine (the local CLI stack). */
const isLocalSupabase =
  supabaseUrl !== null &&
  ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(supabaseUrl.hostname);

/**
 * Images come from Supabase Storage, whose host differs per environment: a
 * local container in development, the project domain in production. Deriving
 * it from the same variable the client uses keeps it to one place.
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol.replace(':', '') as 'http' | 'https',
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],

    // Next refuses to fetch an upstream image that resolves to a private IP,
    // which is the right default: it stops the optimizer being used to probe
    // an internal network. The local Supabase stack is exactly that case, so
    // the exception is granted only when the configured host is this machine —
    // never for a deployed environment.
    dangerouslyAllowLocalIP: isLocalSupabase,
  },
};

export default nextConfig;
