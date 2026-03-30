import { createClient } from '@supabase/supabase-js';

const ALLOWED_BUCKETS = new Set(['assets', 'public-assets']);
const PUBLIC_BUCKETS = new Set(['public-assets']);

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

const normalizeContentType = (value: unknown) => {
  if (typeof value !== 'string') return 'application/octet-stream';
  const cleaned = value.trim().slice(0, 120);
  return cleaned || 'application/octet-stream';
};

export const onRequestPost = async ({ request, env }) => {
  try {
    const payload = await request.json();
    const fileName = sanitizePath(payload?.fileName);
    const bucket = normalizeBucket(payload?.bucket ?? 'assets');
    const contentType = normalizeContentType(payload?.contentType);
    if (!fileName) {
      return new Response('fileName required', { status: 400 });
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
      .createSignedUploadUrl(fileName, { upsert: false, contentType });

    if (error) {
      return new Response(error.message, { status: 400 });
    }

    let publicUrl: string | undefined;
    if (PUBLIC_BUCKETS.has(bucket)) {
      const publicResult = supabase.storage.from(bucket).getPublicUrl(data.path);
      if (publicResult?.data?.publicUrl) {
        publicUrl = publicResult.data.publicUrl;
      }
    }

    return Response.json({
      signedUrl: data.signedUrl,
      path: data.path,
      bucket,
      publicUrl,
    });
  } catch (e: any) {
    return new Response(e?.message || 'Unexpected error', { status: 500 });
  }
};
