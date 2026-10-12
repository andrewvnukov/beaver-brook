// Smoke-тест «Бобрового Ручья». Запуск: node test/smoke.mjs
// Touch-контекст (hasTouch/isMobile) и page.tap/touchscreen.tap для проверяемых игровых действий.
// Часть 1 — без SDK (localStorage-фолбэк); часть 2 — внутри iframe с моком Yandex SDK
// (page.route подменяет https://yandex.ru/games/sdk/v2): GameReady, i18n, rewarded без
// двойной выдачи, число setData на 10-часовом офлайн-возврате, лидерборд.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';
import { createServer } from 'http';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(__dirname, '..', 'index.html');
const SAVE_KEY = 'beaver_brook_v1';

const errors = [];
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true, locale: 'ru-RU' });
const page = await context.newPage();
const watch = p => { p.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); }); p.on('pageerror', e => errors.push(String(e))); };
watch(page);
// закрыть все очередные окна (офлайн/ежедневка/карточка ручья) штатными кнопками
const closeAll = async (p) => { for (let i = 0; i < 6; i++) { await p.waitForTimeout(350);
  const m = JSON.parse(await p.evaluate(() => window.render_game_to_text())).modals;
  if (!m.length) return; const btn = { offline: '#offTake', daily: '#dayTake', winCard: '#winTake', village: '#villageClose' }[m[0]]; await p.tap(btn); } };
const st = async (p = page) => JSON.parse(await p.evaluate(() => window.render_game_to_text()));
const boot = async (p = page) => { await p.waitForFunction(() => typeof window.render_game_to_text === 'function' && document.body.classList.contains('ready'), { timeout: 8000 }); await p.waitForTimeout(250); };

await page.goto(url); await boot();
let s = await st();
assert(s.level === 1 && s.n === 4 && s.targets === 1, 'fresh game: brook №1, 4x4 board, 1 flowerbed');
assert(s.gamePhase === 'play' && s.watered === 0, 'fresh board is not pre-solved');
assert(s.lang === 'ru' && (await page.textContent('#logsL')) === 'БРЁВНА', 'RU locale auto-detected (navigator) -> RU labels');
assert(s.modals.length === 0, 'no daily/offline window for a brand-new player');

// реальный tap по плитке поворачивает её на 90°
const wrong = await page.evaluate(() => window.__wrongTiles());
const ti = wrong[0];
const c = await page.evaluate(i => window.__tileCenter(i), ti);
const before = s.rots[ti];
await page.touchscreen.tap(c.x, c.y);
s = await st();
assert(s.rots[ti] === ((before + 1) & 3) && s.moves === 1, 'real touch tap on a tile rotates it 90° and counts a move');
// тап мимо поля ничего не крутит
await page.touchscreen.tap(30, 760 - 300);
s = await st(); assert(s.moves === 1, 'tap outside the board does not rotate anything');

// решаем ручей реальными тапами: каждую неправильную плитку тапаем нужное число раз
const plan = await page.evaluate(() => window.__wrongTiles().map(i => [i, window.__turnsNeeded(i), window.__tileCenter(i)]));
for (const [i, k, p] of plan) for (let j = 0; j < k; j++) { await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(30); }
s = await st();
assert(s.watered === s.targets && (s.gamePhase === 'solving' || s.gamePhase === 'card'), 'solving by real taps waters every flowerbed');
await page.waitForSelector('#winCard.open', { timeout: 3000 });
assert(true, 'win card appears after water reaches the beds');
const logs0 = (await st()).logs;
await page.tap('#winTake');
s = await st();
assert(s.level === 2 && s.solved === 1 && s.logs > logs0, 'Collect: logs credited, next brook generated');
assert(s.lifetime === s.logs, 'level reward goes through earn() (counts in lifetime)');
assert(s.gamePhase === 'play' && s.watered === 0 && s.moves === 0, 'new brook starts unsolved with 0 moves');

// x2 за ручей без SDK — ровно двойная награда, один раз; подарочная часть мимо lifetime
await page.evaluate(() => window.__solveAll()); await page.waitForSelector('#winCard.open', { timeout: 3000 });
const r1 = await st();
const reward = parseInt((await page.textContent('#winAmt')).replace(/\D/g, ''), 10);
await page.tap('#winX2');
s = await st();
assert(s.logs - r1.logs === reward * 2 && s.lifetime - r1.lifetime === reward, 'x2 collect gives exactly 2x once; gift half not counted in lifetime');

// подсказка: без SDK — сразу; поворачивает до 3 неправильных плиток в верное положение
s = await st(); const w0 = s.wrong;
await page.tap('#hintBtn');
s = await st();
assert(s.wrong === Math.max(0, w0 - 3) || s.gamePhase !== 'play', 'hint fixes up to 3 wrong tiles');
// если подсказка дорешала маленькое поле — забираем награду, чтобы дальше работать с нерешённым ручьём
await page.waitForTimeout(1100); await closeAll(page);
const lvlNow = (await st()).level;

// деревня: открыть, построить (реальный tap)
await page.evaluate(() => window.__grant(500));
await page.tap('#villageBtn');
await page.waitForSelector('#village.open');
await page.tap('#buy-bridge');
s = await st();
assert(s.built.includes('bridge') && s.ips > 0, 'building the footbridge adds passive income');
await page.tap('#buy-windmill');
s = await st(); assert(!s.built.includes('windmill'), 'cannot build without enough logs');
await page.tap('#villageClose'); await page.waitForTimeout(300);
s = await st(); assert(!s.modals.includes('village'), 'village sheet closes');

// пассивный доход: короткая отлучка не начисляется, длинная — пропорционально времени, потолок 10ч
const a0 = (await st()).logs;
await page.evaluate(() => window.advanceTime(30 * 1000)); s = await st();
assert(s.logs === a0, 'away < 1 min (MIN) credits nothing');
await page.evaluate(() => window.advanceTime(3600 * 1000)); const a1 = (await st()).logs;
await page.evaluate(() => window.advanceTime(2 * 3600 * 1000)); const a2 = (await st()).logs;
assert(Math.abs((a2 - a1) - 2 * (a1 - a0)) < 0.01, 'offline income is proportional to time (2h = 2x 1h)');
await page.evaluate(() => window.advanceTime(10 * 3600 * 1000)); const a3 = (await st()).logs;
await page.evaluate(() => window.advanceTime(20 * 3600 * 1000)); const a4 = (await st()).logs;
assert(Math.abs((a4 - a3) - (a3 - a2)) < 0.01 && (a3 - a2) > 9 * (a1 - a0), 'offline capped at 10h, and the 10h cap is fully credited (not truncated)');

// язык: реальный tap по кнопке, выбор переживает перезагрузку
await page.tap('#langBtn');
s = await st();
assert(s.lang === 'en' && (await page.textContent('#logsL')) === 'LOGS' && (await page.textContent('#hintT')) === 'Hint', 'lang toggle switches UI to EN');
await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
await page.reload(); await boot();
s = await st();
assert(s.lang === 'en' && s.built.includes('bridge') && s.level === lvlNow, 'save survives reload (lang, buildings, level)');
if (s.modals.includes('daily')) { await page.tap('#dayTake'); await page.waitForTimeout(350); }

// повороты текущего ручья сохраняются
const rotsBefore = s.rots.join(',');
const t2 = await page.evaluate(() => window.__tileCenter(window.__decoys()[0]));
await page.touchscreen.tap(t2.x, t2.y);
const rotsAfter = (await st()).rots.join(',');
await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
await page.evaluate(() => window.__freezeSave()); await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.time = Date.now(); localStorage.setItem(k, JSON.stringify(d)); }, SAVE_KEY);
await page.reload(); await boot();
s = await st();
assert(s.rots.join(',') === rotsAfter && rotsAfter !== rotsBefore, 'in-progress board rotations restored after reload');

// офлайн-окно: 6ч отлучки -> окно со строками по постройкам и кнопкой x2
await page.evaluate(() => window.__freezeSave()); await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.time = Date.now() - 6 * 3600 * 1000; d.built = ['bridge', 'lodge']; d.lastClaimDay = new Date().toISOString().slice(0, 10); localStorage.setItem(k, JSON.stringify(d)); }, SAVE_KEY);
await page.reload(); await boot();
s = await st();
const lines = await page.$$eval('#offLines .ln', l => l.length);
assert(s.modals.includes('offline') && lines === 2, 'return after 6h shows offline report with per-building lines');
const o0 = s.logs; const offAmt = parseInt((await page.textContent('#offAmt')).replace(/\D/g, ''), 10);
await page.tap('#offX2');
s = await st();
assert(Math.abs((s.logs - o0) - offAmt) <= 1 && !s.modals.includes('offline'), 'offline x2 adds the same amount once more and closes');

// ежедневная серия: вчера забирал (серия 2) -> сегодня день 3 с подсказкой; повтор в тот же день не даёт
await page.evaluate(() => window.__freezeSave()); await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.time = Date.now(); d.streak = 2; d.lastClaimDay = new Date(Date.now() - 864e5).toISOString().slice(0, 10); d.hints = 0; localStorage.setItem(k, JSON.stringify(d)); }, SAVE_KEY);
await page.reload(); await boot();
s = await st();
assert(s.modals.includes('daily'), 'daily window opens for a returning player');
const h0 = s.hints, d0 = s.logs;
await page.tap('#dayTake');
s = await st();
assert(s.streak === 3 && s.hints === h0 + 1 && s.logs > d0 && s.lifetime < s.logs + 1e9, 'day 3 claimed: streak 3, +1 hint, logs granted');
await page.reload(); await boot(); s = await st();
assert(!s.modals.includes('daily'), 'daily reward only once per day');
// пропуск дня обнуляет серию
await page.evaluate(() => window.__freezeSave()); await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.time = Date.now(); d.streak = 5; d.lastClaimDay = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10); localStorage.setItem(k, JSON.stringify(d)); }, SAVE_KEY);
await page.reload(); await boot();
await page.tap('#dayTake'); s = await st();
assert(s.streak === 1, 'missed day resets the streak to 1');
// бесплатная подсказка из серии тратится без рекламы
s = await st(); const hh = s.hints;
if (hh > 0) { await page.tap('#hintBtn'); s = await st(); assert(s.hints === hh - 1, 'free hint token is spent first'); }

// контекстная подсказка про деревню: показывается при условии, тап снимает, больше не возвращается
await page.evaluate(() => window.__freezeSave()); await page.evaluate(k => { localStorage.setItem(k, JSON.stringify({ v: 1, logs: 40, level: 2, solved: 1, tutDone: true, built: [], time: Date.now(), lastClaimDay: new Date().toISOString().slice(0, 10) })); }, SAVE_KEY);
await page.reload(); await boot();
await page.waitForSelector('#tip.on', { timeout: 4000 });
assert(await page.$('#villageBtn.tipTarget') !== null, 'village tip highlights the village button when the first building is affordable');
await page.touchscreen.tap(210, 120); await page.waitForTimeout(100);
assert(await page.$('#tip.on') === null, 'any tap dismisses the tip');
await page.reload(); await boot(); await page.waitForTimeout(1600);
s = await st(); assert(s.tips.includes('village') && await page.$('#villageBtn.tipTarget') === null, 'tip is shown only once (flag persisted)');

// битые/чужие сейвы не роняют игру
for (const bad of ['{not json', 'null', '[]', JSON.stringify({ logs: 'x', level: -5, built: ['castle', 'bridge', 'bridge'], rots: 'q', tips: null, hints: 1e9 })]) {
  await page.evaluate(() => window.__freezeSave()); await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, bad]);
  await page.reload(); await boot();
  s = await st();
  assert(s.level >= 1 && Array.isArray(s.built) && s.built.every(id => id === 'bridge') && s.built.length <= 1 && s.hints <= 99, 'corrupted save handled: ' + bad.slice(0, 24));
}

// многоуровневый прогон: поле растёт, клумб больше
await page.evaluate(() => window.__setLevel(12)); s = await st();
assert(s.n === 6 && s.targets >= 2, 'later brooks: 6x6 board with several flowerbeds');

assert(errors.length === 0, 'no console/page errors (part 1)' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

// ================= Часть 2: мок Yandex SDK внутри iframe =================
const MOCK = `
(function(){
  const P = window.parent; P.__calls = P.__calls || { ready:0, setData:[], rewarded:0, readyWhileUi:false, lb:[], langReads:0 };
  const C = P.__calls;
  const env = { i18n: {} };
  Object.defineProperty(env.i18n, 'lang', { get(){ C.langReads++; return 'en'; } });
  window.YaGames = { init: () => Promise.resolve({
    environment: env,
    features: { LoadingAPI: { ready: () => { C.ready++; C.readyWhileUi = document.body.classList.contains('ready'); } } },
    getPlayer: () => Promise.resolve({
      isAuthorized: () => true,
      getData: () => Promise.resolve(P.sessionStorage.getItem('cloud') ? { save: P.sessionStorage.getItem('cloud') } : {}),
      setData: (d, flush) => { C.setData.push(!!flush); P.sessionStorage.setItem('cloud', d.save); return Promise.resolve(); },
    }),
    leaderboards: { setScore: (n, v) => { C.lb.push([n, v]); return Promise.resolve(); } },
    adv: {
      showRewardedVideo: ({ callbacks }) => { C.rewarded++; callbacks.onOpen && callbacks.onOpen(); callbacks.onRewarded && callbacks.onRewarded(); callbacks.onClose && callbacks.onClose(true); callbacks.onError && callbacks.onError('late'); },
      showFullscreenAdv: ({ callbacks }) => { callbacks.onClose && callbacks.onClose(true); },
    },
    feedback: { canReview: () => Promise.resolve({ value: false, reason: 'NO_AUTH' }), requestReview: () => Promise.resolve({}) },
    shortcut: { canShowPrompt: () => Promise.resolve({ canShow: true }), showPrompt: () => Promise.resolve({ outcome: 'accepted' }) },
  }) };
})();`;
// same-origin http, иначе file://-iframe кросс-доменный и мок не может отчитываться родителю
const root = resolve(__dirname, '..');
const server = createServer((req, res) => {
  try { const f = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(root)) throw 0;
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript' }[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f)); } catch (e) { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const p2 = await context.newPage(); watch(p2);
await p2.route('https://yandex.ru/games/sdk/v2', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: MOCK }));
await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await p2.goto('http://127.0.0.1:' + port + '/test/frame.html');
const fr = async () => { for (let i = 0; i < 80; i++) { const f = p2.frames().find(f => f.url().endsWith('index.html')); if (f) return f; await p2.waitForTimeout(50); } throw new Error('no frame'); };
let f = await fr(); await boot(f);
let calls = await p2.evaluate(() => window.__calls);
assert(calls.ready === 1 && calls.readyWhileUi === false, 'GameReady sent exactly once, before UI became available');
assert(calls.langReads >= 1 && (await st(f)).lang === 'en' && (await f.textContent('#logsL')) === 'LOGS', 'platform language read from ysdk.environment.i18n.lang -> EN UI');
let fs = await st(f);
assert(fs.lang === 'en' && !(await f.evaluate(k => (localStorage.getItem(k) || '').includes('"lang":"en"'), SAVE_KEY)), 'auto-detected language is not persisted to the save');
// rewarded x2: мок шлёт onRewarded И поздний onError — награда должна прийти один раз
await f.evaluate(() => window.__solveAll()); await f.waitForSelector('#winCard.open', { timeout: 3000 });
const g0 = await st(f); const rw = parseInt((await f.textContent('#winAmt')).replace(/\D/g, ''), 10);
await f.tap('#winX2'); await p2.waitForTimeout(100);
fs = await st(f); calls = await p2.evaluate(() => window.__calls);
assert(calls.rewarded === 1 && fs.logs - g0.logs === rw * 2 && fs.solved === 1, 'rewarded x2 pays exactly once despite late onError');
assert(calls.lb.length === 1 && calls.lb[0][0] === 'brooks' && calls.lb[0][1] === 1, 'leaderboard setScore(brooks, solved) written via actual API');
// hint через rewarded
await f.tap('#hintBtn'); await p2.waitForTimeout(80);
calls = await p2.evaluate(() => window.__calls);
assert(calls.rewarded === 2, 'hint without free tokens goes through rewarded video');
// 10-часовой возврат на развитой деревне: мало setData, быстрый ready
await f.evaluate(() => { window.__grant(30000); ['bridge','lodge','pier','mill','gazebo','hive','lantern','windmill'].forEach(id => window.__buy(id)); window.dispatchEvent(new Event('pagehide')); });
await p2.waitForTimeout(200);
await f.evaluate(() => window.__freezeSave()); await p2.evaluate(() => { const d = JSON.parse(sessionStorage.getItem('cloud')); d.time = Date.now() - 12 * 3600 * 1000; sessionStorage.setItem('cloud', JSON.stringify(d)); });
const tStart = Date.now();
await p2.reload(); f = await fr(); await boot(f);
calls = await p2.evaluate(() => window.__calls);
fs = await st(f);
assert(calls.setData.length <= 3, '12h return: setData calls on boot <= 3 (got ' + calls.setData.length + ')');
assert(fs.modals.includes('offline') && Date.now() - tStart < 4000, '12h return: offline window shown, boot fast');
assert(calls.ready === 1, 'GameReady once on the return path as well');
// ярлык: строка в деревне, принятие даёт +2 подсказки
await closeAll(f);
const hb = (await st(f)).hints;
await f.tap('#villageBtn'); await f.waitForSelector('#shortcutBtn', { timeout: 2000 });
await f.tap('#shortcutBtn'); await p2.waitForTimeout(150);
assert((await st(f)).hints === hb + 2 && (await f.$('#shortcutBtn')) === null, 'home-screen shortcut accepted -> +2 hints, offer disappears');

assert(errors.length === 0, 'no console/page errors (all)' + (errors.length ? ' -> ' + errors.join(' | ') : ''));
await browser.close(); server.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
