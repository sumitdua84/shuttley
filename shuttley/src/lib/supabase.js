import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'implicit' }
})

// Expose for native iOS bridge (used by ASWebAuthenticationSession callback)
if (typeof window !== 'undefined') window.__supabase = supabase
