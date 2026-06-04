import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is a super admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401 })

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller } } = await supabaseUser.auth.getUser()
    const SUPER_ADMINS = ['sumit@shuttley.club']
    if (!caller || !SUPER_ADMINS.includes(caller.email!)) {
      return new Response('Forbidden', { status: 403 })
    }

    // Get the user ID to delete from request body
    const { userId, requestId } = await req.json()
    if (!userId) return new Response('Missing userId', { status: 400 })

    // Use admin client to delete the auth user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) throw error

    // Mark request as completed
    if (requestId) {
      await supabaseAdmin
        .from('account_deletion_requests')
        .update({ status: 'completed' })
        .eq('id', requestId)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
