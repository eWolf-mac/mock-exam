/**
 * 通过 Chrome DevTools Protocol 截图，用于视觉验收。
 * 前置：headless Chrome 已用 --remote-debugging-port=9222 启动，本地服务在 8123。
 *
 *   node tools/shots.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = 9222;
const APP = 'http://127.0.0.1:8123/';
const OUT = path.resolve('docs/shots');
await fs.mkdir(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets = null;
for (let i = 0; i < 30 && !targets; i += 1) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  } catch {
    await sleep(300);
  }
}
if (!targets) throw new Error('无法连接 Chrome 调试端口');
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('没有可用的页面目标');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Page.javascriptDialogOpening') {
    send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  }
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = (seq += 1);
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function shot(name) {
  await sleep(320);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('  shot', name);
}

async function click(selector) {
  const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`找不到元素 ${selector}`);
  await sleep(200);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});

async function load() {
  await send('Page.navigate', { url: APP });
  await sleep(900);
  await evaluate('document.fonts && document.fonts.ready');
  await sleep(200);
}

console.log('· 空状态流程');
await load();
await shot('01-home');

await click('[data-act="new-exam"]');
await shot('02-new-exam');

await evaluate(`localStorage.clear()`);
await load();
await click('[data-act="new-exam"]');
await evaluate(`document.querySelectorAll('[data-act="pick-template"]')[1].click()`);
await shot('03-new-exam-picked-template');

await click('[data-act="start-exam"]');
await sleep(1200);
await shot('04-exam-clock');

await evaluate('window.confirm = () => true');
await click('[data-act="complete"]');
await sleep(900);
await click('[data-act="complete"]');
await sleep(600);
await shot('05-exam-progress');

/* ------------------------------------------------ 灌入一份真实感的演示数据 */

const H = 3600000;
const M = 60000;
const ts = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0).getTime();

function buildSession({ id, name, start, arr, totalScore, plan, finishReason, note }) {
  let cursor = start;
  const modules = arr.map((m, i) => {
    const started = cursor;
    const ended = started + m.sec * 1000;
    cursor = ended;
    return {
      id: `sm_${id}_${i}`,
      name: m.name,
      maxScore: m.max ?? null,
      score: m.score ?? null,
      startedAt: started,
      endedAt: ended,
      elapsedMs: m.sec * 1000,
      skipped: false,
    };
  });
  return {
    id,
    name,
    templateId: null,
    templateName: plan.templateName,
    plan: {
      startVirtual: plan.startVirtual,
      endVirtual: plan.endVirtual,
      durationMs: plan.durationMs,
      totalScore: plan.totalScore,
    },
    modules,
    status: 'finished',
    startedAt: start,
    finishedAt: start + plan.wallSec * 1000,
    finishReason,
    totalScore,
    note,
    scoresFilled: totalScore != null,
  };
}

const demo = {
  version: 1,
  settings: {
    clockMode: 'digital',
    sound: true,
    keepAwake: true,
    lastSetup: {
      startVirtual: 9 * H,
      endVirtual: 11 * H,
      moduleCount: 4,
      templateId: 'tpl_xc',
      totalScore: 100,
    },
  },
  templates: [
    {
      id: 'tpl_xc',
      name: '国考行测',
      modules: [
        { id: 'tm1', name: '常识判断', maxScore: 20 },
        { id: 'tm2', name: '判断推理', maxScore: 30 },
        { id: 'tm3', name: '资料分析', maxScore: 30 },
        { id: 'tm4', name: '言语理解', maxScore: 30 },
        { id: 'tm5', name: '数量关系', maxScore: 20 },
      ],
      createdAt: ts(2026, 9, 1, 10, 0),
      updatedAt: ts(2026, 9, 1, 10, 0),
    },
    {
      id: 'tpl_sl',
      name: '申论',
      modules: [
        { id: 'tm6', name: '归纳概括', maxScore: 20 },
        { id: 'tm7', name: '综合分析', maxScore: 30 },
        { id: 'tm8', name: '大作文', maxScore: 50 },
      ],
      createdAt: ts(2026, 9, 2, 10, 0),
      updatedAt: ts(2026, 9, 2, 10, 0),
    },
  ],
  sessions: [
    buildSession({
      id: 'ses_demo1',
      name: '2026 国考行测 第 3 套',
      start: ts(2026, 10, 18, 9, 0),
      arr: [
        { name: '常识判断', sec: 15 * 60 + 20, max: 20, score: 14 },
        { name: '判断推理', sec: 38 * 60 + 45, max: 30, score: 24 },
        { name: '资料分析', sec: 34 * 60 + 10, max: 30, score: 21 },
        { name: '言语理解', sec: 18 * 60 + 30, max: 30, score: 17 },
        { name: '数量关系', sec: 9 * 60 + 55, max: 20, score: 6 },
      ],
      totalScore: 82,
      plan: {
        templateName: '国考行测',
        startVirtual: 9 * H,
        endVirtual: 11 * H,
        durationMs: 2 * H,
        totalScore: 100,
        wallSec: 118 * 60 + 30,
      },
      finishReason: 'manual',
      note: '资料分析还是会拖，下次先做言语再回来。',
    }),
    buildSession({
      id: 'ses_demo2',
      name: '申论全真模拟',
      start: ts(2026, 10, 12, 14, 0),
      arr: [
        { name: '归纳概括', sec: 32 * 60, max: 20 },
        { name: '综合分析', sec: 45 * 60, max: 30 },
        { name: '大作文', sec: 38 * 60, max: 50 },
      ],
      totalScore: null,
      plan: {
        templateName: '申论',
        startVirtual: 14 * H,
        endVirtual: 16 * 60 * 60 / 60 * 60,
        durationMs: 150 * M,
        totalScore: 100,
        wallSec: 150 * 60,
      },
      finishReason: 'timeup',
      note: '',
    }),
  ],
};

// 修正申论结束时间：14:00 + 150 分钟 = 16:30
demo.sessions[1].plan.endVirtual = 16 * H + 30 * M;

await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify(demo))})`);
await load();
await shot('06-home-with-records');

await click('[data-act="open-session"]');
await sleep(400);
await shot('07-result-top');
await evaluate('window.scrollTo(0, 560)');
await shot('08-result-modules');
await evaluate('window.scrollTo(0, 1120)');
await shot('09-result-analysis');

await evaluate('window.scrollTo(0, 0)');
await click('[data-act="back"]');
await click('[data-act="go"][data-view="templates"]');
await shot('10-templates');

await click('[data-act="go"][data-view="history"]');
await shot('11-history');

/* 模版编辑页 */
await click('[data-act="go"][data-view="templates"]');
await click('[data-act="tpl-edit"]');
await shot('12-template-editor');

/* 深色模式 + 表盘时钟 */
const darkDemo = {
  ...demo,
  settings: { ...demo.settings, clockMode: 'analog' },
};
await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify(darkDemo))})`);
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'dark' }],
});
await load();
await shot('13-home-dark');

await click('[data-act="open-session"]');
await shot('14-result-dark');
await click('[data-act="back"]');

await click('[data-act="new-exam"]');
await evaluate(`document.querySelectorAll('[data-act="pick-template"]')[1].click()`);
await click('[data-act="start-exam"]');
await sleep(1200);
await shot('15-exam-analog-dark');

/* -------------------------------------------------- 时间到：自动收卷流程 */

const now = Date.now();
const live = JSON.parse(JSON.stringify(demo.sessions[0]));
live.id = 'ses_live';
live.name = '时间到测试';
live.status = 'running';
live.finishedAt = null;
live.finishReason = null;
live.totalScore = null;
live.startedAt = now - (live.plan.durationMs - 7000);
live.modules = live.modules.map((m, i) => ({
  ...m,
  startedAt: i === 0 ? live.startedAt : null,
  endedAt: null,
  elapsedMs: 0,
  score: null,
}));

await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify({ ...demo, settings: { ...demo.settings, clockMode: 'digital' }, sessions: [live] }))})`);
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'dark' }],
});
await load();
await shot('16-resume-card');

await click('[data-act="resume"]');
await sleep(1200);
await shot('17-countdown-last-seconds');

await sleep(7500);
await shot('18-timeup-result');

/* ------------------------------------------------------------ 横屏考试 */

const land = JSON.parse(JSON.stringify(live));
land.id = 'ses_land';
land.status = 'running';
land.finishedAt = null;
land.finishReason = null;
land.startedAt = Date.now() - 12 * 60000;
land.modules = land.modules.map((m, i) => ({
  ...m,
  startedAt: i === 0 ? land.startedAt : i === 1 ? land.startedAt + 6 * 60000 : null,
  endedAt: i === 0 ? land.startedAt + 6 * 60000 : null,
  elapsedMs: i === 0 ? 6 * 60000 : 0,
}));

await send('Emulation.setDeviceMetricsOverride', {
  width: 844,
  height: 390,
  deviceScaleFactor: 2,
  mobile: true,
});
await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify({ ...demo, settings: { ...demo.settings, clockMode: 'analog' }, sessions: [land] }))})`);
await load();
await click('[data-act="resume"]');
await sleep(1000);
await shot('19-exam-landscape');

console.log('done →', OUT);
ws.close();
process.exit(0);
