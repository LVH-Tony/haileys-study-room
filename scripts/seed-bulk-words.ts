#!/usr/bin/env npx tsx
/**
 * Bulk word seeder — THINGS dataset first, Pexels fallback.
 *
 * THINGS: https://things-initiative.org/  (download and set THINGS_DIR)
 *   Structure expected: THINGS_DIR/images/{concept}/{concept}_01.jpg ...
 *   If THINGS_DIR is not set, all images come from Pexels.
 *
 * Run:
 *   THINGS_DIR=/path/to/things npx tsx scripts/seed-bulk-words.ts
 *   npx tsx scripts/seed-bulk-words.ts          # Pexels-only mode
 */
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const PEXELS_KEY   = process.env.PEXELS_API_KEY!;
const GCS_BUCKET   = process.env.GCS_BUCKET!;
const GCS_CREDS    = process.env.GCS_CREDENTIALS_PATH!;
const GCS_PROJECT  = process.env.GCS_PROJECT_ID!;
const THINGS_DIR   = process.env.THINGS_DIR ?? '';     // optional
const OPENAI_KEY   = process.env.OPENAI_API_KEY!;

const gcs = new Storage({ projectId: GCS_PROJECT, keyFilename: GCS_CREDS });
const bucket = gcs.bucket(GCS_BUCKET);

// ── WORD CATALOGUE ────────────────────────────────────────────────────────────
// Each entry: { word, topic_id, difficulty (1-5), pexels_query? }
// pexels_query only needed if the word itself won't give good search results.
const TOPIC = {
  animals:    '11111111-0000-0000-0000-000000000001',
  food:       '11111111-0000-0000-0000-000000000002',
  colors:     '11111111-0000-0000-0000-000000000003',
  numbers:    '11111111-0000-0000-0000-000000000004',
  family:     '11111111-0000-0000-0000-000000000005',
  body_parts: '11111111-0000-0000-0000-000000000006',
  clothes:    '11111111-0000-0000-0000-000000000007',
  weather:    '11111111-0000-0000-0000-000000000008',
};

interface WordEntry { word: string; topic: keyof typeof TOPIC; d: number; q?: string; }

const WORDS: WordEntry[] = [
  // ── ANIMALS ────────────────────────────────────────────────────────────────
  { word: 'cat',          topic: 'animals',    d: 1 },
  { word: 'dog',          topic: 'animals',    d: 1 },
  { word: 'bird',         topic: 'animals',    d: 1 },
  { word: 'fish',         topic: 'animals',    d: 1 },
  { word: 'rabbit',       topic: 'animals',    d: 1 },
  { word: 'elephant',     topic: 'animals',    d: 2 },
  { word: 'lion',         topic: 'animals',    d: 2 },
  { word: 'tiger',        topic: 'animals',    d: 2 },
  { word: 'giraffe',      topic: 'animals',    d: 2 },
  { word: 'monkey',       topic: 'animals',    d: 2 },
  { word: 'bear',         topic: 'animals',    d: 2 },
  { word: 'horse',        topic: 'animals',    d: 2 },
  { word: 'cow',          topic: 'animals',    d: 1 },
  { word: 'sheep',        topic: 'animals',    d: 1 },
  { word: 'pig',          topic: 'animals',    d: 1 },
  { word: 'duck',         topic: 'animals',    d: 1 },
  { word: 'frog',         topic: 'animals',    d: 2 },
  { word: 'butterfly',    topic: 'animals',    d: 2 },
  { word: 'snake',        topic: 'animals',    d: 2 },
  { word: 'turtle',       topic: 'animals',    d: 2 },
  { word: 'penguin',      topic: 'animals',    d: 2 },
  { word: 'dolphin',      topic: 'animals',    d: 3 },
  { word: 'shark',        topic: 'animals',    d: 3 },
  { word: 'whale',        topic: 'animals',    d: 3 },
  { word: 'parrot',       topic: 'animals',    d: 3 },
  { word: 'octopus',      topic: 'animals',    d: 3 },
  { word: 'crocodile',    topic: 'animals',    d: 3 },
  { word: 'zebra',        topic: 'animals',    d: 3 },
  { word: 'kangaroo',     topic: 'animals',    d: 3 },
  { word: 'panda',        topic: 'animals',    d: 3 },
  { word: 'fox',          topic: 'animals',    d: 3 },
  { word: 'wolf',         topic: 'animals',    d: 3 },
  { word: 'deer',         topic: 'animals',    d: 3 },
  { word: 'owl',          topic: 'animals',    d: 3 },
  { word: 'flamingo',     topic: 'animals',    d: 4 },
  { word: 'chimpanzee',   topic: 'animals',    d: 4 },
  { word: 'capybara',     topic: 'animals',    d: 4 },
  { word: 'platypus',     topic: 'animals',    d: 5 },
  { word: 'axolotl',      topic: 'animals',    d: 5 },
  { word: 'chameleon',    topic: 'animals',    d: 5 },
  { word: 'narwhal',      topic: 'animals',    d: 5, q: 'narwhal whale' },
  { word: 'mandrill',     topic: 'animals',    d: 5, q: 'mandrill baboon monkey' },
  { word: 'pangolin',     topic: 'animals',    d: 5, q: 'pangolin scaled animal' },

  // ── FOOD ───────────────────────────────────────────────────────────────────
  { word: 'apple',        topic: 'food',       d: 1 },
  { word: 'banana',       topic: 'food',       d: 1 },
  { word: 'egg',          topic: 'food',       d: 1 },
  { word: 'milk',         topic: 'food',       d: 1 },
  { word: 'bread',        topic: 'food',       d: 1 },
  { word: 'rice',         topic: 'food',       d: 1 },
  { word: 'pizza',        topic: 'food',       d: 1 },
  { word: 'salad',        topic: 'food',       d: 2 },
  { word: 'soup',         topic: 'food',       d: 2 },
  { word: 'chicken',      topic: 'food',       d: 2, q: 'roast chicken dish food' },
  { word: 'cake',         topic: 'food',       d: 2 },
  { word: 'cookie',       topic: 'food',       d: 2 },
  { word: 'sandwich',     topic: 'food',       d: 2 },
  { word: 'burger',       topic: 'food',       d: 2, q: 'hamburger burger food' },
  { word: 'orange',       topic: 'food',       d: 1, q: 'orange fruit' },
  { word: 'strawberry',   topic: 'food',       d: 2 },
  { word: 'watermelon',   topic: 'food',       d: 2 },
  { word: 'broccoli',     topic: 'food',       d: 3 },
  { word: 'carrot',       topic: 'food',       d: 2 },
  { word: 'potato',       topic: 'food',       d: 2 },
  { word: 'tomato',       topic: 'food',       d: 2 },
  { word: 'corn',         topic: 'food',       d: 2 },
  { word: 'pasta',        topic: 'food',       d: 2 },
  { word: 'sushi',        topic: 'food',       d: 3 },
  { word: 'tacos',        topic: 'food',       d: 3 },
  { word: 'pancakes',     topic: 'food',       d: 3 },
  { word: 'donut',        topic: 'food',       d: 2 },
  { word: 'ice cream',    topic: 'food',       d: 2, q: 'ice cream scoop cone' },
  { word: 'croissant',    topic: 'food',       d: 4 },
  { word: 'ramen',        topic: 'food',       d: 4, q: 'ramen noodle soup bowl Japanese' },
  { word: 'baguette',     topic: 'food',       d: 4, q: 'baguette French bread loaf' },
  { word: 'macaron',      topic: 'food',       d: 4, q: 'macaron French cookie pastel' },
  { word: 'dim sum',      topic: 'food',       d: 4, q: 'dim sum dumplings Chinese' },
  { word: 'paella',       topic: 'food',       d: 5, q: 'paella Spanish rice seafood' },
  { word: 'tiramisu',     topic: 'food',       d: 5, q: 'tiramisu Italian dessert' },
  { word: 'pho',          topic: 'food',       d: 4, q: 'pho Vietnamese noodle soup' },
  { word: 'gyoza',        topic: 'food',       d: 4, q: 'gyoza Japanese dumpling' },
  { word: 'bibimbap',     topic: 'food',       d: 5, q: 'bibimbap Korean rice bowl' },
  { word: 'avocado toast', topic: 'food',      d: 4, q: 'avocado toast breakfast plate' },
  { word: 'bruschetta',   topic: 'food',       d: 5, q: 'bruschetta Italian tomato bread' },
  { word: 'eggs benedict', topic: 'food',      d: 4, q: 'eggs benedict brunch hollandaise' },

  // ── COLORS ─────────────────────────────────────────────────────────────────
  { word: 'red',          topic: 'colors',     d: 1, q: 'red color background solid' },
  { word: 'blue',         topic: 'colors',     d: 1, q: 'blue color background solid' },
  { word: 'green',        topic: 'colors',     d: 1, q: 'green color background solid' },
  { word: 'yellow',       topic: 'colors',     d: 1, q: 'yellow color background solid' },
  { word: 'orange',       topic: 'colors',     d: 1, q: 'orange color background solid' },
  { word: 'purple',       topic: 'colors',     d: 1, q: 'purple color background solid' },
  { word: 'pink',         topic: 'colors',     d: 1, q: 'pink color background solid' },
  { word: 'black',        topic: 'colors',     d: 1, q: 'black color background solid' },
  { word: 'white',        topic: 'colors',     d: 1, q: 'white color background solid' },
  { word: 'brown',        topic: 'colors',     d: 2, q: 'brown color background solid' },
  { word: 'gray',         topic: 'colors',     d: 2, q: 'gray grey color background' },
  { word: 'gold',         topic: 'colors',     d: 3, q: 'gold color metallic' },
  { word: 'silver',       topic: 'colors',     d: 3, q: 'silver color metallic' },
  { word: 'turquoise',    topic: 'colors',     d: 4, q: 'turquoise color teal' },
  { word: 'crimson',      topic: 'colors',     d: 4, q: 'crimson deep red color' },
  { word: 'magenta',      topic: 'colors',     d: 4, q: 'magenta pink purple color' },
  { word: 'chartreuse',   topic: 'colors',     d: 5, q: 'chartreuse yellow green color' },

  // ── NUMBERS ────────────────────────────────────────────────────────────────
  { word: 'one',          topic: 'numbers',    d: 1, q: 'number one 1 digit' },
  { word: 'two',          topic: 'numbers',    d: 1, q: 'number two 2 digit' },
  { word: 'three',        topic: 'numbers',    d: 1, q: 'number three 3 digit' },
  { word: 'four',         topic: 'numbers',    d: 1, q: 'number four 4 digit' },
  { word: 'five',         topic: 'numbers',    d: 1, q: 'number five 5 digit' },
  { word: 'six',          topic: 'numbers',    d: 1, q: 'number six 6 digit' },
  { word: 'seven',        topic: 'numbers',    d: 1, q: 'number seven 7 digit' },
  { word: 'eight',        topic: 'numbers',    d: 1, q: 'number eight 8 digit' },
  { word: 'nine',         topic: 'numbers',    d: 1, q: 'number nine 9 digit' },
  { word: 'ten',          topic: 'numbers',    d: 1, q: 'number ten 10 digit' },
  { word: 'twenty',       topic: 'numbers',    d: 2, q: 'number twenty 20 written' },
  { word: 'hundred',      topic: 'numbers',    d: 2, q: 'number hundred 100 written' },
  { word: 'zero',         topic: 'numbers',    d: 2, q: 'number zero 0 digit' },

  // ── FAMILY ─────────────────────────────────────────────────────────────────
  { word: 'mother',       topic: 'family',     d: 1, q: 'mother mom woman family' },
  { word: 'father',       topic: 'family',     d: 1, q: 'father dad man family' },
  { word: 'baby',         topic: 'family',     d: 1, q: 'baby infant cute' },
  { word: 'sister',       topic: 'family',     d: 1, q: 'sisters girls siblings' },
  { word: 'brother',      topic: 'family',     d: 1, q: 'brothers boys siblings' },
  { word: 'grandmother',  topic: 'family',     d: 2, q: 'grandmother grandma elderly woman' },
  { word: 'grandfather',  topic: 'family',     d: 2, q: 'grandfather grandpa elderly man' },
  { word: 'family',       topic: 'family',     d: 1, q: 'family portrait happy together' },
  { word: 'daughter',     topic: 'family',     d: 3, q: 'daughter girl child parent' },
  { word: 'son',          topic: 'family',     d: 3, q: 'son boy child parent' },
  { word: 'uncle',        topic: 'family',     d: 3, q: 'uncle man family relative' },
  { word: 'aunt',         topic: 'family',     d: 3, q: 'aunt woman family relative' },
  { word: 'cousin',       topic: 'family',     d: 3, q: 'cousins children family' },
  { word: 'twins',        topic: 'family',     d: 3, q: 'twins identical children' },
  { word: 'newborn',      topic: 'family',     d: 4, q: 'newborn baby hospital wrapped' },

  // ── BODY PARTS ─────────────────────────────────────────────────────────────
  { word: 'eye',          topic: 'body_parts', d: 1, q: 'human eye close up' },
  { word: 'nose',         topic: 'body_parts', d: 1, q: 'nose face close up' },
  { word: 'mouth',        topic: 'body_parts', d: 1, q: 'mouth lips smile' },
  { word: 'ear',          topic: 'body_parts', d: 1, q: 'ear human side profile' },
  { word: 'hand',         topic: 'body_parts', d: 1, q: 'hand palm fingers' },
  { word: 'foot',         topic: 'body_parts', d: 1, q: 'foot bare feet' },
  { word: 'arm',          topic: 'body_parts', d: 2, q: 'arm muscle human' },
  { word: 'leg',          topic: 'body_parts', d: 2, q: 'leg human standing' },
  { word: 'hair',         topic: 'body_parts', d: 1, q: 'hair flowing long' },
  { word: 'teeth',        topic: 'body_parts', d: 2, q: 'teeth smile white clean' },
  { word: 'tongue',       topic: 'body_parts', d: 2, q: 'tongue mouth open' },
  { word: 'finger',       topic: 'body_parts', d: 2, q: 'finger pointing hand' },
  { word: 'thumb',        topic: 'body_parts', d: 2, q: 'thumb up hand gesture' },
  { word: 'shoulder',     topic: 'body_parts', d: 3, q: 'shoulder human anatomy' },
  { word: 'knee',         topic: 'body_parts', d: 3, q: 'knee leg human' },
  { word: 'elbow',        topic: 'body_parts', d: 3, q: 'elbow arm bent' },
  { word: 'forehead',     topic: 'body_parts', d: 3, q: 'forehead face upper' },
  { word: 'chin',         topic: 'body_parts', d: 3, q: 'chin jaw face lower' },
  { word: 'cheek',        topic: 'body_parts', d: 3, q: 'cheek face side rosy' },
  { word: 'eyebrow',      topic: 'body_parts', d: 3, q: 'eyebrow face expression' },

  // ── CLOTHES ────────────────────────────────────────────────────────────────
  { word: 'shirt',        topic: 'clothes',    d: 1, q: 'shirt clothing laid flat' },
  { word: 'pants',        topic: 'clothes',    d: 1, q: 'pants jeans trousers' },
  { word: 'dress',        topic: 'clothes',    d: 1, q: 'dress woman fashion' },
  { word: 'shoes',        topic: 'clothes',    d: 1, q: 'shoes pair sneakers' },
  { word: 'hat',          topic: 'clothes',    d: 1, q: 'hat cap style' },
  { word: 'jacket',       topic: 'clothes',    d: 2, q: 'jacket coat fashion' },
  { word: 'socks',        topic: 'clothes',    d: 2, q: 'socks pair colorful' },
  { word: 'sweater',      topic: 'clothes',    d: 2, q: 'sweater knit cozy' },
  { word: 'skirt',        topic: 'clothes',    d: 2, q: 'skirt fashion woman' },
  { word: 'scarf',        topic: 'clothes',    d: 2, q: 'scarf winter wrap' },
  { word: 'gloves',       topic: 'clothes',    d: 2, q: 'gloves winter pair hands' },
  { word: 'boots',        topic: 'clothes',    d: 2, q: 'boots leather fashion' },
  { word: 'tie',          topic: 'clothes',    d: 3, q: 'necktie formal suit' },
  { word: 'cardigan',     topic: 'clothes',    d: 3, q: 'cardigan knit sweater open' },
  { word: 'beret',        topic: 'clothes',    d: 4, q: 'beret hat French style' },
  { word: 'kimono',       topic: 'clothes',    d: 4, q: 'kimono Japanese traditional' },
  { word: 'kilt',         topic: 'clothes',    d: 4, q: 'kilt Scottish tartan plaid' },
  { word: 'turban',       topic: 'clothes',    d: 4, q: 'turban head wrap traditional' },
  { word: 'dungarees',    topic: 'clothes',    d: 4, q: 'dungarees overalls denim' },
  { word: 'trench coat',  topic: 'clothes',    d: 4, q: 'trench coat beige fashion' },
  { word: 'windbreaker',  topic: 'clothes',    d: 4, q: 'windbreaker jacket nylon colorful' },
  { word: 'turtleneck',   topic: 'clothes',    d: 4, q: 'turtleneck sweater roll neck' },

  // ── WEATHER ────────────────────────────────────────────────────────────────
  { word: 'sunny',        topic: 'weather',    d: 1, q: 'sunny day bright blue sky' },
  { word: 'rain',         topic: 'weather',    d: 1, q: 'rain drops puddle wet' },
  { word: 'snow',         topic: 'weather',    d: 1, q: 'snow winter landscape white' },
  { word: 'wind',         topic: 'weather',    d: 2, q: 'strong wind leaves blowing' },
  { word: 'cloud',        topic: 'weather',    d: 1, q: 'clouds sky fluffy' },
  { word: 'rainbow',      topic: 'weather',    d: 2, q: 'rainbow after rain sky colorful' },
  { word: 'storm',        topic: 'weather',    d: 2, q: 'thunderstorm lightning dramatic sky' },
  { word: 'fog',          topic: 'weather',    d: 3, q: 'foggy morning misty atmosphere' },
  { word: 'thunder',      topic: 'weather',    d: 3, q: 'thunderstorm lightning bolt' },
  { word: 'hail',         topic: 'weather',    d: 3, q: 'hailstorm ice hail ground' },
  { word: 'tornado',      topic: 'weather',    d: 4, q: 'tornado funnel cloud dramatic' },
  { word: 'blizzard',     topic: 'weather',    d: 4, q: 'blizzard snowstorm whiteout' },
  { word: 'dust storm',   topic: 'weather',    d: 5, q: 'dust storm haboob desert' },
];

// ── THINGS concept matching ───────────────────────────────────────────────────
function findThingsImage(word: string): string | null {
  if (!THINGS_DIR) return null;
  const imagesDir = path.join(THINGS_DIR, 'images');
  if (!fs.existsSync(imagesDir)) return null;

  // Try exact match, then first word of phrase
  const candidates = [
    word.toLowerCase().replace(/\s+/g, '_'),
    word.toLowerCase().replace(/\s+/g, ' '),
    word.toLowerCase().split(' ')[0],
  ];

  for (const c of candidates) {
    const conceptDir = path.join(imagesDir, c);
    if (fs.existsSync(conceptDir)) {
      const files = fs.readdirSync(conceptDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
      if (files.length > 0) {
        // Pick the first image (THINGS images are all high quality)
        return path.join(conceptDir, files[0]);
      }
    }
  }
  return null;
}

// ── Upload to GCS ─────────────────────────────────────────────────────────────
async function uploadToGcs(sourceBuffer: Buffer, word: string, ext: string): Promise<string> {
  const safeName = word.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dest = `words/${safeName}_${Date.now()}.${ext}`;
  const file = bucket.file(dest);
  await file.save(sourceBuffer, { metadata: { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` } });
  // Bucket has uniform IAM public read — no per-file ACL needed
  return `https://storage.googleapis.com/${GCS_BUCKET}/${dest}`;
}

// ── Pexels fallback ───────────────────────────────────────────────────────────
async function fetchPexels(query: string): Promise<Buffer | null> {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=square`,
    { headers: { Authorization: PEXELS_KEY } }
  );
  if (!res.ok) return null;
  const data: any = await res.json();
  const photo = data.photos?.[0];
  if (!photo) return null;
  const imgRes = await fetch(photo.src.medium);
  if (!imgRes.ok) return null;
  return Buffer.from(await imgRes.arrayBuffer());
}

// ── Get short definition ──────────────────────────────────────────────────────
async function getDefinition(word: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a children\'s English dictionary. Give a single short, simple definition (max 10 words) for beginners aged 5-12. Just the definition, no punctuation at end.' },
        { role: 'user', content: word },
      ],
      max_tokens: 30,
      temperature: 0.2,
    }),
  });
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 Starting bulk word seed`);
  console.log(`📁 THINGS dir: ${THINGS_DIR || '(not set — Pexels only)'}`);

  // Get existing words to skip
  const { data: existing } = await supabase.from('words').select('word, topic_id');
  const existingSet = new Set((existing ?? []).map((w) => `${w.topic_id}:${w.word.toLowerCase()}`));
  console.log(`✅ ${existingSet.size} words already in DB, will skip\n`);

  let inserted = 0, skipped = 0, failed = 0;

  for (const entry of WORDS) {
    const topicId = TOPIC[entry.topic];
    const key = `${topicId}:${entry.word.toLowerCase()}`;

    if (existingSet.has(key)) { skipped++; continue; }

    process.stdout.write(`  Processing "${entry.word}"... `);

    try {
      let imageUrl: string | null = null;

      // 1. Try THINGS
      const thingsPath = findThingsImage(entry.word);
      if (thingsPath) {
        const buf = fs.readFileSync(thingsPath);
        const ext = path.extname(thingsPath).slice(1).toLowerCase() || 'jpg';
        imageUrl = await uploadToGcs(buf, entry.word, ext);
        process.stdout.write(`[THINGS] `);
      } else {
        // 2. Pexels fallback
        const q = entry.q ?? entry.word;
        const buf = await fetchPexels(q);
        if (buf) {
          imageUrl = await uploadToGcs(buf, entry.word, 'jpg');
          process.stdout.write(`[Pexels] `);
        } else {
          process.stdout.write(`[no image] `);
        }
      }

      // 3. Definition
      const definition = await getDefinition(entry.word);

      // 4. Insert
      const { error } = await supabase.from('words').insert({
        topic_id: topicId,
        word: entry.word,
        image_url: imageUrl,
        definition,
        difficulty_score: entry.d,
      });

      if (error) {
        // Might be duplicate from a previous partial run
        if (error.code === '23505') { console.log('skip (dup)'); skipped++; }
        else { console.log(`❌ ${error.message}`); failed++; }
      } else {
        console.log(`✓`);
        inserted++;
        existingSet.add(key);
      }
    } catch (e: any) {
      console.log(`❌ ${e.message}`);
      failed++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n🎉 Done! inserted=${inserted} skipped=${skipped} failed=${failed}`);
}

main().catch(console.error);
