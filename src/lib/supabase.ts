import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined

/** Sant om miljövariablerna saknas – då visar appen en instruktion i stället för att krascha. */
export const configMissing = !url || !key

export const supabase = createClient(url || 'http://localhost:54321', key || 'saknas', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export const PHOTO_BUCKET = 'listing-photos'
