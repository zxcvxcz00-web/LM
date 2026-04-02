import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const URLS = {
  total: 'https://manga.line.me/periodic/gender_ranking?gender=0',
  male: 'https://manga.line.me/periodic/gender_ranking?gender=1',
  female: 'https://manga.line.me/periodic/gender_ranking?gender=2',
};

const LIMIT = 30;

function normalizeTitle(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function isBlockedTitle(s) {
  const v = normalizeTitle(s);
  if (!v) return true;
  if (v.length < 2) return true;
  if (v.length > 120) return true;
  if (/^\d+$/.test(v)) return true;

  const blockedExact = new Set([
    'ランキング',
    '検索',
    'トップ',
    '新着作品から探す',
    'スタンプ付き作品',
    'ジャンルから探す',
    'ページの上へ戻る',
    'アプリダウンロード',
    'LINEマンガ公式アカウント',
    'Facebook公式アカウント',
    'X公式アカウント',
    'LINE Digital Frontier Corporation リンク',
    '制作・投稿ガイドライン',
    '公告',
    'ニックネーム設定',
    '設定',
    '閉じる'
  ]);

  const blockedPartial = [
    'ジャンルから探す',
    'LINEマンガ公式',
    'Facebook公式',
    'X公式',
    'LINE Digital Frontier',
    'ニックネーム設定'
  ];

  if (blockedExact.has(v)) return true;
  if (blockedPartial.some((x) => v.includes(x))) return true;

  return false;
}

async function autoScroll(page, maxSteps = 12) {
  for (let i = 0; i < maxSteps; i += 1) {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1200);
  }
}

async function extractTitles(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  await autoScroll(page);

  const titles = await page.evaluate(() => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('h2'))
      .map((el) => normalize(el.textContent))
      .filter(Boolean);
  });

  const out = [];
  const seen = new Set();

  for (const raw of titles) {
    const v = normalizeTitle(raw);
    if (isBlockedTitle(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }

  if (out.length < LIMIT) {
    console.warn(`[WARN] Requested ${LIMIT}, but only captured ${out.length} from ${url}`);
  }

  return out.slice(0, LIMIT);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    extraHTTPHeaders: {
      'Accept-Language': 'ja,en;q=0.9',
    },
    viewport: { width: 1440, height: 2200 },
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

  console.log(JSON.stringify({
    updated_at: data.updated_at,
    total_count: total.length,
    male_count: male.length,
    female_count: female.length,
    sample_total: total.slice(0, 10),
  }, null, 2));

  await browser.close();

  execSync('git add update_local_windows.js LM_Ranking.json', { stdio: 'inherit' });

  try {
    execSync('git commit -m "relax ranking extraction count requirement"', { stdio: 'inherit' });
  } catch (_) {
    console.log('No changes to commit');
  }

  execSync('git push', { stdio: 'inherit' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});