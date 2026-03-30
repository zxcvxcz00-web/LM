import fs from 'node:fs/promises';

const URLS = {
  total: 'https://manga.line.me/periodic/gender_ranking?gender=0',
  male: 'https://manga.line.me/periodic/gender_ranking?gender=1',
  female: 'https://manga.line.me/periodic/gender_ranking?gender=2',
};

const LIMIT = 30;

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'ja,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://manga.line.me/'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return await response.text();
}

function parseTitles(html) {
  const results = [];
  const seen = new Set();

  const regex = /^##\s+(.+?)\s*$/gm;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const title = String(match[1] || '').trim();

    if (!title) continue;
    if (seen.has(title)) continue;

    if ([
      'ランキング',
      '確認',
      'キャンセル',
      '完了しました'
    ].includes(title)) continue;

    if (title.length < 2) continue;
    if (/^\d+$/.test(title)) continue;

    seen.add(title);
    results.push(title);

    if (results.length >= LIMIT) break;
  }

  return results;
}

async function getRanking(url) {
  const html = await fetchHtml(url);
  return parseTitles(html);
}

async function main() {
  const total = await getRanking(URLS.total);
  const male = await getRanking(URLS.male);
  const female = await getRanking(URLS.female);

  const data = {
    updated_at: new Date().toISOString(),
    jp: {
      total,
      male,
      female
    }
  };

  await fs.writeFile('LM_Ranking.json', JSON.stringify(data, null, 2), 'utf8');

  console.log(JSON.stringify({
    updated_at: data.updated_at,
    total_count: total.length,
    male_count: male.length,
    female_count: female.length,
    sample_total: total.slice(0, 5)
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
