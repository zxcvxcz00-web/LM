import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const URLS = {
  total: 'https://manga.line.me/periodic/gender_ranking?gender=0',
  male: 'https://manga.line.me/periodic/gender_ranking?gender=1',
  female: 'https://manga.line.me/periodic/gender_ranking?gender=2',
};

const LIMIT = 30;

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function isBadTitle(s) {
  const v = cleanText(s);
  if (!v) return true;
  if (v.length < 2) return true;
  if (v.length > 120) return true;
  if (/^\d+$/.test(v)) return true;

  const blocked = [
    '検索',
    'トップ',
    'ランキング',
    '新着作品から探す',
    'スタンプ付き作品',
    'ジャンルから探す',
    'アプリダウンロード',
    'LINEマンガ公式アカウント',
    'Facebook公式アカウント',
    'X公式アカウント',
    'ページの上へ戻る',
    'ニックネーム設定',
    '設定',
    '閉じる',
    'メニュー',
    '毎日無料',
    'ストア',
    'インディーズ',
    '本棚',
    'お気に入り',
    'マイメニュー',
    'LINEマンガ編集部',
    'LINEコミックス',
    'ログイン',
    'お知らせ',
    'ヘルプ',
    'お問い合わせ'
  ];

  return blocked.some(x => v === x || v.includes(x));
}

async function autoScroll(page, steps = 10) {
  for (let i = 0; i < steps; i += 1) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.2));
    await page.waitForTimeout(1200);
  }
}

async function extractTitles(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  await autoScroll(page, 12);
  await page.waitForTimeout(2000);

  const rawText = await page.locator('body').innerText();
  const safeName =
    url.includes('gender=0') ? 'total' :
    url.includes('gender=1') ? 'male' : 'female';

  await fs.writeFile(`debug_${safeName}.txt`, rawText, 'utf8');

  const lines = rawText
    .split('\n')
    .map((x) => cleanText(x))
    .filter(Boolean);

  const out = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/^\d{1,2}$/.test(line)) continue;

    const rank = Number(line);
    if (rank < 1 || rank > 90) continue;

    let found = null;

    for (let j = i + 1; j < Math.min(i + 12, lines.length); j += 1) {
      const candidate = cleanText(lines[j]);

      if (!candidate) continue;
      if (candidate === 'Image') continue;
      if (candidate === '作品名') continue;
      if (candidate === 'ジャンル') break;
      if (candidate === '更新曜日') break;
      if (/^\d{1,3}(,\d{3})*$/.test(candidate)) continue;
      if (/^\d+$/.test(candidate)) continue;
      if (isBadTitle(candidate)) continue;

      found = candidate;
      break;
    }

    if (found && !seen.has(found)) {
      seen.add(found);
      out.push(found);
    }

    if (out.length >= LIMIT) break;
  }

  console.log(`[DEBUG] ${url}`);
  console.log(`[DEBUG] parsed lines=${lines.length}`);
  console.log(`[DEBUG] extracted=${out.length}`);
  console.log(`[DEBUG] sample=`, out.slice(0, 10));

  if (out.length === 0) {
    throw new Error(`No ranking titles captured from ${url}`);
  }

  return out.slice(0, LIMIT);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    extraHTTPHeaders: {
      'Accept-Language': 'ja,en;q=0.9'
    },
    viewport: { width: 1440, height: 2400 }
  });

  const total = await extractTitles(page, URLS.total);
  const male = await extractTitles(page, URLS.male);
  const female = await extractTitles(page, URLS.female);

  const data = {
    updated_at: new Date().toISOString(),
    jp: { total, male, female }
  };

  await fs.writeFile('LM_Ranking.json', JSON.stringify(data, null, 2), 'utf8');

  console.log(JSON.stringify({
    updated_at: data.updated_at,
    total_count: total.length,
    male_count: male.length,
    female_count: female.length,
    sample_total: total.slice(0, 10)
  }, null, 2));

  await browser.close();

  execSync('git add update_local_windows.js LM_Ranking.json debug_total.txt debug_male.txt debug_female.txt', { stdio: 'inherit' });

  try {
    execSync('git commit -m "fix ranking extraction by body text parsing"', { stdio: 'inherit' });
  } catch (_) {
    console.log('No changes to commit');
  }

  execSync('git push', { stdio: 'inherit' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});