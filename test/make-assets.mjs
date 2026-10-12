// Headless-генерация магазинных ассетов (без внешних image-API).
// Делает: скриншоты геймплея с реального билда + обложки RU/EN + иконку из card.html.
// Запуск из папки игры:  node test/make-assets.mjs
// Правь CONFIG под конкретную игру (title/heroSvg/палитра/кадры).
// heroSvg — ВЕКТОРНАЯ SVG-разметка героя обложки (viewBox 0 0 100 100), НЕ эмодзи.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, 'store-assets');
mkdirSync(out, { recursive: true });
const gameUrl = 'file://' + resolve(root, 'index.html');
const cardUrl = 'file://' + resolve(root, 'store', 'card.html');

// ---- CONFIG (заполняет недельный прогон) ----
const CONFIG = {
  titleRu: '__GAME_TITLE__', titleEn: '__GAME_TITLE_EN__',
  subRu: 'Короткий подзаголовок', subEn: 'Short subtitle',
  // GAME: замени на векторную SVG героя под тему игры (плоские заливки + контур,
  // см. STYLE.md). Пример ниже — просто круглая заглушка, не используй её как есть.
  heroSvg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
    + '<circle cx="50" cy="52" r="34" fill="#F49E6D" stroke="#5B4636" stroke-width="5"/></svg>',
  accent: '#F49E6D', bg: '#AFCF87', ink: '#5B4636',
  // характерные экраны: [имя файла, скрипт подготовки состояния через хуки]
  shots: [
    ['d1-gameplay', async p => { for(let i=0;i<40;i++) await p.click('#tapBtn'); }],
    ['d2-upgrade',  async p => { for(let i=0;i<300;i++) await p.click('#tapBtn'); await p.click('#upBtn'); }],
  ],
};

const browser = await chromium.launch();

async function shot(url, w, h, file, prep) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.waitForTimeout(400);
  if (prep) await prep(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, file) });
  await page.close();
  console.log('saved', file);
}

// Скриншоты геймплея (десктоп 1920x1080)
for (const [name, prep] of CONFIG.shots) {
  await shot(gameUrl, 1920, 1080, name + '.png', prep);
}

// Обложки 800x470 и иконка 512x512 из card.html
const card = (o) => cardUrl + '?' + new URLSearchParams(o).toString();
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleRu,sub:CONFIG.subRu,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover.png');
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleEn,sub:CONFIG.subEn,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover-en.png');
await shot(card({ w:512,h:512,mode:'icon',heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 512, 512, 'icon.png');

await browser.close();
console.log('\nАссеты готовы в', out);
