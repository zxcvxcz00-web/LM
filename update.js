import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const URLS = {
  total: 'https://manga.line.me/periodic/gender_ranking?gender=0',
  male: 'https://manga.line.me/periodic/gender_ranking?gender=1',
  female: 'https://manga.line.me/periodic/gender_ranking?gender=2',
};

const LIMIT = 30;

async function extractTitles(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // 🔴 핵심: 랭킹 카드 영역만 정확히 긁기
  const titles = await page.evaluate((limit) => {
    const results = [];

    // LINE Manga 랭킹 카드 선택자
    const cards = document.querySelectorAll('li');

    for (let card of cards) {
      // 제목 후보: img alt 또는 내부 텍스트
      const img = card.querySelector('img');
      if (img && img.alt) {
        const title = img.alt.trim();

        // 필터 (UI 텍스트 제거)
        if (
          title.length > 2 &&
          !title.includes('LINE') &&
          !title.includes('無料') &&
          !title.includes('ログイン')
        ) {
          results.push(title);
        }
      }

      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  }, LIMIT);

  return titles;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0',
    locale: 'ja-JP',
  });

  const total = await extractTitles(page, URLS.total);
  const male = await extractTitles(page, URLS.male);
  const female = await extractTitles(page, URLS.female);

  const data = {
    updated_at: new Date().toISOString(),
    jp: {
      total,
      male,
      female,
    },
  };

  await fs.writeFile('LM_Ranking.json', JSON.stringify(data, null, 2), 'utf8');

  await browser.close();
}

main();
