const social = require('../social-poster');

const fakeArticle = {
  id: 999999,
  title: 'Testtweet från redaktionen.net – ignorera detta',
  category: 'tech',
  priority: 10,
};

(async () => {
  console.log('Calling postX with fake article...');
  const r = await social.postX(fakeArticle);
  console.log('Result:', JSON.stringify(r, null, 2));
})();
