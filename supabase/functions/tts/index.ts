import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { text } = await req.json();
  if (!text) return new Response(JSON.stringify({ error: 'text required' }), { status: 400 });

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: 'nova',   // warm, friendly voice
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(JSON.stringify({ error: err }), { status: 500, headers: corsHeaders });
  }

  // Return as base64 data URL so client can play directly
  const arrayBuffer = await response.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const audioUrl = `data:audio/mp3;base64,${base64}`;

  return new Response(JSON.stringify({ audioUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
