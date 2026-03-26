import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getUserIdFromJwt(req: Request): string | null {
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token || token.split('.').length !== 3) return null;
    const raw = token.split('.')[1];
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
    const payload = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub ?? null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const senderId = getUserIdFromJwt(req);
  if (!senderId) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  const { friendId } = await req.json();
  if (!friendId) return new Response(JSON.stringify({ error: 'Missing friendId' }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  // Verify friendship is accepted
  const { data: friendship } = await supabase
    .from('friendships')
    .select('id')
    .or(`and(requester_id.eq.${senderId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${senderId})`)
    .eq('status', 'accepted')
    .single();

  if (!friendship) return new Response(JSON.stringify({ error: 'Not friends' }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  // Rate-limit: 1 nudge per friend per 24h
  const { data: friend } = await supabase
    .from('user_profiles')
    .select('push_token, nudge_last_sent_at, display_name')
    .eq('id', friendId)
    .single();

  const { data: sender } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('id', senderId)
    .single();

  if (!friend?.push_token) return new Response(JSON.stringify({ error: 'Friend has no push token', sent: false }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  const lastSent = friend.nudge_last_sent_at ? new Date(friend.nudge_last_sent_at as string) : null;
  const hoursSince = lastSent ? (Date.now() - lastSent.getTime()) / 3600000 : 999;
  if (hoursSince < 24) return new Response(JSON.stringify({ error: 'Nudge already sent today', sent: false }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  // Send push
  const pushRes = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    body: JSON.stringify({
      to: friend.push_token,
      title: `${sender?.display_name ?? 'A friend'} is challenging you! 🔥`,
      body: "They're studying right now. Don't fall behind!",
      data: { type: 'nudge', senderId },
      sound: 'default',
    }),
  });

  if (!pushRes.ok) return new Response(JSON.stringify({ error: 'Push failed', sent: false }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  // Record nudge time
  await supabase.from('user_profiles').update({ nudge_last_sent_at: new Date().toISOString() }).eq('id', friendId);

  return new Response(JSON.stringify({ sent: true }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
