import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  const today = new Date().toISOString().split('T')[0];

  // Check if WOTD already exists for today
  const { data: existing } = await supabase
    .from('word_of_the_day')
    .select('*, words(id, word, image_url, audio_url, topic_id, difficulty_score, topics(name))')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    return new Response(JSON.stringify({ wotd: existing }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get user profile for level
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('starting_level')
    .eq('id', userId)
    .single();

  const levelDifficultyMap: Record<string, number[]> = {
    beginner: [1, 2],
    elementary: [2, 3],
    'pre-intermediate': [3, 4],
    intermediate: [4, 5],
  };
  const difficultyRange = levelDifficultyMap[profile?.starting_level ?? 'beginner'];

  // Get words already seen as WOTD in last 30 days
  const { data: recentWotd } = await supabase
    .from('word_of_the_day')
    .select('word_id')
    .eq('user_id', userId)
    .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  const seenWordIds = (recentWotd ?? []).map((r) => r.word_id);

  // Get words user hasn't mastered (wrong_count > correct_count or never seen)
  // Priority: words with low accuracy first
  const { data: allWords } = await supabase
    .from('words')
    .select('id, word, image_url, audio_url, topic_id, difficulty_score, topics(name)')
    .gte('difficulty_score', difficultyRange[0])
    .lte('difficulty_score', difficultyRange[1])
    .not('id', 'in', seenWordIds.length > 0 ? `(${seenWordIds.join(',')})` : '(null)');

  if (!allWords || allWords.length === 0) {
    return new Response(JSON.stringify({ wotd: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get user stats to prioritise weak words
  const { data: stats } = await supabase
    .from('user_word_stats')
    .select('word_id, correct_count, wrong_count')
    .eq('user_id', userId);

  const statMap = new Map((stats ?? []).map((s) => [s.word_id, s]));

  // Score: words never seen = score 0.5, weak words get lower score (sorted ascending)
  const scored = allWords.map((w) => {
    const stat = statMap.get(w.id);
    if (!stat) return { word: w, score: 0.5 }; // never seen
    const total = stat.correct_count + stat.wrong_count;
    return { word: w, score: total === 0 ? 0.5 : stat.correct_count / total };
  });

  scored.sort((a, b) => a.score - b.score);

  // Pick from bottom 5 with some randomness
  const pool = scored.slice(0, Math.min(5, scored.length));
  const picked = pool[Math.floor(Math.random() * pool.length)].word;

  // Save WOTD
  const { data: wotdRow } = await supabase
    .from('word_of_the_day')
    .insert({ user_id: userId, word_id: picked.id, date: today, seen: false })
    .select('*, words(id, word, image_url, audio_url, topic_id, difficulty_score, topics(name))')
    .single();

  return new Response(JSON.stringify({ wotd: wotdRow }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
