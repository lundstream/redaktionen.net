// AI comment moderator — uses gpt-4o-mini to classify incoming comments.
// Verdicts: approve | flag (human review) | reject (silent drop).
const fs = require('fs');
const path = require('path');

function getSettings() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf-8')); }
  catch { return {}; }
}

const SYSTEM_PROMPT = `Du är en svensk kommentarsmoderator för en seriös teknik- och AI-nyhetssajt (redaktionen.net).

Din uppgift: klassificera en inkommande kommentar i EN av tre kategorier.

VERDICT-VÄRDEN:
- "approve": publicera omedelbart. Konstruktiv, relevant, saklig eller en rimlig åsikt.
- "flag": håll för mänsklig granskning. Osäker, gränsfall, stark emotion, potentiellt problematisk men inte självklart.
- "reject": tyst avvisning. Otvetydigt skräp.

GODKÄNN (approve):
- Saklig kritik av artikeln eller sajten
- Negativa åsikter, skeptiska kommentarer
- Tekniska korrigeringar
- Frågor, diskussionsinlägg
- Humor som inte är elak mot en individ
- Kort men meningsfullt ("Bra artikel", "Håller inte med")

AVVISA (reject):
- Spam, reklam, länkar till tvivelaktiga sidor, affiliate-länkar
- Rena förolämpningar utan innehåll ("Din idiot", "KYS")
- Hets mot folkgrupp, rasism, homofobi
- Personhot, våldsuppmaningar
- Dubletter / copypasta
- Helt off-topic (t.ex. politisk propaganda på en teknikartikel)
- Innehåll på andra språk än svenska eller engelska
- Obegripligt nonsens

FLAGGA (flag):
- Osäkra fall
- Hårt språk men med innehåll ("Artikeln är ju för fan fel, X är inte Y")
- Kritik mot en namngiven person (inte offentlig debatt)
- Misstänkt sockpuppeting
- Potentiellt farlig teknisk info (malware, exploits)

Svara ENDAST med giltig JSON, ingen extra text:
{"verdict": "approve|flag|reject", "reason": "kort förklaring på svenska (max 80 tecken)"}`;

async function moderateComment({ articleTitle, body }) {
  const s = getSettings();
  const apiKey = s.openai_key;
  if (!apiKey) {
    return { verdict: 'flag', reason: 'ingen_api_nyckel' };
  }

  const userMessage = `Artikel: "${articleTitle}"\n\nKommentar:\n"""\n${String(body).slice(0, 2000)}\n"""`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.log(`[Moderator] API ${resp.status}: ${t.slice(0, 200)}`);
      return { verdict: 'flag', reason: `api_fel_${resp.status}` };
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const verdict = ['approve', 'flag', 'reject'].includes(parsed.verdict) ? parsed.verdict : 'flag';
    const reason = String(parsed.reason || '').slice(0, 160);
    return { verdict, reason, tokens: data.usage?.total_tokens || 0 };
  } catch (e) {
    console.log(`[Moderator] failed: ${e.message}`);
    return { verdict: 'flag', reason: `undantag_${e.message.slice(0, 40)}` };
  }
}

module.exports = { moderateComment };
