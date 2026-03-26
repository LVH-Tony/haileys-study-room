#!/usr/bin/env npx tsx
/**
 * Fill missing word definitions using GPT-4o-mini.
 * Run: npx tsx scripts/fill-definitions.ts
 */
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getDefinition(word: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a children\'s English dictionary. Give a single short, simple definition (max 12 words) suitable for beginners aged 5-12. No punctuation at the end. Just the definition.' },
      { role: 'user', content: word },
    ],
    max_tokens: 40,
    temperature: 0.3,
  });
  return res.choices[0].message.content?.trim() ?? '';
}

async function main() {
  const { data: words, error } = await supabase
    .from('words').select('id, word').is('definition', null).limit(200);

  if (error) { console.error(error); process.exit(1); }
  console.log(`Filling definitions for ${words?.length ?? 0} words...`);

  let done = 0;
  for (const w of words ?? []) {
    const definition = await getDefinition(w.word);
    await supabase.from('words').update({ definition }).eq('id', w.id);
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${words?.length} done`);
    await new Promise((r) => setTimeout(r, 200)); // rate limit
  }
  console.log('All done!');
}

main();
