const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('settings.json','utf8'));
console.log('Brave key present:', !!settings.brave_search_key, '(len', settings.brave_search_key?.length, ')');

async function test() {
  const url = 'https://api.search.brave.com/res/v1/images/search?q=iphone%2017%20pro&count=3&safesearch=strict';
  try {
    const resp = await fetch(url, {
      headers: { 'Accept':'application/json', 'Accept-Encoding':'gzip', 'X-Subscription-Token': settings.brave_search_key },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Status:', resp.status, resp.statusText);
    const text = await resp.text();
    console.log('Body (first 800 chars):', text.slice(0, 800));
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}
test();
