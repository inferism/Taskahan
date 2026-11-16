import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.warn('Supabase is not configured. Copy .env.example to .env and fill in the values.')
}

// Fallbacks let the UI load without a .env; every request will simply fail.
export const supabase = createClient(url || 'http://127.0.0.1:54321', key || 'missing-key')
