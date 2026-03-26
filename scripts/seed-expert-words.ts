/**
 * Seed expert-level (difficulty 4-5) words with specific names.
 * Also uses GPT-4 Vision to auto-label any existing words with null/generic word labels.
 *
 * Run: npx tsx scripts/seed-expert-words.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

// ─── Expert words to insert (difficulty 4-5) ─────────────────────────────────
const EXPERT_WORDS = [
  // Animals — specific species
  { word: 'tyrannosaurus', topic: 'animals', difficulty: 5, search: 'tyrannosaurus rex dinosaur' },
  { word: 'stegosaurus', topic: 'animals', difficulty: 5, search: 'stegosaurus dinosaur' },
  { word: 'brachiosaurus', topic: 'animals', difficulty: 5, search: 'brachiosaurus dinosaur' },
  { word: 'triceratops', topic: 'animals', difficulty: 4, search: 'triceratops dinosaur' },
  { word: 'chimpanzee', topic: 'animals', difficulty: 4, search: 'chimpanzee primate' },
  { word: 'flamingo', topic: 'animals', difficulty: 4, search: 'flamingo bird pink' },
  { word: 'chameleon', topic: 'animals', difficulty: 5, search: 'chameleon lizard colorful' },
  { word: 'platypus', topic: 'animals', difficulty: 5, search: 'platypus animal' },
  { word: 'axolotl', topic: 'animals', difficulty: 5, search: 'axolotl amphibian' },
  { word: 'capybara', topic: 'animals', difficulty: 4, search: 'capybara rodent' },

  // Food — specific dishes
  { word: 'eggs benedict', topic: 'food', difficulty: 4, search: 'eggs benedict brunch' },
  { word: 'croissant', topic: 'food', difficulty: 4, search: 'croissant pastry french' },
  { word: 'avocado toast', topic: 'food', difficulty: 4, search: 'avocado toast breakfast' },
  { word: 'tiramisu', topic: 'food', difficulty: 5, search: 'tiramisu italian dessert' },
  { word: 'bruschetta', topic: 'food', difficulty: 5, search: 'bruschetta italian appetizer' },
  { word: 'paella', topic: 'food', difficulty: 5, search: 'paella spanish rice seafood' },
  { word: 'ramen', topic: 'food', difficulty: 4, search: 'ramen japanese noodle soup' },
  { word: 'dim sum', topic: 'food', difficulty: 4, search: 'dim sum chinese dumplings' },
  { word: 'baguette', topic: 'food', difficulty: 4, search: 'baguette french bread' },
  { word: 'macaron', topic: 'food', difficulty: 4, search: 'macaron french cookie colorful' },

  // Transport — specific vehicles
  { word: 'submarine', topic: 'transport', difficulty: 4, search: 'submarine underwater vessel' },
  { word: 'gondola', topic: 'transport', difficulty: 5, search: 'gondola venice boat' },
  { word: 'cable car', topic: 'transport', difficulty: 4, search: 'cable car aerial tram' },
  { word: 'hovercraft', topic: 'transport', difficulty: 5, search: 'hovercraft vehicle' },
  { word: 'monorail', topic: 'transport', difficulty: 4, search: 'monorail train elevated' },

  // Nature — specific phenomena
  { word: 'aurora borealis', topic: 'nature', difficulty: 5, search: 'northern lights aurora borealis' },
  { word: 'stalactite', topic: 'nature', difficulty: 5, search: 'stalactite cave formation' },
  { word: 'geothermal geyser', topic: 'nature', difficulty: 5, search: 'geyser yellowstone erupting' },
  { word: 'mangrove', topic: 'nature', difficulty: 4, search: 'mangrove forest tropical' },
  { word: 'fjord', topic: 'nature', difficulty: 4, search: 'fjord norway scenic' },

  // Clothes — specific items
  { word: 'kimono', topic: 'clothes', difficulty: 4, search: 'kimono japanese traditional clothing' },
  { word: 'turban', topic: 'clothes', difficulty: 4, search: 'turban head wrap traditional' },
  { word: 'kilt', topic: 'clothes', difficulty: 4, search: 'kilt scottish traditional' },
  { word: 'beret', topic: 'clothes', difficulty: 4, search: 'beret french hat' },
  { word: 'trench coat', topic: 'clothes', difficulty: 4, search: 'trench coat fashion' },
];

async function getTopicId(topicName: string): Promise<string | null> {
  const { data } = await supabase
    .from('topics')
    .select('id')
    .ilike('name', `%${topicName}%`)
    .limit(1)
    .single();
  return data?.id ?? null;
}

async function getPexelsImage(query: string): Promise<string | null> {
  const PEXELS_KEY = process.env.PEXELS_API_KEY!;
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=square`, {
    headers: { Authorization: PEXELS_KEY },
  });
  const json = await res.json() as any;
  return json.photos?.[0]?.src?.medium ?? null;
}

async function labelImageWithGPT4Vision(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is the most specific English noun that describes the main subject of this image? Reply with ONLY the noun or short noun phrase (2-3 words max), no punctuation, no explanation. Be specific: prefer "golden retriever" over "dog", "tyrannosaurus" over "dinosaur", "eggs benedict" over "food".',
            },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          ],
        }],
        max_tokens: 20,
        response_format: { type: 'text' },
      }),
    });
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content?.trim()?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('🌱 Seeding expert-level words...\n');

  // ── 1. Insert new expert words ──────────────────────────────────────────────
  for (const w of EXPERT_WORDS) {
    const topicId = await getTopicId(w.topic);
    if (!topicId) {
      console.log(`  ⚠️  Topic not found: ${w.topic} — skipping ${w.word}`);
      continue;
    }

    // Skip if word already exists
    const { data: existing } = await supabase
      .from('words')
      .select('id')
      .eq('topic_id', topicId)
      .ilike('word', w.word)
      .limit(1)
      .single();
    if (existing) {
      console.log(`  ↩️  Already exists: ${w.word}`);
      continue;
    }

    const imageUrl = await getPexelsImage(w.search);
    const { error } = await supabase.from('words').insert({
      topic_id: topicId,
      word: w.word,
      difficulty_score: w.difficulty,
      image_url: imageUrl,
      audio_url: null,
    });
    if (error) {
      console.log(`  ❌ Failed: ${w.word} — ${error.message}`);
    } else {
      console.log(`  ✅ Inserted: ${w.word} (diff=${w.difficulty})${imageUrl ? ' + image' : ''}`);
    }
  }

  // ── 2. AI-label existing words with null/short/generic word names ───────────
  console.log('\n🤖 AI-labeling unlabeled images with GPT-4 Vision...\n');

  const { data: unlabeled } = await supabase
    .from('words')
    .select('id, word, image_url')
    .not('image_url', 'is', null)
    .in('word', ['', 'image', 'photo', 'picture', 'unknown'])
    .limit(20);

  if (unlabeled && unlabeled.length > 0) {
    for (const row of unlabeled) {
      const label = await labelImageWithGPT4Vision(row.image_url!);
      if (label) {
        await supabase.from('words').update({ word: label }).eq('id', row.id);
        console.log(`  🏷️  Labeled: ${row.id} → "${label}"`);
      }
    }
  } else {
    console.log('  No unlabeled words found — all good!');
  }

  // ── 3. Re-label low-difficulty words that have images with generic names ────
  console.log('\n🔍 Upgrading generic names using Vision on high-difficulty words...\n');

  const genericNames = ['dinosaur', 'animal', 'food', 'vehicle', 'plant', 'bird', 'fish', 'fruit', 'vegetable'];
  const { data: generic } = await supabase
    .from('words')
    .select('id, word, image_url, difficulty_score')
    .not('image_url', 'is', null)
    .in('word', genericNames)
    .gte('difficulty_score', 3)
    .limit(20);

  if (generic && generic.length > 0) {
    for (const row of generic) {
      const label = await labelImageWithGPT4Vision(row.image_url!);
      if (label && label !== row.word) {
        await supabase.from('words').update({ word: label }).eq('id', row.id);
        console.log(`  🔄 Upgraded: "${row.word}" → "${label}"`);
      }
    }
  } else {
    console.log('  No generic names found to upgrade.');
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
