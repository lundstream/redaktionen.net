/**
 * Generate AI team profile pictures via Kie AI (nano-banana-2)
 * Run: node scripts/generate-team-photos.js
 */
const fs = require('fs');
const path = require('path');
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'settings.json'), 'utf8'));

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'images', 'team');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const team = [
  { file: 'fuller-stackman.png',       desc: 'a confident Swedish man in his late 40s with thick-rimmed black glasses, slightly messy dark hair with grey streaks, wearing a black hoodie with a subtle circuit-board pattern, intense but warm eyes, holding a mechanical keyboard' },
  { file: 'sven-googlund.png',         desc: 'a curious Swedish man in his mid-30s with a shaved head, round tortoiseshell glasses, wearing a dark t-shirt with a Linux penguin pin on the collar, earbuds around his neck, analytical expression, multiple monitors reflected in his glasses' },
  { file: 'linus-karna.png',           desc: 'a young Swedish man in his late 20s with tousled reddish-brown hair and a short beard, wearing a vintage Star Wars t-shirt under an open dark plaid shirt, excited nerdy expression, coffee mug nearby' },
  { file: 'hardy-chipstrom.png',       desc: 'a stocky Swedish man in his early 40s with short blond hair and a goatee, wearing a well-worn Commodore 64 t-shirt, hands slightly greasy from tinkering, surrounded by circuit boards and soldering iron, proud craftsman look' },
  { file: 'albert-promtsson.png',      desc: 'a young Swedish man in his mid-20s with curly dark hair and round wire-frame glasses, wearing a neural-network-print t-shirt, clean and modern look, typing on a sleek laptop, thoughtful futuristic expression' },
  { file: 'vera-workspace.png',        desc: 'a professional Swedish woman in her early 30s with shoulder-length auburn hair, wearing a fitted dark blazer over a minimalist tech t-shirt, confident posture, standing in a modern office with cloud infrastructure dashboards on screens behind her' },
  { file: 'glosa-grammarsdottir.png',  desc: 'a precise Swedish woman in her late 30s with sharp dark bobbed hair, minimalist silver earrings, wearing a black turtleneck and reading glasses on a chain, holding a red pen, meticulous yet warm expression' },
  { file: 'klara-faktelius.png',       desc: 'a sharp Swedish woman in her early 30s with light hair in a tight bun, clear blue eyes, wearing a fitted dark blazer over a white shirt, magnifying glass emoji badge, determined truth-seeking expression' },
  { file: 'pixel-peepgren.png',        desc: 'a creative Swedish non-binary person in their late 20s with asymmetric dyed-teal hair, one side shaved, wearing a graphic design t-shirt with colorful geometric patterns, Wacom stylus behind ear, artistic and playful expression' },
];

const STYLE = `Professional headshot portrait photograph in a dark, moody tech workspace with cool blue ambient lighting and subtle monitor glow. Dark background with hints of code or circuit patterns. Shot at f/2.0, shallow depth of field. Cinematic color grading. The subject is`;

async function kieGenerate(prompt) {
  const createResp = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.kie_api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'nano-banana-2',
      input: { prompt, aspect_ratio: '1:1', resolution: '1K', output_format: 'png' },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const createData = await createResp.json();
  if (createData.code !== 200 || !createData.data?.taskId) {
    return { error: createData.msg || 'createTask failed' };
  }
  const taskId = createData.data.taskId;
  console.log(`    task: ${taskId}`);

  let delay = 3000;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, delay));
    const pollResp = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { 'Authorization': `Bearer ${settings.kie_api_key}` },
      signal: AbortSignal.timeout(15000),
    });
    const pollData = await pollResp.json();
    const state = pollData.data?.state;
    if (state === 'success') {
      try {
        const rj = JSON.parse(pollData.data.resultJson);
        return { url: rj.resultUrls?.[0] };
      } catch { return { error: 'Failed to parse result' }; }
    } else if (state === 'fail') {
      return { error: pollData.data?.failMsg || 'unknown' };
    }
    process.stdout.write('.');
    delay = Math.min(delay * 1.3, 8000);
  }
  return { error: 'Timeout waiting for result' };
}

async function generateOne(member) {
  const outPath = path.join(OUTPUT_DIR, member.file);
  if (fs.existsSync(outPath)) {
    console.log(`  [skip] ${member.file} already exists`);
    return;
  }

  const prompt = `${STYLE} ${member.desc}. Photorealistic, editorial portrait style with dark tech atmosphere. No text, logos, or watermarks.`;

  console.log(`  [gen] ${member.file}...`);
  const result = await kieGenerate(prompt);

  if (result.error) {
    console.error(`\n  [ERR] ${member.file}: ${result.error}`);
    return;
  }

  if (!result.url) {
    console.error(`\n  [ERR] ${member.file}: no URL in response`);
    return;
  }

  const imgResp = await fetch(result.url, { signal: AbortSignal.timeout(30000) });
  if (!imgResp.ok) { console.error(`\n  [ERR] ${member.file}: download failed`); return; }

  const buf = Buffer.from(await imgResp.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`\n  [ok]  ${member.file} (${(buf.length / 1024).toFixed(0)} KB)`);
}

(async () => {
  console.log('Generating team profile photos via Kie AI (nano-banana-2)...');
  for (const m of team) {
    await generateOne(m);
  }
  console.log('Done!');
})();
