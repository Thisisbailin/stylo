import { createClient } from '@supabase/supabase-js';
import { getUserId, JSON_HEADERS } from './_auth';
import { readJsonRequest } from './_request';
import type { PagesContext } from './_types';
import { normalizeProjectId } from './_projectScope';

type Env = {
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
};

const ALLOWED_BUCKETS = new Set(['assets', 'public-assets']);
const PUBLIC_BUCKETS = new Set(['public-assets']);
const MAX_REQUEST_BYTES = 16 * 1024;

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

export const onRequestPost = async ({ request, env }: PagesContext<Env>) => {
  try {
    const userId = await getUserId(request, env);
    const payload = await readJsonRequest<Record<string, unknown>>(request, MAX_REQUEST_BYTES);
    const requestedFileName = sanitizePath(payload?.fileName);
    const projectId = normalizeProjectId(payload?.projectId);
    const isAccountAvatar = !projectId && requestedFileName.startsWith('avatars/');
    const bucket = normalizeBucket(payload?.bucket ?? 'assets');
    const contentType = normalizeContentType(payload?.contentType);
    if (!requestedFileName || (!projectId && !isAccountAvatar)) {
      return new Response('fileName and projectId required', { status: 400 });
    }
    if (!bucket) {
      return new Response('bucket not allowed', { status: 400 });
    }
    const supabaseUrl = env.SUPABASE_URL;
    const serviceRole =
      env.SUPABASE_SERVICE_ROLE ||
      env.SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !serviceRole) {
      console.error('Supabase upload configuration is incomplete');
      return new Response('Storage service unavailable', { status: 503 });
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const projectPrefix = projectId
      ? `users/${userId}/projects/${projectId}/`
      : `users/${userId}/account/`;
    const fileName = requestedFileName.startsWith(projectPrefix)
      ? requestedFileName
      : `${projectPrefix}${requestedFileName}`;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(fileName, { upsert: false });

    if (error) {
      console.error('Supabase signed upload URL failed', { message: error.message });
      return new Response('Unable to create upload URL', { status: 502 });
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
      storageRef: {
        provider: 'supabase',
        bucket,
        path: data.path,
        isPublic: PUBLIC_BUCKETS.has(bucket),
      },
    }, { headers: JSON_HEADERS });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error('Signed upload URL request failed', e);
    return new Response('Unexpected storage error', { status: 500 });
  }
};
