#!/usr/bin/env npx tsx
/**
 * THINGS dataset importer — no local files needed.
 *
 * Downloads the concept metadata TSV directly from OSF, then for each of the
 * ~1,854 concepts it:
 *   1. Maps the THINGS human-rated category → one of our Supabase topics
 *   2. Downloads the example image from Imgur
 *   3. Uploads it to GCS (skips if already exists)
 *   4. Generates a short, beginner-friendly definition via GPT-4o-mini
 *      (falls back to the WordNet definition already in the TSV)
 *   5. Upserts the word into Supabase
 *
 * Resume-safe: words already in the DB (by word + topic_id) are skipped.
 * Pexels fallback: used if the Imgur image download fails.
 *
 * Usage:
 *   npx tsx scripts/import-things.ts
 *   npx tsx scripts/import-things.ts 2>&1 | tee import-log.txt   # with log
 */
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY   = process.env.OPENAI_API_KEY!;
const GCS_BUCKET   = process.env.GCS_BUCKET!;
const GCS_CREDS    = process.env.GCS_CREDENTIALS_PATH!;
const GCS_PROJECT  = process.env.GCS_PROJECT_ID!;
const PEXELS_KEY   = process.env.PEXELS_API_KEY!;

const THINGS_TSV_URL  = 'https://osf.io/download/um6a9/';
const CONCURRENCY     = 1;     // sequential — avoids Imgur/Pexels rate limits entirely
const RATE_MS         = 200;   // ms delay between DB upserts
const PEXELS_DELAY    = 20000; // ms between Pexels calls — keeps us under 180 req/hr (free tier = 200/hr)
const MIN_IMAGE_BYTES = 5000;  // reject images < 5 KB (Imgur "image removed" placeholder is ~1-2 KB)
const DEF_BATCH       = 60;    // words per GPT definition batch

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_KEY, OPENAI_KEY, GCS_BUCKET, GCS_CREDS, GCS_PROJECT })) {
  if (!v) { console.error(`❌  Missing env var: ${k}`); process.exit(1); }
}

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const storage  = new Storage({ keyFilename: GCS_CREDS, projectId: GCS_PROJECT });
const bucket   = storage.bucket(GCS_BUCKET);
const openai   = new OpenAI({ apiKey: OPENAI_KEY });

// ── Category → topic name mapping ─────────────────────────────────────────────
// Keys are substrings of the THINGS "Bottom-up Category" column (checked in order).
const CATEGORY_MAP: { match: string; topic: string }[] = [
  { match: 'fruit',              topic: 'Fruits' },
  { match: 'vegetable',         topic: 'Vegetables' },
  { match: 'food',              topic: 'Food' },
  { match: 'dessert',           topic: 'Food' },
  { match: 'drink',             topic: 'Food' },
  { match: 'animal',            topic: 'Animals' },
  { match: 'bird',              topic: 'Animals' },
  { match: 'insect',            topic: 'Animals' },
  { match: 'vehicle',           topic: 'Vehicles' },
  { match: 'part of car',       topic: 'Vehicles' },
  { match: 'furniture',         topic: 'Home' },
  { match: 'home decor',        topic: 'Home' },
  { match: 'kitchen',           topic: 'Kitchen' },
  { match: 'cooking',           topic: 'Kitchen' },
  { match: 'plant',             topic: 'Outdoor & Garden' },
  { match: 'garden',            topic: 'Outdoor & Garden' },
  { match: 'sports equipment',  topic: 'Sports' },
  { match: 'musical instrument',topic: 'Music' },
  { match: 'office supply',     topic: 'Art & Stationery' },
  { match: 'art supply',        topic: 'Art & Stationery' },
  { match: 'electronic',        topic: 'Electronics' },
  { match: 'clothing',          topic: 'Clothes' },
  { match: 'accessory',         topic: 'Accessories' },
  { match: 'jewelry',           topic: 'Accessories' },
  { match: 'tool',              topic: 'Tools' },
  { match: 'toy',               topic: 'Toys & Games' },
  { match: 'game',              topic: 'Toys & Games' },
  { match: 'body part',         topic: 'Body Parts' },
  { match: 'medical',           topic: 'Health & Medical' },
  { match: 'building',          topic: 'Buildings' },
  { match: 'architecture',      topic: 'Buildings' },
  { match: 'weapon',            topic: 'Objects' },
  { match: 'container',         topic: 'Objects' },
];

function mapCategory(thingsCategory: string): string {
  const lower = thingsCategory.toLowerCase();
  for (const { match, topic } of CATEGORY_MAP) {
    if (lower.includes(match)) return topic;
  }
  return 'Objects'; // catch-all
}

const THINGS_IMG_BASE = 'https://things-initiative.org/uploads/THINGS/images_resized';

// ── Parse THINGS TSV ──────────────────────────────────────────────────────────
interface ThingsConcept {
  word: string;       // human-readable, e.g. "air conditioner"
  uniqueId: string;   // filename-safe,  e.g. "air_conditioner"
  definition: string;
  category: string;
  thingsUrl: string;  // direct from THINGS server — no rate limits
  concreteness: number;
  percentKnown: number;
}

function parseTsv(raw: string): ThingsConcept[] {
  const lines = raw.split('\n').filter(Boolean);
  const header = lines[0].split('\t');
  const idx = {
    word:         header.indexOf('Word'),
    uniqueId:     header.indexOf('uniqueID'),
    definition:   header.indexOf('Definition (from WordNet, Google, or Wikipedia)'),
    category:     header.indexOf('Bottom-up Category (Human Raters)'),
    concreteness: header.indexOf('Concreteness (M)'),
    percentKnown: header.indexOf('Percent_known'),
  };

  const concepts: ThingsConcept[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const word     = cols[idx.word]?.trim();
    const uniqueId = cols[idx.uniqueId]?.trim();
    if (!word || !uniqueId) continue;

    // Primary image: served directly from THINGS Initiative server
    // Pattern: /uploads/THINGS/images_resized/{id}/{id}_primary.jpg
    const thingsUrl = `${THINGS_IMG_BASE}/${uniqueId}/${uniqueId}_primary.jpg`;

    concepts.push({
      word,
      uniqueId,
      definition: cols[idx.definition]?.trim() ?? '',
      category:   cols[idx.category]?.trim() ?? '',
      thingsUrl,
      concreteness: parseFloat(cols[idx.concreteness] ?? '3') || 3,
      percentKnown: parseFloat(cols[idx.percentKnown] ?? '0.5') || 0.5,
    });
  }
  return concepts;
}

// ── Difficulty 1–5 from concreteness + percent_known ─────────────────────────
function calcDifficulty(c: number, p: number): number {
  if (c >= 4.5 && p >= 0.7) return 1;
  if (c >= 4.0 && p >= 0.5) return 2;
  if (c >= 3.5 && p >= 0.3) return 3;
  if (c >= 3.0)             return 4;
  return 5;
}

// ── GCS upload ────────────────────────────────────────────────────────────────
async function uploadToGcs(fileName: string, data: Buffer, mime: string): Promise<string> {
  const file = bucket.file(`things/${fileName}`);
  const [exists] = await file.exists();
  if (exists) {
    return `https://storage.googleapis.com/${GCS_BUCKET}/things/${fileName}`;
  }
  await file.save(data, { contentType: mime, resumable: false });
  return `https://storage.googleapis.com/${GCS_BUCKET}/things/${fileName}`;
}

// ── Image fetchers ────────────────────────────────────────────────────────────

/** Fetch from THINGS Initiative server — the definitive source, no rate limits. */
async function fetchThings(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < MIN_IMAGE_BYTES) return null;
    return buf;
  } catch { return null; }
}

/** Pexels fallback — rate-limited to stay under 180 req/hr (free tier = 200/hr). */
let lastPexelsCall = 0;
async function fetchPexels(word: string): Promise<Buffer | null> {
  if (!PEXELS_KEY) return null;
  const wait = PEXELS_DELAY - (Date.now() - lastPexelsCall);
  if (wait > 0) await sleep(wait);
  lastPexelsCall = Date.now();
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(word)}&per_page=3&orientation=square`,
      { headers: { Authorization: PEXELS_KEY }, signal: AbortSignal.timeout(15000) }
    );
    if (res.status === 429) {
      console.log(`  ⏳  Pexels rate-limited — waiting 65s…`);
      await sleep(65000);
      lastPexelsCall = Date.now();
      return fetchPexels(word);
    }
    if (!res.ok) return null;
    const json: any = await res.json();
    const imgUrl = json.photos?.[0]?.src?.medium;
    if (!imgUrl) return null;
    const img = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
    if (!img.ok) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.byteLength < MIN_IMAGE_BYTES) return null;
    return buf;
  } catch { return null; }
}

// ── GPT-4o-mini short definitions ─────────────────────────────────────────────
async function generateDefinitions(words: string[]): Promise<Record<string, string>> {
  const prompt = `For each word below, write a single short (≤10 words), beginner-friendly English definition.
Return ONLY a JSON object mapping word → definition. No extra text.
Words: ${JSON.stringify(words)}`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });
    return JSON.parse(resp.choices[0].message.content ?? '{}');
  } catch { return {}; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const TSV_CACHE = '/tmp/things-concepts.tsv';
  let tsvText: string;
  if (fs.existsSync(TSV_CACHE)) {
    console.log('📋  Using cached THINGS TSV from', TSV_CACHE);
    tsvText = fs.readFileSync(TSV_CACHE, 'utf-8');
  } else {
    console.log('📥  Downloading THINGS concept metadata from OSF…');
    const tsvRes = await fetch(THINGS_TSV_URL, { signal: AbortSignal.timeout(120000) });
    if (!tsvRes.ok) throw new Error(`Failed to download TSV: ${tsvRes.status}`);
    tsvText = await tsvRes.text();
    fs.writeFileSync(TSV_CACHE, tsvText);
    console.log('💾  Cached TSV to', TSV_CACHE);
  }
  const concepts = parseTsv(tsvText);
  console.log(`✅  Parsed ${concepts.length} concepts`);

  // Load existing topics from Supabase
  const { data: topics, error: topErr } = await supabase.from('topics').select('id, name');
  if (topErr) throw topErr;
  const topicMap = new Map(topics!.map(t => [t.name, t.id]));
  console.log(`📚  Found ${topicMap.size} topics in DB:`, [...topicMap.keys()].join(', '));

  // Load already-imported words to skip them
  const { data: existingWords } = await supabase.from('words').select('word, topic_id');
  const existingSet = new Set((existingWords ?? []).map(w => `${w.word}::${w.topic_id}`));
  console.log(`⏭️   ${existingSet.size} words already in DB — will skip`);

  // Filter out already-done concepts
  const pending = concepts.filter(c => {
    const topicName = mapCategory(c.category);
    const topicId = topicMap.get(topicName);
    if (!topicId) return false; // no matching topic
    return !existingSet.has(`${c.word}::${topicId}`);
  });
  console.log(`🚀  ${pending.length} concepts to import\n`);

  // Batch-generate short definitions
  console.log(`🤖  Generating beginner-friendly definitions in batches of ${DEF_BATCH}…`);
  const shortDefs: Record<string, string> = {};
  for (let i = 0; i < pending.length; i += DEF_BATCH) {
    const batch = pending.slice(i, i + DEF_BATCH);
    const defs = await generateDefinitions(batch.map(c => c.word));
    Object.assign(shortDefs, defs);
    console.log(`  [${Math.min(i + DEF_BATCH, pending.length)}/${pending.length}] definitions done`);
    await sleep(500);
  }
  console.log('\n✅  Definitions ready');

  // Process each concept
  let done = 0, skipped = 0, failed = 0;

  await runPool(pending, CONCURRENCY, async (concept) => {
    const topicName = mapCategory(concept.category);
    const topicId   = topicMap.get(topicName)!;
    const difficulty = calcDifficulty(concept.concreteness, concept.percentKnown);
    const definition = shortDefs[concept.word] || concept.definition.split(';')[0].slice(0, 120) || null;

    // Download image — THINGS server first, Pexels as fallback
    let imageBuffer = await fetchThings(concept.thingsUrl);
    let source = 'things';
    if (!imageBuffer) {
      imageBuffer = await fetchPexels(concept.word);
      source = 'pexels';
    }
    if (!imageBuffer) {
      console.log(`  ⚠️  No image for "${concept.word}" — skipped`);
      skipped++;
      return;
    }

    // Upload to GCS
    let imageUrl: string | null = null;
    try {
      const fileName = `${concept.uniqueId}.jpg`;
      imageUrl = await uploadToGcs(fileName, imageBuffer, 'image/jpeg');
    } catch (e) {
      console.log(`  ❌  GCS upload failed for "${concept.word}": ${e}`);
      failed++;
      return;
    }

    // Upsert into Supabase
    const { error } = await supabase.from('words').upsert({
      word:             concept.word,
      topic_id:         topicId,
      image_url:        imageUrl,
      audio_url:        null,
      definition:       definition,
      difficulty_score: difficulty,
    }, { onConflict: 'word,topic_id', ignoreDuplicates: true });

    if (error) {
      console.log(`  ❌  DB error for "${concept.word}": ${error.message}`);
      failed++;
    } else {
      done++;
      console.log(`  ✅ [${done}/${pending.length}] ${concept.word} (${topicName}, diff ${difficulty}, ${source})`);
    }

    await sleep(RATE_MS);
  });

  console.log(`\n\n🎉  Done!`);
  console.log(`   Imported : ${done}`);
  console.log(`   Skipped  : ${skipped} (no image)`);
  console.log(`   Failed   : ${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
