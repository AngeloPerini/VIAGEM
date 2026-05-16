import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://sgtidxwwimuvcmearbul.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_0ouRFvs8foNnDpe3MgPWGA_mCOYC06J';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
