/**
 * 通过 Chrome DevTools Protocol 截图，用于视觉验收（v2）。
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
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
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
  await sleep(220);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function load() {
  await send('Page.navigate', { url: APP });
  await sleep(900);
  await evaluate('document.fonts && document.fonts.ready');
  await sleep(200);
}

/* ------------------------------------------------- 演示数据（v2） */

const H = 3600000;
const M = 60000;
const ts = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0).getTime();

function moduleWith({ name, sec, questionCount, perQuestionScore, suggestedMinutes, correctCount, children }) {
  const kids = (children || []).map((c, i) => ({
    id: `c_${name}_${i}`,
    name: c.name,
    questionCount: c.q ?? null,
    perQuestionScore: c.qp ?? null,
    correctCount: c.correct ?? null,
    score: null,
    suggestedMinutes: c.suggestedMinutes ?? null,
    startedAt: 0,
    endedAt: 0,
    elapsedMs: c.sec * 1000,
  }));
  const total = kids.length ? kids.reduce((a, c) => a + c.elapsedMs, 0) : sec * 1000;
  return {
    id: `sm_${name}`,
    name,
    maxScore: null,
    questionCount: questionCount ?? null,
    perQuestionScore: perQuestionScore ?? null,
    suggestedMinutes: suggestedMinutes ?? null,
    // 有二级模块时，得分由二级模块汇总，父模块自己不再记分
    correctCount: kids.length ? null : correctCount ?? null,
    score: !kids.length && correctCount != null && questionCount ? correctCount * (perQuestionScore ?? 1) : null,
    startedAt: 0,
    endedAt: 0,
    elapsedMs: total,
    skipped: false,
    children: kids,
  };
}

let cursor = ts(2026, 10, 18, 9, 0);
const demoModules = [
  moduleWith({ name: '常识判断', sec: 15 * 60 + 20, questionCount: 20, perQuestionScore: 0.5, suggestedMinutes: 15, correctCount: 16 }),
  moduleWith({
    name: '判断推理',
    questionCount: 40,
    perQuestionScore: 0.8,
    suggestedMinutes: 35,
    correctCount: 30,
    children: [
      { name: '图形推理', sec: 10 * 60 + 12, suggestedMinutes: 10, q: 10, correct: 7 },
      { name: '定义判断', sec: 9 * 60 + 40, suggestedMinutes: 10, q: 10, correct: 8 },
      { name: '类比推理', sec: 5 * 60 + 5, suggestedMinutes: 5, q: 10, correct: 6 },
      { name: '逻辑判断', sec: 13 * 60 + 48, suggestedMinutes: 10, q: 10, correct: 9 },
    ],
  }),
  moduleWith({ name: '资料分析', sec: 34 * 60 + 10, questionCount: 20, perQuestionScore: 1, suggestedMinutes: 30, correctCount: 20 }),
  moduleWith({ name: '言语理解', sec: 18 * 60 + 30, questionCount: 40, perQuestionScore: 0.8, suggestedMinutes: 30, correctCount: 25 }),
  moduleWith({ name: '数量关系', sec: 9 * 60 + 55, questionCount: 15, perQuestionScore: 1, suggestedMinutes: 10, correctCount: 7 }),
];
demoModules.forEach((m) => {
  m.startedAt = cursor;
  m.endedAt = cursor + m.elapsedMs;
  let c0 = cursor;
  m.children.forEach((c) => {
    c.startedAt = c0;
    c.endedAt = c0 + c.elapsedMs;
    c0 += c.elapsedMs;
  });
  cursor += m.elapsedMs;
});

const demo = {
  version: 3,
  settings: {
    clockMode: 'digital',
    sound: true,
    keepAwake: true,
    lastSetup: {
      startVirtual: 9 * H,
      endVirtual: 11 * H,
      moduleCount: 4,
      templateId: 'tpl_xc',
      examTemplateId: 'etpl_1',
      totalScore: 100,
    },
  },
  templates: [
    {
      id: 'tpl_xc',
      name: '国考行测',
      modules: [
        { id: 'tm1', name: '常识判断', maxScore: null, questionCount: 20, perQuestionScore: 0.5, suggestedMinutes: 15, children: [] },
        {
          id: 'tm2', name: '判断推理', maxScore: null, questionCount: 40, perQuestionScore: 0.8, suggestedMinutes: 35,
          children: [
            { id: 'ts1', name: '图形推理', suggestedMinutes: 10, questionCount: 10, perQuestionScore: null },
            { id: 'ts2', name: '定义判断', suggestedMinutes: 10, questionCount: 10, perQuestionScore: null },
            { id: 'ts3', name: '类比推理', suggestedMinutes: 5, questionCount: 10, perQuestionScore: null },
            { id: 'ts4', name: '逻辑判断', suggestedMinutes: 10, questionCount: 10, perQuestionScore: null },
          ],
        },
        { id: 'tm3', name: '资料分析', maxScore: null, questionCount: 20, perQuestionScore: 1, suggestedMinutes: 30, children: [] },
        { id: 'tm4', name: '言语理解', maxScore: null, questionCount: 40, perQuestionScore: 0.8, suggestedMinutes: 30, children: [] },
        { id: 'tm5', name: '数量关系', maxScore: null, questionCount: 15, perQuestionScore: 1, suggestedMinutes: 10, children: [] },
      ],
      createdAt: ts(2026, 9, 1, 10, 0),
      updatedAt: ts(2026, 9, 1, 10, 0),
    },
  ],
  examTemplates: [
    {
      id: 'etpl_1',
      name: '国考行测 上午场',
      startVirtual: 9 * H,
      endVirtual: 11 * H,
      templateId: 'tpl_xc',
      moduleCount: 5,
      totalScore: 100,
      createdAt: ts(2026, 9, 1, 10, 5),
      updatedAt: ts(2026, 9, 1, 10, 5),
    },
  ],
  sessions: [
    {
      id: 'ses_demo1',
      name: '2026 国考行测 第 3 套',
      templateId: 'tpl_xc',
      templateName: '国考行测',
      examTemplateId: 'etpl_1',
      plan: { startVirtual: 9 * H, endVirtual: 11 * H, durationMs: 2 * H, totalScore: 100 },
      modules: demoModules,
      status: 'finished',
      startedAt: ts(2026, 10, 18, 9, 0),
      finishedAt: ts(2026, 10, 18, 11, 0) - 90 * 1000,
      finishReason: 'manual',
      totalScore: null,
      note: '资料分析还是会拖，下次先做言语再回来。',
      scoresFilled: true,
    },
    {
      id: 'ses_demo2',
      name: '申论全真模拟',
      templateId: null,
      templateName: '默认模块 × 3',
      examTemplateId: null,
      plan: { startVirtual: 14 * H, endVirtual: 16 * H + 30 * M, durationMs: 150 * M, totalScore: 100 },
      modules: [
        { id: 's1', name: '模块一', maxScore: null, questionCount: null, perQuestionScore: null, suggestedMinutes: null, correctCount: null, score: null, startedAt: ts(2026, 10, 12, 14, 0), endedAt: ts(2026, 10, 12, 14, 32), elapsedMs: 32 * M, skipped: false, children: [] },
        { id: 's2', name: '模块二', maxScore: null, questionCount: null, perQuestionScore: null, suggestedMinutes: null, correctCount: null, score: null, startedAt: ts(2026, 10, 12, 14, 32), endedAt: ts(2026, 10, 12, 15, 17), elapsedMs: 45 * M, skipped: false, children: [] },
        { id: 's3', name: '模块三', maxScore: null, questionCount: null, perQuestionScore: null, suggestedMinutes: null, correctCount: null, score: null, startedAt: ts(2026, 10, 12, 15, 17), endedAt: ts(2026, 10, 12, 16, 30), elapsedMs: 73 * M, skipped: false, children: [] },
      ],
      status: 'finished',
      startedAt: ts(2026, 10, 12, 14, 0),
      finishedAt: ts(2026, 10, 12, 16, 30),
      finishReason: 'timeup',
      totalScore: null,
      note: '',
      scoresFilled: false,
    },
  ],
};

/* 追加几场历史考试，让趋势图有数据 */
const variants = [
  [12, 24, 15, 18, 5],
  [14, 27, 17, 21, 6],
  [15, 28, 19, 23, 7],
];
variants.forEach((cs, k) => {
  const base = demo.sessions[0];
  const mods = JSON.parse(JSON.stringify(base.modules));
  mods.forEach((m, i) => {
    m.correctCount = cs[i];
    m.score = m.questionCount ? cs[i] * (m.perQuestionScore ?? 1) : null;
  });
  const started = ts(2026, 9, 28 + k * 7, 9, 0);
  demo.sessions.push({
    ...base,
    id: `ses_h${k}`,
    name: `国考行测 第 ${k + 1} 套`,
    startedAt: started,
    finishedAt: started + (base.finishedAt - base.startedAt),
    modules: mods,
  });
});

console.log('· 空状态流程');
await load();
await shot('01-home');

await click('[data-act="new-exam"]');
await shot('02-new-exam');

await evaluate('localStorage.clear()');
await load();
await click('[data-act="new-exam"]');
await evaluate(`document.querySelectorAll('[data-act="pick-template"]')[1].click()`);
await shot('03-new-exam-picked-template');

await click('[data-act="start-exam"]');
await sleep(1200);
await shot('04-exam-digital');

await evaluate('window.confirm = () => true');
await click('[data-act="complete"]'); // 常识判断
await click('[data-act="complete"]'); // 子模块：图形推理
await sleep(600);
await shot('05-exam-submodule');

/* -------------------------------------------------- 演示数据 */

await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify(demo))})`);
await load();

await click('[data-act="open-session"]');
await sleep(300);
await shot('06-result-top');
await evaluate('window.scrollTo(0, 520)');
await shot('07-result-table');
await evaluate('window.scrollTo(0, 1040)');
await shot('08-result-score');
await evaluate('window.scrollTo(0, 1620)');
await shot('09-result-analysis');

await evaluate('window.scrollTo(0, 0)');
await click('[data-act="back"]');
await click('[data-act="go"][data-view="templates"]');
await shot('10-templates-modules');

await click('[data-act="tpl-edit"]');
await shot('11-template-editor');
await evaluate('window.scrollTo(0, 900)');
await shot('20-template-submodule');
await evaluate('window.scrollTo(0, 0)');

await click('[data-act="back"]');
await click('[data-act="tpl-seg"][data-kind="exams"]');
await shot('12-templates-exams');

await click('[data-act="tpl-new-exam"]');
await shot('13-exam-template-editor');

await click('[data-act="back"]');
await click('[data-act="go"][data-view="history"]');
await click('[data-act="go"][data-view="trend"]');
await shot('19-trend');

/* 记录管理 / 按模版删除 */
await evaluate('window.scrollTo(0, 0)');
await click('[data-act="back"]');
await shot('24-history');
await click('[data-act="manage-on"]');
await shot('22-history-manage');
await click('[data-act="go-purge"]');
await shot('23-purge');
await click('[data-act="back"]');
await click('[data-act="manage-off"]');

/* -------------------------------------------------- 深色 + 表盘 */

const dark = { ...demo, settings: { ...demo.settings, clockMode: 'analog' } };
await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify(dark))})`);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await load();
await shot('14-dark-home');

await click('[data-act="open-session"]');
await shot('15-dark-result');
await click('[data-act="back"]');

await click('[data-act="new-exam"]');
await evaluate(`document.querySelectorAll('[data-act="pick-template"]')[1].click()`);
await click('[data-act="start-exam"]');
await sleep(1200);
await shot('16-exam-analog-dark');

/* -------------------------------------------------- 时间到 */

const live = {
  ...demo,
  sessions: [
    {
      ...demo.sessions[0],
      id: 'ses_live',
      name: '时间到测试',
      status: 'running',
      finishedAt: null,
      finishReason: null,
      totalScore: null,
      startedAt: Date.now() - (2 * H - 7000),
      modules: demo.sessions[0].modules.map((m, i) => ({
        ...m,
        startedAt: i === 0 ? Date.now() - (2 * H - 7000) : null,
        endedAt: null,
        elapsedMs: 0,
        correctCount: null,
        score: null,
        children: m.children.map((c) => ({ ...c, startedAt: null, endedAt: null, elapsedMs: 0 })),
      })),
    },
  ],
};
await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify(live))})`);
await load();
await click('[data-act="resume"]');
await sleep(8200);
await shot('17-timeup-result');

/* -------------------------------------------------- 横屏 */

const land = JSON.parse(JSON.stringify(live));
land.sessions[0].id = 'ses_land';
land.sessions[0].startedAt = Date.now() - 22 * 60000;
land.sessions[0].modules[0].startedAt = land.sessions[0].startedAt;
land.sessions[0].modules[0].endedAt = land.sessions[0].startedAt + 15 * 60000;
land.sessions[0].modules[0].elapsedMs = 15 * 60000;
land.sessions[0].modules[1].startedAt = land.sessions[0].startedAt + 15 * 60000;
land.sessions[0].modules[1].children[0].startedAt = land.sessions[0].startedAt + 15 * 60000;
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify(land))})`);
await load();
await click('[data-act="resume"]');
await sleep(1000);
await shot('18-exam-landscape');

/* -------------------------------------------------- 长图（走下载路径） */

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const DL = path.resolve('docs/shots/_dl');
await fs.mkdir(DL, { recursive: true });
try {
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
} catch (err) {
  console.log('  (下载行为设置失败)', err.message);
}
await evaluate(`localStorage.setItem('mock-exam:v1', ${JSON.stringify(JSON.stringify(demo))})`);
await load();
await click('[data-act="open-session"]');
// 桌面/无头环境没有分享面板，强制走「下载」分支
await evaluate(`Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })`);
await click('[data-act="share-image"]');
await sleep(3000);
const files = (await fs.readdir(DL)).filter((f) => f.endsWith('.png'));
if (files.length) {
  const src = path.join(DL, files[0]);
  await fs.copyFile(src, path.join(OUT, '21-long-image.png'));
  console.log('  shot 21-long-image (来自下载)');
} else {
  console.log('  ! 没有捕获到长图下载');
}

console.log('done →', OUT);
ws.close();
process.exit(0);
