import { createClient } from "@supabase/supabase-js";
// Fallback values are this project's public Supabase URL and anon key.
// The anon key is safe to expose client-side — actual access is controlled
// by the Row Level Security policies on the database, not by hiding this key.
// You can still override these via env vars (.env.local locally, or
// Environment Variables in the Vercel dashboard) if you ever rotate the key
// or point this app at a different Supabase project.
const supabaseUrl =
process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jisycigsjwiopfmesxqb.supabase.co";
const supabaseAnonKey =
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc3ljaWdzandpb3BmbWVzeHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTg2NjMsImV4cCI6MjEwMzI3NDY2M30.UpILNr2IZg5N_oETw-3thF3o-5U6FLOcgAHIOlXgDQo";
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
