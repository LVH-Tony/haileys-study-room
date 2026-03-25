/**
 * Image Pipeline
 * --------------
 * For every word in Supabase with no image_url:
 *   1. Search Pexels for a relevant photo
 *   2. Stream the image directly to GCS (no disk storage)
 *   3. Update words.image_url with the public GCS URL
 *
 * Run: npx tsx scripts/image-pipeline.ts
 */

import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GCS_BUCKET        = process.env.GCS_BUCKET!;
const GCS_PROJECT_ID    = process.env.GCS_PROJECT_ID!;
const GCS_CREDS_PATH    = process.env.GCS_CREDENTIALS_PATH!;
const PEXELS_API_KEY    = process.env.PEXELS_API_KEY!;

const PEXELS_BASE = 'https://api.pexels.com/v1/search';
const DELAY_MS    = 400; // be polite to Pexels rate limits

// Topic → search context hint so "orange" finds the fruit not the colour
const TOPIC_HINTS: Record<string, string> = {
  'Animals':    'animal',
  'Food':       'food',
  'Colors':     'color swatch',
  'Numbers':    'number',
  'Family':     'family people',
  'Body Parts': 'human body',
  'Clothes':    'clothing fashion',
  'Weather':    'weather nature',
};

// ─── Clients ──────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const gcs = new Storage({
  projectId: GCS_PROJECT_ID,
  keyFilename: path.resolve(process.cwd(), GCS_CREDS_PATH),
});

const bucket = gcs.bucket(GCS_BUCKET);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchPexels(query: string): Promise<string | null> {
  const url = `${PEXELS_BASE}?query=${encodeURIComponent(query)}&per_page=1&orientation=square`;
  const res = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });
  if (!res.ok) {
    console.warn(`  Pexels error ${res.status} for "${query}"`);
    return null;
  }
  const data = await res.json() as { photos: { src: { medium: string } }[] };
  return data.photos?.[0]?.src?.medium ?? null;
}

async function uploadToGcs(wordId: string, imageUrl: string): Promise<string> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Failed to fetch image: ${imageUrl}`);

  const contentType = imageRes.headers.get('content-type') ?? 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const destPath = `words/${wordId}.${ext}`;
  const file = bucket.file(destPath);

  const buffer = Buffer.from(await imageRes.arrayBuffer());

  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: 'public, max-age=31536000' },
  });

  // Public URL (bucket already has allUsers → Storage Legacy Object Reader)
  return `https://storage.googleapis.com/${GCS_BUCKET}/${destPath}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('📦 Fetching words without images from Supabase…');

  const { data: words, error } = await supabase
    .from('words')
    .select('id, word, topic_id, topics(name)')
    .is('image_url', null)
    .order('topic_id');

  if (error) { console.error('Supabase error:', error); process.exit(1); }
  if (!words || words.length === 0) {
    console.log('✅ All words already have images — nothing to do!');
    return;
  }

  console.log(`\n🖼️  Found ${words.length} words needing images\n`);

  let done = 0;
  let failed = 0;

  for (const row of words) {
    const topicName = (row.topics as any)?.name ?? '';
    const hint = TOPIC_HINTS[topicName] ?? '';
    const query = hint ? `${row.word} ${hint}` : row.word;

    process.stdout.write(`  [${done + failed + 1}/${words.length}] "${row.word}" (${topicName}) … `);

    try {
      const pexelsUrl = await searchPexels(query);
      if (!pexelsUrl) throw new Error('No Pexels result');

      const publicUrl = await uploadToGcs(row.id, pexelsUrl);

      const { error: updateError } = await supabase
        .from('words')
        .update({ image_url: publicUrl })
        .eq('id', row.id);

      if (updateError) throw updateError;

      console.log(`✓ ${publicUrl}`);
      done++;
    } catch (err: any) {
      console.log(`✗ ${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n✅ Done — ${done} uploaded, ${failed} failed`);
  if (failed > 0) console.log('   Re-run the script to retry failed words (they still have no image_url).');
}

run().catch((e) => { console.error(e); process.exit(1); });
