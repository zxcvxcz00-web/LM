import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const URLS = {
  total: 'https://manga.line.me/periodic/gender_ranking?gender=0',
  male: 'https://manga.line.me/periodic/gender_ranking?gender=1',
  female: 'https://manga.line.me/periodic/gender_ranking?gender=2',
};

const LIMIT = 30;

async function extractTitles(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);

  const titles = await page.evaluate((limit) => {
    const textFrom = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

    const candidates = [];
    const seen = new Set();

    const push = (value) => {
      const v = String(value || '').replace(/\s+/g, ' ').trim();
      if (!v) return;
      if (v.length < 2) return;
      if (/^(ランキング|総合ランキング|男性向けランキング|女性向けランキング)$/i.test(v)) return;
      if (/^\d+$/.test(v)) return;
      if (seen.has(v)) return;
      seen.add(v);
      candidates.push(v);
    };

    document.querySelectorAll('img[alt]').forEach((img) => {
      push(img.getAttribute('alt'));
    });

    document.querySelectorAll('h1,h2,h3,h4,h5,h6,a,span,div,p').forEach((el) => {
      const txt = textFrom(el);
      if (!txt) return;
      if (txt.length >= 2 && txt.length <= 120) {
        push(txt);
      }
    });

    const cleaned = candidates.filter((t) => {
      if (/^(ログイン|無料|毎日|先読み|話|巻|連載|新着|ホーム|検索|ランキング|総合|男性向け|女性向け|連載中)$/i.test(t)) return false;
      return true;
    });

    return cleaned.slice(0, limit);
  }, LIMIT);

  return titles.slice(0, LIMIT);
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
