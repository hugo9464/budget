export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true" || !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d’environnement manquante : ${name}`);
  return value;
}
