// One-shot image generator via Kie AI nano-banana-2.
// Usage: node scripts/gen-about-image.js
const fs = require('fs');
const path = require('path');

const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'settings.json'), 'utf8'));
const apiKey = settings.kie_api_key;
if (!apiKey) { console.error('Missing kie_api_key'); process.exit(1); }

const prompt = `Editorial-quality isometric illustration explaining the workflow of an AI-driven Swedish tech newsroom called "redaktionen.net".
Left side: a stylised globe with small glowing node icons and RSS/news-source logos representing international tech news sources, arrows flowing right.
Center: a friendly panel of nine diverse cartoon AI-agent avatars sitting at glowing desks with holographic monitors, analysing, writing and fact-checking news articles. Subtle swedish flag colour accents (blue and yellow).
Right side: a clean minimalistic laptop showing the redaktionen.net homepage with news cards, and a human editor icon giving a green check-mark approval before publication.
Connect the three stages with smooth glowing arrow-lines labelled in small clean type: "Bevakning", "AI-redaktion", "Granskning", "Publicering".
Flat modern vector style, soft gradients, dark navy background with cyan and amber accents, subtle grid. Highly readable, infographic feel, no photorealism, no real brand logos, no text errors.`;

async function main() {
  console.log('Creating Kie task...');
  const createResp = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nano-banana-2',
      input: { prompt, aspect_ratio: '16:9', resolution: '2K', output_format: 'png' },
    }),
  });
  const createData = await createResp.json();
  if (createData.code !== 200 || !createData.data?.taskId) {
    console.error('createTask failed', createData);
    process.exit(1);
  }
  const taskId = createData.data.taskId;
  console.log('Task:', taskId);

  let delay = 3000;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, delay));
    const pollResp = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const pollData = await pollResp.json();
    const state = pollData.data?.state;
    console.log(`Poll ${i + 1}: ${state}`);
    if (state === 'success') {
      const rj = JSON.parse(pollData.data.resultJson);
      const url = rj.resultUrls?.[0];
      if (!url) { console.error('No URL in result'); process.exit(1); }
      console.log('Downloading', url);
      const imgResp = await fetch(url);
      const buf = Buffer.from(await imgResp.arrayBuffer());
      const outPath = path.join(__dirname, '..', 'public', 'about-flow.png');
      fs.writeFileSync(outPath, buf);
      console.log('Saved to', outPath, buf.length, 'bytes');
      return;
    } else if (state === 'fail') {
      console.error('Task failed:', pollData.data?.failMsg);
      process.exit(1);
    }
    delay = Math.min(delay * 1.3, 6000);
  }
  console.error('Timeout');
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
