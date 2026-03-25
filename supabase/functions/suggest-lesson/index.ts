import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { userId } = await req.json();
  if (!userId) return new Response(JSON.stringify({ error: 'userId required' }), { status: 400 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Gather recent performance
  const [profileRes, historyRes, weakWordsRes, topicsRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', userId).single(),
    supabase.from('lesson_history').select('*').eq('user_id', userId)
      .order('completed_at', { ascending: false }).limit(10),
    supabase.from('user_word_stats').select('*, words(word, topic_id)')
      .eq('user_id', userId)
      .lt('next_review_at', new Date().toISOString())
      .order('wrong_count', { ascending: false })
      .limit(5),
    supabase.from('topics').select('id, name').order('difficulty_tier'),
  ]);

  const profile = profileRes.data;
  const history = historyRes.data ?? [];
  const weakWords = weakWordsRes.data ?? [];
  const topics = topicsRes.data ?? [];

  if (!profile) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

  // Build a compact summary for GPT
  const practicedTopicIds = new Set(history.map((h: any) => h.topic_id));
  const notPracticed = topics.filter((t: any) => !practicedTopicIds.has(t.id)).slice(0, 3);
  const recentScores = history.slice(0, 5).map((h: any) => `${h.mode}: ${h.score}/${h.total_questions}`);
  const weakWordList = weakWords.map((w: any) => w.words?.word).filter(Boolean);

  const summaryPrompt = `
User level: ${profile.starting_level}
XP: ${profile.xp}, Streak: ${profile.streak_days} days
Recent session scores: ${recentScores.join(', ') || 'none yet'}
Words needing review: ${weakWordList.join(', ') || 'none'}
Topics not yet practiced: ${notPracticed.map((t: any) => t.name).join(', ') || 'all practiced'}

Write a 1-2 sentence friendly suggestion for what to study next.
Be specific: mention topic names or words.
Be encouraging and warm.
Respond ONLY with JSON: { "suggestion": string, "topic_id": string | null }
topic_id should be the ID of the recommended topic if applicable, otherwise null.
Available topic IDs: ${topics.map((t: any) => `${t.name}:${t.id}`).join(', ')}
`.trim();

  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful English learning assistant.' },
        { role: 'user', content: summaryPrompt },
      ],
      temperature: 0.6,
    }),
  });

  const aiData = await aiRes.json();
  const parsed = JSON.parse(aiData.choices[0].message.content);

  // Dismiss old suggestion first
  await supabase.from('ai_suggestions').update({ dismissed: true }).eq('user_id', userId).eq('dismissed', false);

  // Insert new suggestion
  await supabase.from('ai_suggestions').insert({
    user_id: userId,
    suggestion_text: parsed.suggestion,
    suggested_topic_id: parsed.topic_id ?? null,
    dismissed: false,
    generated_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
