/**
 * 极简 DOM 桩 + 端到端流程冒烟测试：
 * 在 Node 里真实加载 web/js/app.js，模拟点击走完「新建 → 考试 → 完成模块 → 撤销 → 交卷 → 录分 → 模版」。
 *
 *   node tools/smoke-dom.mjs
 */
import assert from 'node:assert/strict';

/* ---------------------------------------------------------------- DOM 桩 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

function makeEl(sel = '') {
  return {
    _sel: sel,
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    disabled: false,
    checked: false,
    files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    click() {},
    focus() {},
    select() {},
    closest() { return null; },
    setAttribute() {},
    getAttribute() { return null; },
  };
}

const nodes = new Map();
const node = (sel) => {
  if (!nodes.has(sel)) nodes.set(sel, makeEl(sel));
  return nodes.get(sel);
};

const extraLists = {
  '.tpl-name-in': [
    { dataset: { i: '0' }, value: '图推' },
    { dataset: { i: '1' }, value: '资料分析' },
  ],
  '.tpl-max-in': [
    { dataset: { i: '0' }, value: '10' },
    { dataset: { i: '1' }, value: '' },
  ],
  '.module-score': [],
};

const handlers = {};
globalThis.document = {
  addEventListener(type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
  },
  removeEventListener() {},
  createElement() { return makeEl('created'); },
  querySelector(sel) { return node(sel); },
  querySelectorAll(sel) { return extraLists[sel] ? extraLists[sel].map((o) => Object.assign(makeEl(sel), o)) : []; },
  getElementById(id) { return node(`#${id}`); },
  body: { appendChild() {}, removeChild() {} },
  visibilityState: 'visible',
  execCommand: () => true,
};

globalThis.window = globalThis;
globalThis.window.scrollTo = () => {};
globalThis.window.confirm = () => true;
globalThis.window.alert = () => {};
// Node 自带 navigator（无 vibrate / wakeLock），app.js 里都有存在性判断，直接用即可
globalThis.location = { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/' };

/* ---------------------------------------------------------------- 驱动 */

const waitTick = () => new Promise((r) => setTimeout(r, 5));

function click(act, dataset = {}) {
  const btn = { dataset: { act, ...dataset }, disabled: false };
  (handlers.click || []).forEach((fn) => fn({ target: { closest: () => btn }, preventDefault() {} }));
}

const html = () => node('#app').innerHTML;
const db = () => JSON.parse(localStorage.getItem('mock-exam:v1'));
let passed = 0;

function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('渲染与流程');

await import('../web/js/app.js');
await waitTick();

ok('默认进入首页', () => {
  assert.ok(html().includes('模拟考场'));
  assert.ok(html().includes('开始模拟考试'));
  assert.ok(html().includes('09:00'));
});

ok('打开新建考试页', () => {
  click('new-exam');
  assert.ok(html().includes('新建模拟考试'));
  assert.ok(html().includes('模块模版'));
  assert.ok(html().includes('考试总分'));
});

ok('默认模版与模块数量可调', () => {
  click('mod-count', { delta: '1' });
  assert.ok(html().includes('默认模块 × 5'));
  click('mod-count', { delta: '-1' });
  assert.ok(html().includes('默认模块 × 4'));
});

ok('开始考试 → 生成 running 记录并进入考场', () => {
  click('start-exam');
  const data = db();
  assert.equal(data.sessions.length, 1);
  const s = data.sessions[0];
  assert.equal(s.status, 'running');
  assert.equal(s.plan.durationMs, 2 * 3600000);
  assert.equal(s.plan.startVirtual, 9 * 3600000);
  assert.equal(s.modules.length, 4);
  assert.equal(s.modules[0].name, '模块一');
  assert.ok(s.modules[0].startedAt > 0);
  assert.ok(html().includes('考试进行中'));
  assert.ok(html().includes('剩余'));
  assert.ok(html().includes('完成本模块'));
});

ok('完成模块记录用时并推进到下一个', () => {
  click('complete');
  const s = db().sessions[0];
  assert.ok(s.modules[0].endedAt != null);
  assert.ok(s.modules[0].elapsedMs >= 0);
  assert.ok(s.modules[1].startedAt != null);
  assert.equal(s.modules[1].endedAt, null);
});

ok('撤销上一个模块后重新计时', () => {
  click('undo');
  const s = db().sessions[0];
  assert.equal(s.modules[0].endedAt, null);
  assert.equal(s.modules[0].elapsedMs, 0);
  assert.ok(s.modules[0].startedAt != null);
});

ok('完成全部模块并交卷 → 进入分析页', () => {
  click('complete');
  click('complete');
  click('complete');
  click('complete'); // 最后一个：confirm 返回 true → 直接交卷
  const s = db().sessions[0];
  assert.equal(s.status, 'finished');
  assert.equal(s.finishReason, 'manual');
  assert.ok(s.finishedAt >= s.startedAt);
  assert.ok(html().includes('用时分布'));
  assert.ok(html().includes('模块明细'));
  assert.ok(html().includes('得分录入'));
});

ok('录入总得分后保存', () => {
  node('#f-total-score').value = '86';
  click('save-scores', { id: db().sessions[0].id });
  const s = db().sessions[0];
  assert.equal(s.totalScore, 86);
  assert.equal(s.scoresFilled, true);
  assert.ok(html().includes('86'));
});

ok('复制分析文本不会抛错（降级路径）', () => {
  click('copy-report', { id: db().sessions[0].id });
});

ok('模版页与新建模版', () => {
  click('go', { view: 'templates' });
  assert.ok(html().includes('模块模版'));
  click('tpl-new');
  assert.ok(html().includes('新建模版'));
  node('#t-name').value = '省考行测';
  click('tpl-add'); // 添加第三个模块（空名会被过滤）
  click('tpl-save');
  const data = db();
  assert.equal(data.templates.length, 2);
  const created = data.templates[1];
  assert.equal(created.name, '省考行测');
  assert.deepEqual(created.modules.map((m) => m.name), ['图推', '资料分析']);
  assert.equal(created.modules[0].maxScore, 10);
  assert.equal(created.modules[1].maxScore, null);
});

ok('模版可被选为新考试的模块来源', () => {
  click('new-exam');
  const tpl = db().templates[1];
  click('pick-template', { id: tpl.id });
  assert.ok(html().includes('省考行测'));
  click('start-exam');
  const sessions = db().sessions;
  const s = sessions[sessions.length - 1];
  assert.equal(s.templateId, tpl.id);
  assert.deepEqual(s.modules.map((m) => m.name), ['图推', '资料分析']);
  assert.equal(s.status, 'running');
});

ok('放弃考试不留下记录', () => {
  const before = db().sessions.length;
  click('abandon');
  assert.equal(db().sessions.length, before - 1);
  assert.ok(html().includes('模拟考场'));
});

ok('删除模版不影响历史记录', () => {
  const tpl = db().templates[1];
  click('go', { view: 'templates' });
  click('tpl-delete', { id: tpl.id });
  assert.equal(db().templates.length, 1);
  click('go', { view: 'history' });
  assert.ok(html().includes('模拟考试') || html().includes('用时'));
});

ok('考试记录页可打开分析', () => {
  const s = db().sessions[0];
  click('open-session', { id: s.id });
  assert.ok(html().includes('实际完成总用时'));
  assert.ok(html().includes('得分率'));
});

console.log(`\n通过 ${passed} 项`);
process.exit(0);
