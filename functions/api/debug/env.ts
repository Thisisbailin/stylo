export const onRequestGet = async ({ env }) => {
  const hasSupabaseUrl = typeof env.SUPABASE_URL === "string" && env.SUPABASE_URL.trim().length > 0;
  const hasSupabaseServiceRole =
    typeof env.SUPABASE_SERVICE_ROLE === "string" && env.SUPABASE_SERVICE_ROLE.trim().length > 0;
  const hasSupabaseServiceRoleKey =
    typeof env.SUPABASE_SERVICE_ROLE_KEY === "string" && env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 0;
  const hasSupabaseSecretKey =
    typeof env.SUPABASE_SECRET_KEY === "string" && env.SUPABASE_SECRET_KEY.trim().length > 0;
  const hasClerkPublishableKey =
    typeof env.VITE_CLERK_PUBLISHABLE_KEY === "string" && env.VITE_CLERK_PUBLISHABLE_KEY.trim().length > 0;
  const hasClerkSecretKey =
    typeof env.CLERK_SECRET_KEY === "string" && env.CLERK_SECRET_KEY.trim().length > 0;

  return Response.json({
    ok: true,
    env: {
      SUPABASE_URL: hasSupabaseUrl,
      SUPABASE_SERVICE_ROLE: hasSupabaseServiceRole,
      SUPABASE_SERVICE_ROLE_KEY: hasSupabaseServiceRoleKey,
      SUPABASE_SECRET_KEY: hasSupabaseSecretKey,
      CLERK_SECRET_KEY: hasClerkSecretKey,
      VITE_CLERK_PUBLISHABLE_KEY: hasClerkPublishableKey,
    },
  });
};
