import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEVEL_SYSTEM_PROMPTS: Record<number, string> = {
  1: `You are a warm, patient English conversation tutor for beginners.
Start with simple greetings and basic questions like "What's your name?", "How old are you?", "Where are you from?".
Keep your prompts short (1-2 sentences).
Respond ONLY with JSON: { "prompt": string }`,

  2: `You are an encouraging English conversation tutor for elementary learners.
Ask about daily life: food, hobbies, family, weather. Keep it natural and friendly.
Respond ONLY with JSON: { "prompt": string }`,

  3: `You are a supportive English conversation tutor for pre-intermediate learners.
Discuss opinions, preferences, and simple narratives. Challenge them gently.
Respond ONLY with JSON: { "prompt": string }`,
};

const EVAL_SYSTEM_PROMPT = `You are an English language evaluator.
Given the AI's question and the learner's spoken response (transcribed), evaluate it.
Return ONLY JSON:
{
  "status": "correct" | "acceptable" | "preferred",
  "preferred_phrasing": string | null,
  "points": number (0-10),
  "next_prompt": string
}
- "correct": response is fully appropriate
- "acceptable": response works but a better phrasing exists (include preferred_phrasing)
- "preferred": show a significantly better way to say it
- points: 10 = perfect, 7 = acceptable, 4 = needs work, 0 = off-topic
- next_prompt: the next question/comment to continue the conversation`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const contentType = req.headers.get('content-type') ?? '';

  // ── START SESSION ──────────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await req.json();

    if (body.action === 'start') {
      const { level, userId } = body;
      const systemPrompt = LEVEL_SYSTEM_PROMPTS[level] ?? LEVEL_SYSTEM_PROMPTS[1];

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: systemPrompt }],
          temperature: 0.7,
        }),
      });
      const aiData = await aiRes.json();
      const parsed = JSON.parse(aiData.choices[0].message.content);

      const { data: session } = await supabase
        .from('conversation_sessions')
        .insert({ user_id: userId, level, messages: [{ role: 'ai', content: parsed.prompt }], score: 0 })
        .select('id')
        .single();

      return new Response(
        JSON.stringify({ sessionId: session?.id, prompt: parsed.prompt }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // ── VOICE RESPONSE (multipart) ─────────────────────────────
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const audioFile = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string;
    const userId = formData.get('userId') as string;
    const level = parseInt(formData.get('level') as string, 10);

    // Transcribe with Whisper
    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, 'recording.m4a');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'en');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: whisperForm,
    });
    const whisperData = await whisperRes.json();
    const transcript: string = whisperData.text ?? '';

    // Load session messages for context
    const { data: session } = await supabase
      .from('conversation_sessions')
      .select('messages')
      .eq('id', sessionId)
      .single();

    const messages = (session?.messages ?? []) as Array<{ role: string; content: string }>;
    const lastAiMsg = [...messages].reverse().find((m) => m.role === 'ai')?.content ?? '';

    // Evaluate response
    const evalRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: EVAL_SYSTEM_PROMPT },
          { role: 'user', content: `AI asked: "${lastAiMsg}"\nLearner said: "${transcript}"` },
        ],
        temperature: 0.3,
      }),
    });
    const evalData = await evalRes.json();
    const evaluation = JSON.parse(evalData.choices[0].message.content);

    // Update session in DB
    const newMessages = [
      ...messages,
      { role: 'user', content: transcript, evaluation: { status: evaluation.status, preferred_phrasing: evaluation.preferred_phrasing, points: evaluation.points } },
      { role: 'ai', content: evaluation.next_prompt },
    ];

    await supabase
      .from('conversation_sessions')
      .update({ messages: newMessages, score: (session as any)?.score + evaluation.points })
      .eq('id', sessionId);

    // Trigger AI lesson suggestion (async, best-effort)
    supabase.functions.invoke('suggest-lesson', { body: { userId } }).catch(() => {});

    return new Response(
      JSON.stringify({
        transcript,
        evaluation: { status: evaluation.status, preferred_phrasing: evaluation.preferred_phrasing, points: evaluation.points },
        nextPrompt: evaluation.next_prompt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: corsHeaders });
});
