import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── CURRICULUM (6 levels) ─────────────────────────────────────────────────────
export const CURRICULUM: Record<number, Array<{ id: string; label: string; emoji: string; systemPrompt: string }>> = {
  1: [
    { id: 'greetings',  label: 'Nice to Meet You',   emoji: '👋', systemPrompt: `You are a warm English tutor for absolute beginners. The topic is introductions and greetings. Greet the learner and ask their name. Ask one simple question at a time (name, age, hometown, favorite color, or pets). Keep every sentence under 8 words. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'shopping',   label: 'At the Store',        emoji: '🛒', systemPrompt: `You are a friendly shopkeeper. The topic is shopping for everyday items. Start: "Welcome! What would you like to buy today?" Ask simple follow-up questions about color, size, or price. One question at a time. Keep it to this topic. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'classroom',  label: 'First Day of School', emoji: '🏫', systemPrompt: `You are a kind teacher meeting a new student. The topic is school and classroom life. Start: "Hello! I am your teacher. What is your name?" Ask about their favorite subject or what they like to do at school. One question at a time. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'family',     label: 'My Family',            emoji: '👨‍👩‍👧', systemPrompt: `You are a friendly neighbor. The topic is family members and home life. Start: "Hi! Do you have a big family?" Ask simple questions about siblings, parents, or pets. One question at a time. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'food_basic', label: 'Food I Love',          emoji: '🍜', systemPrompt: `You are a curious friend talking about food. The topic is favorite foods and meals. Start: "What is your favorite food?" Ask about meals, snacks, and drinks. One question at a time. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'animals',    label: 'Animal Friends',       emoji: '🐾', systemPrompt: `You are a zookeeper. The topic is animals and pets. Start: "Hello! Do you like animals?" Ask about their favorite animal, pets they have or want, and animal facts. One question at a time. Respond ONLY with valid JSON: { "prompt": "..." }` },
  ],
  2: [
    { id: 'restaurant', label: 'Dinner Out',           emoji: '🍽️', systemPrompt: `You are a waiter at a casual restaurant. The topic is ordering food at a restaurant. Start: "Good evening! Welcome. Do you have a reservation?" Have a natural conversation about food preferences and ordering. Stay on the restaurant topic. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'weekend',    label: 'Weekend Plans',        emoji: '🗓️', systemPrompt: `You are a coworker making small talk. The topic is weekend activities and hobbies. Start: "Hey! Do you have any plans for this weekend?" Ask about hobbies and activities. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'travel',     label: 'Dream Vacation',       emoji: '✈️', systemPrompt: `You are a travel agent. The topic is travel and vacations. Start: "Hello! Where would you love to travel if you could go anywhere?" Discuss destinations and travel preferences. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'health',     label: "Doctor's Visit",       emoji: '🏥', systemPrompt: `You are a doctor's receptionist. The topic is health and medical visits. Start: "Good morning! How can I help you today? Are you feeling unwell?" Ask about symptoms and general health. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'technology', label: 'Tech Talk',            emoji: '📱', systemPrompt: `You are a tech-savvy friend. The topic is phones, apps, and social media. Start: "Do you prefer iPhone or Android?" Chat about apps, gadgets, and social media habits. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'weather',    label: 'Weather & Seasons',   emoji: '⛅', systemPrompt: `You are a neighbor making small talk. The topic is weather and seasons. Start: "Wow, what a beautiful day! Do you like this kind of weather?" Talk about seasons and climate preferences. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'home_life',  label: 'Home Sweet Home',     emoji: '🏠', systemPrompt: `You are a friendly real estate agent. The topic is homes, rooms, and living spaces. Start: "Tell me about where you live! Is it a house or an apartment?" Ask about rooms, neighborhood, and home preferences. Respond ONLY with valid JSON: { "prompt": "..." }` },
  ],
  3: [
    { id: 'debate_environment', label: 'Climate Change',    emoji: '🌍', systemPrompt: `You are an interviewer. The topic is climate change and environmental responsibility. Start: "Do you think individuals or governments are more responsible for solving climate change?" Challenge the learner to explain and defend their views on this topic. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'work_future',        label: 'Future of Work',    emoji: '💼', systemPrompt: `You are a journalist. The topic is remote work vs office work. Start: "Do you think remote work is better than working in an office?" Explore work-life balance and productivity. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'social_media',       label: 'Social Media',      emoji: '📲', systemPrompt: `You are a researcher. The topic is the impact of social media on society. Start: "Do you think social media has made society better or worse?" Dig into mental health and misinformation. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'education',          label: 'Education Systems', emoji: '🎓', systemPrompt: `You are an education policy analyst. The topic is how education systems work and could improve. Start: "If you could redesign the school system, what would you change first?" Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'storytelling',       label: 'Build a Story',     emoji: '📖', systemPrompt: `You are a creative writing coach. The topic is collaborative storytelling. Start: "Let's build a short story together. You wake up and find a mysterious letter under your door. What does it say?" Guide the story. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'ethics',             label: 'Moral Dilemmas',    emoji: '⚖️', systemPrompt: `You are a philosophy teacher. The topic is moral dilemmas and ethical reasoning. Start: "Here is a dilemma: you can save five strangers or one close friend. What would you do and why?" Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'culture',            label: 'My Culture',        emoji: '🌏', systemPrompt: `You are a cultural exchange student. The topic is Vietnamese culture and traditions. Start: "I'd love to learn about your culture! What is a tradition from Vietnam that you're proud of?" Explore customs, food, and festivals. Respond ONLY with valid JSON: { "prompt": "..." }` },
  ],
  4: [
    { id: 'job_interview',   label: 'Job Interview',        emoji: '👔', systemPrompt: `You are a hiring manager conducting a job interview. The topic is professional skills and career goals. Start: "Thank you for coming in today. Could you start by telling me a little about yourself and why you want this role?" Ask behavioral and situational interview questions. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'news_debate',     label: 'News & Media',         emoji: '📰', systemPrompt: `You are a news anchor conducting an interview. The topic is media literacy and how we consume news. Start: "With so much news available today, how do you decide what sources to trust?" Explore fake news, bias, and media responsibility. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'relationships',   label: 'Relationships',        emoji: '💬', systemPrompt: `You are a relationship counselor. The topic is friendships, trust, and maintaining relationships. Start: "What do you think is the most important quality in a good friend?" Explore communication, conflict, and support. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'entertainment',   label: 'Arts & Entertainment', emoji: '🎬', systemPrompt: `You are a film critic. The topic is movies, books, music, and popular culture. Start: "What is a film or book that had a big impact on you, and why?" Dig into themes, storytelling, and cultural impact. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'city_life',       label: 'City vs Country',      emoji: '🏙️', systemPrompt: `You are a sociologist researching lifestyle differences. The topic is urban vs rural living. Start: "Would you rather live in a big city or in the countryside? What appeals to you about each?" Explore quality of life, opportunity, and community. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'habits',          label: 'Building Good Habits', emoji: '📅', systemPrompt: `You are a life coach. The topic is habits, routines, and self-improvement. Start: "What is one habit you have tried to build or break recently? How did it go?" Explore motivation, discipline, and personal growth. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'global_culture',  label: 'Cultural Differences', emoji: '🤝', systemPrompt: `You are a cultural consultant. The topic is cultural differences and global perspectives. Start: "Have you ever experienced a misunderstanding because of cultural differences? Tell me about it." Explore empathy and cross-cultural communication. Respond ONLY with valid JSON: { "prompt": "..." }` },
  ],
  5: [
    { id: 'economy',         label: 'Global Economy',       emoji: '💹', systemPrompt: `You are a global economist. The topic is economic inequality and global trade. Start: "Do you think the gap between rich and poor countries is getting better or worse? What is driving this?" Use evidence-based discussion. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'ai_ethics',       label: 'AI & Ethics',          emoji: '🤖', systemPrompt: `You are an AI ethics researcher. The topic is the societal impact of artificial intelligence. Start: "As AI becomes more capable, what is the biggest risk you think we face as a society?" Explore automation, bias, and existential risk. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'healthcare',      label: 'Healthcare Access',    emoji: '🏥', systemPrompt: `You are a healthcare policy analyst. The topic is access to healthcare and universal coverage. Start: "Do you believe healthcare is a basic human right? How should it be funded and managed?" Challenge assumptions and explore real-world trade-offs. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'democracy',       label: 'Democracy & Power',    emoji: '🗳️', systemPrompt: `You are a political scientist. The topic is democracy, governance, and political power. Start: "Do you think democracy is the best form of government? What are its biggest weaknesses?" Analyze political systems critically. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'mental_health',   label: 'Mental Health Society',emoji: '🧘', systemPrompt: `You are a clinical psychologist. The topic is mental health stigma and modern wellbeing. Start: "In many societies, mental health is still taboo. Why do you think that is, and what can change it?" Explore therapy, culture, and workplace stress. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'environment_adv', label: 'Environmental Policy', emoji: '🌱', systemPrompt: `You are an environmental policy expert. The topic is evaluating the effectiveness of environmental policies. Start: "Which environmental policy do you think has been most successful globally — and which has failed? Why?" Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'migration',       label: 'Migration & Identity', emoji: '🗺️', systemPrompt: `You are a sociologist studying migration. The topic is immigration, identity, and belonging. Start: "When someone moves to a new country, how much of their original identity should they maintain versus adapting to the new culture?" Respond ONLY with valid JSON: { "prompt": "..." }` },
  ],
  6: [
    { id: 'philosophy_ethics', label: 'Applied Ethics',       emoji: '⚖️', systemPrompt: `You are a philosophy professor. The topic is applied ethics and moral philosophy. Start: "Can an action that causes harm ever be morally justified? Walk me through your reasoning using a real-world example." Use Socratic method to probe assumptions. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'geopolitics',       label: 'Geopolitics',          emoji: '🌐', systemPrompt: `You are a geopolitical analyst. The topic is global power dynamics and international relations. Start: "How do you assess the current global balance of power? Which emerging shifts concern you most?" Expect sophisticated, nuanced analysis. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'psychology_adv',    label: 'Human Behavior',       emoji: '🧠', systemPrompt: `You are a cognitive psychologist. The topic is the psychology of decision-making and human behavior. Start: "How much of human behavior do you believe is driven by rationality versus unconscious biases?" Explore cognitive biases and behavioral economics. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'literature',        label: 'Literary Analysis',    emoji: '📚', systemPrompt: `You are a literary critic. The topic is themes, symbols, and narrative technique in literature. Start: "Choose any novel or short story and explain how the author uses a specific literary device — symbol, motif, or structure — to convey the central theme." Engage at university level. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'science_society',   label: 'Science & Society',    emoji: '🔬', systemPrompt: `You are a science policy researcher. The topic is the relationship between scientific progress and societal values. Start: "Should scientists have a moral obligation to consider the societal impact of their research before publishing it? Defend your position." Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'future_humanity',   label: 'Future of Humanity',   emoji: '🚀', systemPrompt: `You are a futurist and philosopher. The topic is humanity's long-term future and existential challenges. Start: "If you had to identify the single greatest existential threat facing humanity in the next 100 years, what would it be and why?" Expect deep, multi-layered analysis. Respond ONLY with valid JSON: { "prompt": "..." }` },
    { id: 'cultural_theory',   label: 'Cultural Identity',    emoji: '🎭', systemPrompt: `You are a cultural theorist. The topic is cultural identity, representation, and postmodernity. Start: "Is cultural identity fixed or fluid? Can someone authentically belong to multiple cultures simultaneously?" Explore postcolonial theory and lived experience. Respond ONLY with valid JSON: { "prompt": "..." }` },
  ],
};

const MAX_EXCHANGES: Record<number, number> = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 8, 6: 10 };

// ── FREE PLAY POOLS ───────────────────────────────────────────────────────────
const FREE_PLAY_BY_LEVEL: Record<number, { topics: string[]; personas: string[] }> = {
  1: {
    topics: ['my favorite animal', 'what I eat for breakfast', 'my bedroom', 'colors I like', 'my daily routine', 'a toy I love', 'the weather today', 'my favorite game'],
    personas: ['a friendly teacher', 'a curious classmate', 'a kind shopkeeper', 'a nice neighbor', 'a helpful librarian'],
  },
  2: {
    topics: ['my hobbies', 'a place in my city', 'cooking a simple meal', 'a recent birthday', 'shopping for clothes', 'my weekend routine', 'a sport I enjoy', 'a TV show I like'],
    personas: ['a friendly coworker', 'a travel guide', 'a restaurant host', 'a gym instructor', 'a librarian', 'a school counselor'],
  },
  3: {
    topics: ['a movie I watched recently', 'social media habits', 'my study routine', 'a recent trip I took', 'a book I read', 'friendship and trust', 'my dream job', 'a local event I attended'],
    personas: ['a podcast host', 'a university classmate', 'a career counselor', 'a travel blogger', 'a local journalist', 'a motivational coach'],
  },
  4: {
    topics: ['cultural differences I have noticed', 'a career challenge I faced', 'a news story I followed', 'a lifestyle change I made', 'work-life balance', 'a community issue I care about', 'technology and privacy', 'personal finance habits'],
    personas: ['a documentary filmmaker', 'an HR manager', 'a news anchor', 'a life coach', 'a cultural consultant', 'a startup founder', 'a community leader'],
  },
  5: {
    topics: ['a global trend affecting my country', 'economic inequality in my city', 'mental health in modern workplaces', 'innovation disrupting my industry', 'a social justice issue I follow', 'the gig economy', 'climate policy effectiveness', 'the future of education'],
    personas: ['a policy researcher', 'a tech entrepreneur', 'a global economist', 'a human rights advocate', 'an environmental scientist', 'a sociologist', 'a UN representative'],
  },
  6: {
    topics: ['the nature of consciousness and free will', 'post-truth politics and epistemology', 'the ethics of genetic engineering', 'the crisis of meaning in modern society', 'historical patterns and their modern parallels', 'the philosophy of personal identity', 'artificial general intelligence and control'],
    personas: ['a philosophy professor', 'a political theorist', 'a bioethicist', 'a literary critic', 'a historian', 'an AI safety researcher', 'a cognitive scientist'],
  },
};

function buildFreePlaySystemPrompt(topic: string, persona: string, level: number): string {
  const complexity: Record<number, string> = {
    1: 'Use very simple English. Ask only one very short question at a time (under 8 words). Perfect for absolute beginners.',
    2: 'Use simple, clear English. Ask one follow-up question at a time. Encourage short sentences.',
    3: 'Use natural conversational English. Encourage the learner to elaborate with 2-3 sentences.',
    4: 'Engage in nuanced discussion. Ask for examples, explanations, and personal opinions.',
    5: 'Use sophisticated language. Challenge the learner to support their views with evidence and reasoning.',
    6: 'Use advanced academic discourse. Explore ideas deeply. Use rich vocabulary and expect complex reasoning.',
  };
  return `You are ${persona}. You are having a conversation with an English learner about: "${topic}".

IMPORTANT RULES:
1. Keep the conversation focused on "${topic}". If the learner tries to change to a completely unrelated subject, gently redirect them — for example: "That's interesting! But let's come back to ${topic} — I'm curious about..."
2. Natural topic evolution within the theme is fine (e.g., talking about food → talking about a specific restaurant they love).
3. ${complexity[level] ?? complexity[3]}
4. Be warm, encouraging, and patient.
5. Respond ONLY with valid JSON: { "prompt": "..." }`;
}

// ── EVAL PROMPTS ──────────────────────────────────────────────────────────────
const EVAL_PROMPT_BASE = `You are an English language evaluator. Given the conversation topic/context, the AI's question, and the learner's response, evaluate it.
Return ONLY valid JSON:
{ "status": "correct" | "acceptable" | "preferred", "preferred_phrasing": string | null, "points": number, "next_prompt": string }
- correct: fully appropriate and on-topic (8-10 pts)
- acceptable: works but could be better (5-7 pts, include preferred_phrasing)
- preferred: significantly better phrasing exists (2-4 pts, include preferred_phrasing)
- If the learner goes completely off-topic: give 2 pts, preferred_phrasing = null, and set next_prompt to gently redirect them back to the conversation topic.
- next_prompt: a friendly follow-up that continues the established conversation topic.`;

const HINTS_PROMPT = `You are an English tutor helping an absolute beginner. Given the AI's question, provide 3 short sample answers the learner could say.
Return ONLY valid JSON: { "hints": ["answer one", "answer two", "answer three"] }
Keep each answer very short (2-8 words), natural, and appropriate for a beginner.`;

// ── HELPERS ───────────────────────────────────────────────────────────────────
const ok = (data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const err = (message: string, detail?: string) => {
  console.error(`[conversation] ${message}`, detail ?? '');
  return new Response(JSON.stringify({ error: message, detail: detail ?? '' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
};

function getUserIdFromJwt(req: Request): string | null {
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token || token.split('.').length !== 3) return null;
    const raw = token.split('.')[1];
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
    const payload = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    const sub = payload.sub as string | undefined;
    return sub && sub.length > 10 ? sub : null;
  } catch { return null; }
}

async function callOpenAI(messages: Array<{ role: string; content: string }>, temperature = 0.7) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', messages, temperature, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) return { ok: false as const, error: `OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  return content ? { ok: true as const, content } : { ok: false as const, error: 'Empty content' };
}

function parseJson(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()); }
  catch { return null; }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── EVALUATE ──────────────────────────────────────────────────────────────────
async function evaluateAndRespond(
  supabase: ReturnType<typeof createClient>,
  sessionId: string, userId: string, transcript: string, isLastExchange: boolean
) {
  const { data: row, error: fetchErr } = await supabase
    .from('conversation_sessions')
    .select('messages, score, level, scenario_id')
    .eq('id', sessionId).single();

  if (fetchErr || !row) return { error: `Session not found: ${fetchErr?.message}` };

  const messages = (row.messages ?? []) as Array<{ role: string; content: string }>;
  // Extract system context (first message if role=system, used for topic alignment)
  const systemContext = messages.find((m) => m.role === 'system')?.content ?? '';
  const lastAiMsg = [...messages].reverse().find((m) => m.role === 'ai')?.content ?? '';

  const level = (row.level as number) ?? 1;
  const maxExchanges = MAX_EXCHANGES[level] ?? 6;
  const maxPossibleScore = maxExchanges * 10;

  const topicContext = systemContext
    ? `\n\nConversation context: ${systemContext.slice(0, 300)}`
    : '';

  const closingInstruction = isLastExchange
    ? '\n\nThis is the FINAL exchange. In next_prompt, write a warm, encouraging closing message (2-3 sentences). Do NOT ask a new question.'
    : '';

  const evalPromptFull = EVAL_PROMPT_BASE + topicContext + closingInstruction;

  const aiResult = await callOpenAI([
    { role: 'system', content: evalPromptFull },
    { role: 'user', content: `AI asked: "${lastAiMsg}"\nLearner said: "${transcript}"` },
  ], 0.3);

  if (!aiResult.ok) return { error: aiResult.error };
  const evaluation = parseJson(aiResult.content);
  if (!evaluation) return { error: `Parse error: ${aiResult.content.slice(0, 100)}` };

  const newScore = ((row.score as number) ?? 0) + ((evaluation.points as number) ?? 0);
  const newMessages = [
    ...messages,
    { role: 'user', content: transcript, evaluation: { status: evaluation.status, preferred_phrasing: evaluation.preferred_phrasing ?? null, points: evaluation.points ?? 0 } },
    { role: 'ai', content: evaluation.next_prompt },
  ];
  const exchangeCount = newMessages.filter((m) => m.role === 'user').length;
  const sessionDone = exchangeCount >= maxExchanges;

  await supabase.from('conversation_sessions').update({
    messages: newMessages,
    score: newScore,
    max_score: maxPossibleScore,
    ...(sessionDone ? { completed_at: new Date().toISOString() } : {}),
  }).eq('id', sessionId);

  // If session done, check level-up (all structured scenarios completed)
  let leveledUp = false;
  if (sessionDone) {
    const scenariosInLevel = CURRICULUM[level]?.length ?? 1;
    const { count } = await supabase
      .from('conversation_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('level', level)
      .neq('scenario_id', 'free_play')
      .not('completed_at', 'is', null);

    if ((count ?? 0) >= scenariosInLevel) {
      const nextLevel = Math.min(level + 1, 6);
      await supabase.from('user_profiles').update({ convo_level: nextLevel }).eq('id', userId);
      leveledUp = true;
    }
    supabase.functions.invoke('suggest-lesson', { body: { userId } }).catch(() => {});
  }

  return { transcript, evaluation: { status: evaluation.status, preferred_phrasing: evaluation.preferred_phrasing ?? null, points: evaluation.points ?? 0 }, nextPrompt: evaluation.next_prompt, exchangeCount, maxExchanges, sessionScore: newScore, maxPossibleScore, sessionDone, leveledUp };
}

// ── SERVE ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const jwtUserId = getUserIdFromJwt(req);
  const contentType = req.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const userId: string | undefined = jwtUserId ?? body.userId;
      if (!userId) return err('Not authenticated');

      // ── GET LEVEL PROGRESS ──────────────────────────────────────────────────
      if (body.action === 'get_level_progress') {
        const { level } = body;
        const scenarioIds = (CURRICULUM[level] ?? []).map((s) => s.id);

        const { data: sessions } = await supabase
          .from('conversation_sessions')
          .select('scenario_id, score, max_score, completed_at')
          .eq('user_id', userId)
          .eq('level', level)
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false });

        const bestByScenario: Record<string, { score: number; maxScore: number }> = {};
        let freePlayCount = 0;
        let freePlayXP = 0;

        for (const s of sessions ?? []) {
          const sid = s.scenario_id as string;
          if (!sid) continue;
          if (sid === 'free_play') {
            freePlayCount++;
            freePlayXP += ((s.score as number) / ((s.max_score as number) || 60)) * 100;
          } else if (!bestByScenario[sid] || (s.score as number) > bestByScenario[sid].score) {
            bestByScenario[sid] = { score: s.score as number, maxScore: (s.max_score as number) || 60 };
          }
        }

        const completedCount = Object.keys(bestByScenario).filter((id) => scenarioIds.includes(id)).length;
        return ok({ completedCount, totalCount: scenarioIds.length, bestByScenario, levelComplete: completedCount >= scenarioIds.length, freePlayCount, freePlayXP });
      }

      // ── START STRUCTURED SESSION ────────────────────────────────────────────
      if (body.action === 'start') {
        const { level, scenarioId } = body;
        const levelScenarios = CURRICULUM[level] ?? CURRICULUM[1];
        const scenario = levelScenarios.find((s) => s.id === scenarioId) ?? levelScenarios[0];

        // System prompt is stored in messages[0] for evaluator context
        const aiResult = await callOpenAI([{ role: 'system', content: scenario.systemPrompt }]);
        if (!aiResult.ok) return err('OpenAI failed', aiResult.error);

        const parsed = parseJson(aiResult.content);
        const prompt = (parsed?.prompt as string) ?? 'Hello! What is your name?';
        const maxExchanges = MAX_EXCHANGES[level] ?? 6;
        const maxPossibleScore = maxExchanges * 10;

        const { data: newSession, error: dbErr } = await supabase
          .from('conversation_sessions')
          .insert({
            user_id: userId, level, scenario_id: scenario.id,
            messages: [
              { role: 'system', content: scenario.systemPrompt },
              { role: 'ai', content: prompt },
            ],
            score: 0, max_score: maxPossibleScore,
          })
          .select('id').single();

        if (dbErr) return err('DB insert failed', `${dbErr.message} — userId=${userId}`);
        return ok({ sessionId: newSession?.id, prompt, scenarioId: scenario.id, scenarioLabel: scenario.label, scenarioEmoji: scenario.emoji, maxExchanges, maxPossibleScore, exchangeCount: 0 });
      }

      // ── GENERATE FREE PLAY SESSION ──────────────────────────────────────────
      if (body.action === 'generate_free_play') {
        const { level } = body;
        const pool = FREE_PLAY_BY_LEVEL[level] ?? FREE_PLAY_BY_LEVEL[3];
        const topic = pickRandom(pool.topics);
        const persona = pickRandom(pool.personas);
        const systemPrompt = buildFreePlaySystemPrompt(topic, persona, level);

        const aiResult = await callOpenAI([{ role: 'system', content: systemPrompt }]);
        if (!aiResult.ok) return err('OpenAI failed', aiResult.error);

        const parsed = parseJson(aiResult.content);
        const prompt = (parsed?.prompt as string) ?? `Hi! Let's talk about ${topic}.`;
        const maxExchanges = Math.min(MAX_EXCHANGES[level] ?? 6, 6); // free play capped at 6
        const maxPossibleScore = maxExchanges * 10;

        const { data: newSession, error: dbErr } = await supabase
          .from('conversation_sessions')
          .insert({
            user_id: userId, level, scenario_id: 'free_play',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'ai', content: prompt },
            ],
            score: 0, max_score: maxPossibleScore,
          })
          .select('id').single();

        if (dbErr) return err('DB insert failed', dbErr.message);
        return ok({ sessionId: newSession?.id, prompt, scenarioId: 'free_play', scenarioLabel: topic, scenarioEmoji: '🎲', topic, persona, maxExchanges, maxPossibleScore, exchangeCount: 0 });
      }

      // ── GET HINTS ───────────────────────────────────────────────────────────
      if (body.action === 'get_hints') {
        const { currentPrompt } = body;
        if (!currentPrompt) return err('Missing currentPrompt');
        const aiResult = await callOpenAI([
          { role: 'system', content: HINTS_PROMPT },
          { role: 'user', content: `AI asked: "${currentPrompt}"` },
        ], 0.8);
        if (!aiResult.ok) return err('Hints failed', aiResult.error);
        const parsed = parseJson(aiResult.content);
        return ok({ hints: (parsed?.hints as string[]) ?? [] });
      }

      // ── TEXT REPLY ──────────────────────────────────────────────────────────
      if (body.action === 'text_reply') {
        const { sessionId, transcript, exchangeCount, maxExchanges } = body;
        if (!sessionId || !transcript) return err('Missing sessionId or transcript');
        const isLast = (exchangeCount ?? 0) + 1 >= (maxExchanges ?? 6);
        const result = await evaluateAndRespond(supabase, sessionId, userId, transcript, isLast);
        if ('error' in result) return err('Evaluation failed', result.error as string);
        return ok(result as Record<string, unknown>);
      }

      // ── END SESSION EARLY ───────────────────────────────────────────────────
      if (body.action === 'end_session') {
        const { sessionId } = body;
        if (!sessionId) return err('Missing sessionId');
        const { data: row } = await supabase.from('conversation_sessions').select('messages, score, max_score').eq('id', sessionId).single();
        if (!row) return err('Session not found');

        const messages = (row.messages ?? []) as Array<{ role: string; content: string }>;
        const exchangeCount = messages.filter((m) => m.role === 'user').length;
        if (exchangeCount === 0) { // Nothing to save
          await supabase.from('conversation_sessions').delete().eq('id', sessionId);
          return ok({ ended: true });
        }

        // Generate a closing message
        const lastAiMsg = [...messages].reverse().find((m) => m.role === 'ai')?.content ?? '';
        const closingResult = await callOpenAI([
          { role: 'system', content: 'You are a warm English tutor. Write a short, encouraging closing message for this conversation (2 sentences max). Return ONLY valid JSON: { "prompt": "..." }' },
          { role: 'user', content: `The last AI message was: "${lastAiMsg}". The learner ended the session early.` },
        ], 0.7);

        let closingMsg = 'Great effort today! Come back anytime to keep practicing.';
        if (closingResult.ok) {
          const parsed = parseJson(closingResult.content);
          closingMsg = (parsed?.prompt as string) ?? closingMsg;
        }

        const newMessages = [...messages, { role: 'ai', content: closingMsg }];
        await supabase.from('conversation_sessions').update({
          messages: newMessages,
          completed_at: new Date().toISOString(),
        }).eq('id', sessionId);

        return ok({ ended: true, closingMessage: closingMsg, sessionScore: row.score as number, maxPossibleScore: row.max_score as number });
      }

      return err('Unknown action: ' + body.action);
    }

    // ── VOICE REPLY ────────────────────────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const audioFile = formData.get('file') as File | null;
      const sessionId = formData.get('sessionId') as string | null;
      const userId: string | undefined = jwtUserId ?? (formData.get('userId') as string) ?? undefined;
      const exchangeCount = parseInt(formData.get('exchangeCount') as string ?? '0', 10);
      const maxExchanges = parseInt(formData.get('maxExchanges') as string ?? '6', 10);

      if (!audioFile) return err('Missing audio file');
      if (!sessionId) return err('Missing sessionId');
      if (!userId) return err('Not authenticated');

      const whisperForm = new FormData();
      whisperForm.append('file', audioFile, 'recording.m4a');
      whisperForm.append('model', 'whisper-1');
      whisperForm.append('language', 'en');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: whisperForm,
      });
      if (!whisperRes.ok) return err('Whisper failed', `${whisperRes.status}`);

      const transcript: string = (await whisperRes.json()).text ?? '';
      if (!transcript) return err('Empty transcript — speak clearly and try again');

      const isLast = exchangeCount + 1 >= maxExchanges;
      const result = await evaluateAndRespond(supabase, sessionId, userId, transcript, isLast);
      if ('error' in result) return err('Evaluation failed', result.error as string);
      return ok(result as Record<string, unknown>);
    }

    return err(`Unsupported content-type: ${contentType}`);
  } catch (e: any) {
    return err('Unhandled error', e?.message ?? String(e));
  }
});
