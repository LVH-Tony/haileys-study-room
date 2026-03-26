#!/usr/bin/env npx tsx
import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const sb = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const storage = new Storage({ keyFilename: process.env.GCS_CREDENTIALS_PATH!, projectId: process.env.GCS_PROJECT_ID! });
const bucket = storage.bucket(process.env.GCS_BUCKET!);

const COLOR_TOPIC  = '11111111-0000-0000-0000-000000000003';
const NUMBER_TOPIC = '11111111-0000-0000-0000-000000000004';

async function upload(localPath: string, gcsName: string): Promise<string> {
  const [exists] = await bucket.file(gcsName).exists();
  if (!exists) await bucket.upload(localPath, { destination: gcsName, metadata: { contentType: 'image/jpeg' } });
  return `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${gcsName}`;
}

async function main() {
  console.log('Uploading color swatches...');
  for (const fname of fs.readdirSync('/tmp/color_cards').filter(f => f.endsWith('.jpg'))) {
    const name = fname.replace('.jpg', '');
    const url = await upload(`/tmp/color_cards/${fname}`, `generated/colors/${fname}`);
    const { error } = await sb.from('words').update({ image_url: url }).eq('word', name).eq('topic_id', COLOR_TOPIC);
    if (error) console.log(`  ❌ ${name}: ${error.message}`);
    else console.log(`  ✅ ${name}`);
  }

  console.log('\nUploading number cards...');
  for (const fname of fs.readdirSync('/tmp/number_cards').filter(f => f.endsWith('.jpg'))) {
    const name = fname.replace('.jpg', '');
    const url = await upload(`/tmp/number_cards/${fname}`, `generated/numbers/${fname}`);
    const { error } = await sb.from('words').update({ image_url: url }).eq('word', name).eq('topic_id', NUMBER_TOPIC);
    if (error) console.log(`  ❌ ${name}: ${error.message}`);
    else console.log(`  ✅ ${name}`);
  }
  console.log('\nDone!');
}
main().catch(console.error);
