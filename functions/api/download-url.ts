import { createClient } from '@supabase/supabase-js';

const ALLOWED_BUCKETS = new Set(['assets', 'public-assets']);

const sanitizePath = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .trim()
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment === '.' || segment === '..') return '';
      return segment.replace(/[^\w.\-]+/g, '_');
    })
    .filter(Boolean)
    .join('/');
  return cleaned.slice(0, 240);
};

const normalizeBucket = (value: unknown) => {
  const bucket = typeof value === 'string' ? value.trim() : 'assets';
  if (!ALLOWED_BUCKETS.has(bucket)) return null;
  return bucket;
};

const normalizeExpiresIn = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3600;
  return Math.max(60, Math.min(24 * 60 * 60, Math.round(parsed)));
};

export const onRequestPost = async ({ request, env }) => {
  try {
    const payload = await request.json();
    const path = sanitizePath(payload?.path);
    const bucket = normalizeBucket(payload?.bucket ?? 'assets');
    const expiresIn = normalizeExpiresIn(payload?.expiresIn ?? 3600);
    if (!path) {
      return new Response('path required', { status: 400 });
    }
    if (!bucket) {
      return new Response('bucket not allowed', { status: 400 });
    }
    const supabaseUrl = env.SUPABASE_URL;
    const serviceRole = env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) {
      return new Response('Supabase env missing', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      return new Response(error.message, { status: 400 });
    }

    return Response.json({
      signedUrl: data.signedUrl,
      expiresIn,
    });
  } catch (e: any) {
    return new Response(e?.message || 'Unexpected error', { status: 500 });
  }
};
