import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const EXT = ROOT;
const SHOTS = ROOT + '/.artifacts';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  | ' + note : ''}`); };

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 300000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--window-size=1500,1300']
});

const welcomeSeen = browser.waitForTarget(t => t.url().includes('/src/welcome/welcome.html'), { timeout: 20000 })
  .then(t => t.url()).catch(() => '');

const extPage = await browser.newPage();
await extPage.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const info = await extPage.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res({ id: list[0]?.id, name: list[0]?.name, desc: list[0]?.description }))));
await extPage.close();
ok('extension loaded with a resolved name', info.name === 'Wikiweigher', `${info.name}`);
ok('localised description resolved from _locales', (info.desc || '').startsWith('On any Wikipedia article'), (info.desc || '').slice(0, 40));

const welcomeUrl = await welcomeSeen;
ok('first run opens the welcome page', !!welcomeUrl, welcomeUrl.split('/').pop());

const wel = await browser.newPage();
wel.errors = [];
wel.on('pageerror', e => wel.errors.push(String(e.message || e).slice(0, 200)));
await wel.setViewport({ width: 900, height: 1000 });
await wel.goto(`chrome-extension://${info.id}/src/welcome/welcome.html`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 700));
const welState = await wel.evaluate(() => {
  const steps = [...document.querySelectorAll('.step')];
  const dots = [...document.querySelectorAll('.dot')];
  return {
    ver: document.getElementById('ver').textContent,
    steps: steps.length,
    dots: dots.length,
    visible: steps.filter(s => !s.hidden).length,
    first: steps.findIndex(s => !s.hidden),
    selected: dots.findIndex(d => d.getAttribute('aria-selected') === 'true'),
    prevHidden: document.getElementById('prev').hidden,
    blank: [...document.querySelectorAll('h1, h2, .btn, .arrow')].filter(e => !e.textContent.trim()).length
  };
});
ok('welcome page renders its version and steps', /^v\d/.test(welState.ver) && welState.steps >= 3,
  `${welState.ver} steps=${welState.steps}`);
ok('one step at a time, matching the dots',
  welState.visible === 1 && welState.dots === welState.steps && welState.blank === 0,
  `visible=${welState.visible} dots=${welState.dots} blank=${welState.blank}`);
ok('the tour opens on the first step with no way back',
  welState.first === 0 && welState.selected === 0 && welState.prevHidden === true,
  `first=${welState.first} selected=${welState.selected} back-hidden=${welState.prevHidden}`);

await wel.click('#next');
await new Promise(r => setTimeout(r, 400));
const fwd = await wel.evaluate(() => {
  const steps = [...document.querySelectorAll('.step')];
  return { at: steps.findIndex(s => !s.hidden), visible: steps.filter(s => !s.hidden).length,
    selected: [...document.querySelectorAll('.dot')].findIndex(d => d.getAttribute('aria-selected') === 'true'),
    backShown: !document.getElementById('prev').hidden };
});
ok('Next advances one step and reveals Back',
  fwd.at === 1 && fwd.visible === 1 && fwd.selected === 1 && fwd.backShown,
  `at=${fwd.at} selected=${fwd.selected} back=${fwd.backShown}`);

await wel.keyboard.press('ArrowLeft');
await new Promise(r => setTimeout(r, 400));
const backAt = await wel.evaluate(() => [...document.querySelectorAll('.step')].findIndex(s => !s.hidden));
ok('the left arrow key goes back', backAt === 0, `at=${backAt}`);

await wel.keyboard.press('End');
await new Promise(r => setTimeout(r, 400));
const endState = await wel.evaluate(() => ({
  at: [...document.querySelectorAll('.step')].findIndex(s => !s.hidden),
  total: document.querySelectorAll('.step').length,
  nextHidden: document.getElementById('next').hidden
}));
ok('the last step hides Next', endState.at === endState.total - 1 && endState.nextHidden,
  `at=${endState.at}/${endState.total - 1} next-hidden=${endState.nextHidden}`);

await wel.evaluate(() => document.querySelector('.dot').click());
await new Promise(r => setTimeout(r, 400));
const dotAt = await wel.evaluate(() => [...document.querySelectorAll('.step')].findIndex(s => !s.hidden));
ok('a dot jumps straight to its step', dotAt === 0, `at=${dotAt}`);

ok('no welcome page errors', wel.errors.length === 0, wel.errors.join(' ; '));
await wel.screenshot({ path: `${SHOTS}/welcome.png` });
await wel.close();

const opt = await browser.newPage();
opt.errors = [];
opt.on('pageerror', e => opt.errors.push(String(e.message || e).slice(0, 200)));
await opt.setViewport({ width: 1180, height: 950 });
await opt.goto(`chrome-extension://${info.id}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 800));

const blanks = await opt.evaluate(() => [...document.querySelectorAll('[data-i18n]')].filter(e => !e.textContent.trim()).map(e => e.dataset.i18n));
ok('no label was blanked by the translator', blanks.length === 0, blanks.join(','));

const aria = await opt.evaluate(() => ({
  tablist: !!document.querySelector('[role="tablist"]'),
  tabs: document.querySelectorAll('[role="tab"]').length,
  panels: document.querySelectorAll('[role="tabpanel"]').length,
  selected: document.querySelectorAll('[role="tab"][aria-selected="true"]').length,
  roving: [...document.querySelectorAll('[role="tab"]')].filter(b => b.tabIndex === 0).length,
  pressed: document.querySelectorAll('[aria-pressed]').length
}));
ok('the rail is a real tablist', aria.tablist && aria.tabs === aria.panels && aria.tabs === 5, `tabs=${aria.tabs} panels=${aria.panels}`);
ok('exactly one tab is selected and focusable', aria.selected === 1 && aria.roving === 1);
ok('segmented controls report their pressed state', aria.pressed >= 9, `aria-pressed=${aria.pressed}`);

await opt.evaluate(() => document.querySelector('.rb').focus());
await opt.keyboard.press('ArrowDown');
await opt.keyboard.press('ArrowDown');
const afterKeys = await opt.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.pane);
ok('arrow keys move through the rail', afterKeys === 'reading', `landed on ${afterKeys}`);

await opt.keyboard.press('End');
const atEnd = await opt.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.pane);
ok('End jumps to the last pane', atEnd === 'about', `landed on ${atEnd}`);

const ring = await opt.evaluate(() => {
  const b = document.querySelector('.rb');
  b.focus();
  return getComputedStyle(b).outlineWidth;
});
ok('focus is visible on the rail', ring !== '0px', `outline ${ring}`);
ok('no options page errors', opt.errors.length === 0, opt.errors.join(' ; '));
await opt.close();

const pop = await browser.newPage();
pop.errors = [];
pop.on('pageerror', e => pop.errors.push(String(e.message || e).slice(0, 200)));
await pop.goto(`chrome-extension://${info.id}/src/popup/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 600));
const popBlanks = await pop.evaluate(() => [...document.querySelectorAll('[data-i18n]')].filter(e => !e.textContent.trim()).map(e => e.dataset.i18n));
ok('popup labels all resolved', popBlanks.length === 0, popBlanks.join(','));
ok('no popup errors', pop.errors.length === 0, pop.errors.join(' ; '));
await pop.close();

const de = await puppeteer.launch({
  headless: false,
  protocolTimeout: 120000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--lang=de-DE', '--window-size=1200,900']
});
try {
  const dx = await de.newPage();
  await dx.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
  const dxId = await dx.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res(list[0]?.id))));
  await dx.goto(`chrome-extension://${dxId}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 900));
  const german = await dx.evaluate(() => ({
    ui: document.documentElement.lang,
    rail: [...document.querySelectorAll('.rbl')].map(e => e.textContent).join(','),
    theme: document.querySelector('[data-i18n="theme"]')?.textContent || ''
  }));
  ok('a translated locale actually renders', german.rail.includes('Bewertung') && german.theme === 'Design', `${german.ui} | ${german.rail}`);
} finally {
  await de.close();
}

const art = await browser.newPage();
art.errors = [];
art.on('pageerror', e => art.errors.push(String(e.message || e).slice(0, 200)));
await art.setViewport({ width: 1440, height: 1050 });
await art.goto('https://en.wikipedia.org/wiki/Mount_Everest', { waitUntil: 'domcontentloaded', timeout: 60000 });
await art.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready', { timeout: 120000, polling: 1000 });

const focused = await art.evaluate(() => {
  const sr = document.getElementById('wikiweigher-host').shadowRoot;
  const row = sr.querySelector('.cx-row');
  row.focus();
  return { tag: sr.activeElement?.className || '', outline: getComputedStyle(sr.querySelector('.cx-row')).outlineWidth };
});
ok('a card row can take keyboard focus', focused.tag.includes('cx-row'), focused.tag);

await art.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 400));
const gone = await art.evaluate(() => !document.getElementById('wikiweigher-host'));
ok('Escape closes the card when focus is inside it', gone);
ok('no article page errors', art.errors.length === 0, art.errors.join(' ; '));

await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f.name + (f.note ? ' | ' + f.note : ''))); process.exit(1); }
