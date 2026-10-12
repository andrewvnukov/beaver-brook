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

// ---- CONFIG ----
const ALL = "['bridge','lodge','pier','mill','gazebo','hive','lantern','windmill']";
const CONFIG = {
  titleRu: 'Бобровый Ручей', titleEn: 'Beaver Brook',
  subRu: 'Поверни желоба — напои клумбы', subEn: 'Turn the gutters, water the flowers',
  // герой обложки: бобёр Тимоша с капелькой и деревянным желобом — векторный SVG (без эмодзи)
  heroSvg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
    + '<defs><radialGradient id="b" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#C98D62"/><stop offset=".6" stop-color="#A8714A"/><stop offset="1" stop-color="#7E5234"/></radialGradient>'
    + '<linearGradient id="w" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9BDCF5"/><stop offset="1" stop-color="#3F98CC"/></linearGradient></defs>'
    + '<g stroke="#4A3A2A" stroke-width="3" stroke-linejoin="round">'
    + '<path d="M8 82 Q8 64 26 64 L40 64" fill="none" stroke-width="13"/><path d="M8 82 Q8 64 26 64 L40 64" fill="none" stroke="#C68A52" stroke-width="9"/><path d="M8 82 Q8 64 26 64 L40 64" fill="none" stroke="url(#w)" stroke-width="4.5"/>'
    + '<ellipse cx="78" cy="80" rx="15" ry="7" fill="#6E4A30" transform="rotate(-25 78 80)"/>'
    + '<ellipse cx="58" cy="70" rx="20" ry="22" fill="url(#b)"/><ellipse cx="58" cy="74" rx="12" ry="14" fill="#EBCFA2" stroke="none"/>'
    + '<circle cx="45" cy="30" r="5" fill="#9A6642"/><circle cx="71" cy="30" r="5" fill="#9A6642"/>'
    + '<ellipse cx="58" cy="42" rx="18" ry="16" fill="url(#b)"/>'
    + '<ellipse cx="58" cy="49" rx="10.5" ry="7.5" fill="#EBCFA2" stroke-width="2"/>'
    + '<rect x="54" y="52" width="8" height="6" rx="1.4" fill="#fff" stroke-width="2"/>'
    + '<ellipse cx="58" cy="46" rx="4.4" ry="3.2" fill="#3A2516" stroke="none"/>'
    + '<ellipse cx="51" cy="38" rx="4.4" ry="5" fill="#fff" stroke-width="1.8"/><ellipse cx="65" cy="38" rx="4.4" ry="5" fill="#fff" stroke-width="1.8"/>'
    + '<circle cx="51.5" cy="38.8" r="3" fill="#6B4220" stroke="none"/><circle cx="65.5" cy="38.8" r="3" fill="#6B4220" stroke="none"/>'
    + '<circle cx="51.6" cy="39" r="1.6" fill="#1E140C" stroke="none"/><circle cx="65.6" cy="39" r="1.6" fill="#1E140C" stroke="none"/>'
    + '<circle cx="50.5" cy="37.4" r="1.1" fill="#fff" stroke="none"/><circle cx="64.5" cy="37.4" r="1.1" fill="#fff" stroke="none"/>'
    + '<path d="M84 10 C90 19 93 23 93 27 A9 9 0 0 1 75 27 C75 23 78 19 84 10Z" fill="url(#w)"/>'
    + '<ellipse cx="80.5" cy="25" rx="2.2" ry="3.4" fill="#fff" opacity=".7" stroke="none"/>'
    + '</g><ellipse cx="45" cy="47" rx="3.5" ry="2.2" fill="#F07A6E" opacity=".35"/><ellipse cx="71" cy="47" rx="3.5" ry="2.2" fill="#F07A6E" opacity=".35"/>'
    + '</svg>',
  accent: '#4FB0DA', bg: '#BFE6C2', ink: '#4A3A2A',
  // характерные экраны десктопа (1920x1080): игра / политый ручей / деревня / ежедневная серия / окно возвращения
  shots: [
    ['d1-gameplay', async p => { await p.evaluate("(()=>{window.__setLevel(7); window.__grant(2000); ['bridge','lodge','pier','mill'].forEach(id=>window.__buy(id)); window.__solvePartial(1); document.getElementById('toast').classList.remove('on');})()"); await p.waitForTimeout(500); }],
    ['d2-watered',  async p => { await p.evaluate("(()=>{window.__setLevel(12); window.__grant(30000); "+ALL+".forEach(id=>window.__buy(id)); window.__solveAll();})()"); await p.waitForTimeout(1900); }],
    ['d3-village',  async p => { await p.evaluate("(()=>{window.__grant(2600); ['bridge','lodge','pier','mill'].forEach(id=>window.__buy(id));})()"); await p.waitForTimeout(300); await p.click('#villageBtn'); }],
    ['d4-daily',    async p => { await p.evaluate(k => { window.__freezeSave(); localStorage.setItem(k, JSON.stringify({ v:1, logs:420, level:9, solved:8, tutDone:true, built:['bridge','lodge','pier'], streak:2, lastClaimDay:new Date(Date.now()-864e5).toISOString().slice(0,10), time:Date.now() })); }, 'beaver_brook_v1'); await p.reload(); await p.waitForTimeout(1200); }],
    ['d5-offline',  async p => { await p.evaluate(k => { window.__freezeSave(); localStorage.setItem(k, JSON.stringify({ v:1, logs:900, level:14, solved:13, tutDone:true, built:['bridge','lodge','pier','mill','gazebo','hive'], time:Date.now()-7*3600*1000, lastClaimDay:new Date().toISOString().slice(0,10) })); }, 'beaver_brook_v1'); await p.reload(); await p.waitForTimeout(1200); }],
  ],
};

const browser = await chromium.launch();

async function shot(url, w, h, file, prep, locale) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: locale || 'ru-RU' });
  await page.goto(url);
  await page.waitForTimeout(600);
  if (prep) await prep(page);
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('on'); });
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(out, file) });
  await page.close();
  console.log('saved', file);
}

// Скриншоты геймплея (десктоп 1920x1080), RU и EN (язык — из locale браузера, как авто-детект)
for (const [name, prep] of CONFIG.shots) {
  await shot(gameUrl, 1920, 1080, name + '.png', prep, 'ru-RU');
  await shot(gameUrl, 1920, 1080, name + '-en.png', prep, 'en-US');
}

// Обложки 800x470 и иконка 512x512 из card.html
const card = (o) => cardUrl + '?' + new URLSearchParams(o).toString();
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleRu,sub:CONFIG.subRu,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover.png');
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleEn,sub:CONFIG.subEn,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover-en.png');
await shot(card({ w:512,h:512,mode:'icon',heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 512, 512, 'icon.png');

await browser.close();
console.log('\nАссеты готовы в', out);
