/**
 * 极简 DOM 桩 + 端到端流程冒烟测试（v2）
 * 在 Node 里真实加载 web/js/app.js，模拟点击走完：
 * 新建模版（含二级模块/题目数/建议用时）→ 新建考试模版 → 用模版开考（子模块计时）
 * → 撤销 → 交卷 → 按正确题数录分 → 手填总分 → 记录页 → 旧数据升级。
 *
 *   node tools/smoke-dom.mjs
 */
import assert from 'node:assert/strict';
import * as storeMod from '../web/js/store.js';

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

const inp = (sel, value, dataset = {}) => Object.assign(makeEl(sel), { value, dataset });

const extraLists = {
  '.tpl-name-in': [inp('', '判断推理', { i: '0' }), inp('', '资料分析', { i: '1' })],
  '.tpl-sug-in': [inp('', '35', { i: '0' }), inp('', '30', { i: '1' })],
  '.tpl-q-in': [inp('', '40', { i: '0' }), inp('', '20', { i: '1' })],
  '.tpl-qp-in': [inp('', '0.8', { i: '0' }), inp('', '', { i: '1' })],
  '.tpl-max-in': [inp('', '', { i: '0' }), inp('', '', { i: '1' })],
  '.sub-name-in': [inp('', '图形推理', { i: '0', ci: '0' })],
  '.sub-sug-in': [inp('', '12', { i: '0', ci: '0' })],
};

const handlers = {};
globalThis.document = {
  addEventListener(type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
  },
  removeEventListener() {},
  createElement() { return makeEl('created'); },
  querySelector(sel) { return node(sel); },
  querySelectorAll(sel) {
    return extraLists[sel] ? extraLists[sel].map((o) => Object.assign(makeEl(sel), o)) : [];
  },
  getElementById(id) { return node(`#${id}`); },
  body: { appendChild() {}, removeChild() {} },
  visibilityState: 'visible',
  execCommand: () => true,
};

globalThis.window = globalThis;
globalThis.window.scrollTo = () => {};
globalThis.window.confirm = () => true;
globalThis.window.alert = () => {};
globalThis.location = { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/' };

/* ---------------------------------------------------------------- 驱动 */

function click(act, dataset = {}) {
  const btn = { dataset: { act, ...dataset }, disabled: false };
  (handlers.click || []).forEach((fn) => fn({ target: { closest: () => btn }, preventDefault() {} }));
}

const html = () => node('#app').innerHTML;
const db = () => JSON.parse(localStorage.getItem('mock-exam:v1'));
const lastSession = () => {
  const list = db().sessions;
  return list[list.length - 1];
};
let passed = 0;
const ok = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log('基础流程');

await import('../web/js/app.js');

ok('默认进入首页', () => {
  assert.ok(html().includes('模拟考场'));
  assert.ok(html().includes('开始模拟考试'));
  assert.ok(html().includes('模块模版'));
  assert.ok(html().includes('考试模版'));
});

ok('新建考试页', () => {
  click('new-exam');
  assert.ok(html().includes('新建模拟考试'));
  assert.ok(!html().includes('>考试模版</h2>'), '还没有考试模版时不显示选择区');
});

ok('开始默认考试（4 个模块）后放弃', () => {
  click('start-exam');
  const s = lastSession();
  assert.equal(s.status, 'running');
  assert.equal(s.modules.length, 4);
  assert.ok(s.modules[0].startedAt > 0);
  click('abandon');
  assert.equal(db().sessions.length, 0);
});

console.log('模版：二级模块 / 题目数 / 建议用时');

ok('新建带子模块与题目数的模块模版', () => {
  click('go', { view: 'templates' });
  click('tpl-new');
  node('#t-name').value = '国考行测 v2';
  click('sub-add', { i: '0' });
  click('tpl-save');
  const tpl = db().templates[db().templates.length - 1];
  assert.equal(tpl.name, '国考行测 v2');
  assert.equal(tpl.modules.length, 2);
  assert.equal(tpl.modules[0].name, '判断推理');
  assert.equal(tpl.modules[0].questionCount, 40);
  assert.equal(tpl.modules[0].perQuestionScore, 0.8);
  assert.equal(tpl.modules[0].suggestedMinutes, 35);
  assert.equal(tpl.modules[0].children.length, 1);
  assert.equal(tpl.modules[0].children[0].name, '图形推理');
  assert.equal(tpl.modules[0].children[0].suggestedMinutes, 12);
  assert.equal(tpl.modules[1].perQuestionScore, null);
});

ok('新建考试模版', () => {
  click('tpl-seg', { kind: 'exams' });
  click('tpl-new-exam');
  node('#e-name').value = '行测上午场';
  node('#e-start').value = '08:30';
  node('#e-end').value = '10:30';
  node('#e-total').value = '100';
  click('etpl-pick', { id: db().templates[db().templates.length - 1].id });
  click('etpl-save');
  const et = db().examTemplates[0];
  assert.equal(et.name, '行测上午场');
  assert.equal(et.startVirtual, 8 * 3600000 + 30 * 60000);
  assert.equal(et.endVirtual, 10 * 3600000 + 30 * 60000);
  assert.equal(et.totalScore, 100);
  assert.ok(et.templateId);
  assert.ok(html().includes('行测上午场'));
});

ok('用考试模版一键开考', () => {
  const et = db().examTemplates[0];
  click('new-exam');
  click('pick-exam-template', { id: et.id });
  // 模拟真实浏览器：选择模版后表单会被填上（桩里手动同步一下）
  node('#f-total').value = '100';
  node('#f-start').value = '08:30';
  node('#f-end').value = '10:30';
  click('start-exam');
  const s = lastSession();
  assert.equal(s.examTemplateId, et.id);
  assert.equal(s.plan.startVirtual, 8 * 3600000 + 30 * 60000);
  assert.equal(s.plan.durationMs, 2 * 3600000);
  assert.equal(s.plan.totalScore, 100);
  assert.equal(s.modules[0].name, '判断推理');
  assert.equal(s.modules[0].questionCount, 40);
  assert.equal(s.modules[0].children.length, 1);
  assert.ok(s.modules[0].children[0].startedAt > 0);
  assert.ok(html().includes('子模块 1/1'));
});

console.log('考试：子模块计时');

ok('完成子模块 → 时间汇总到一级模块 → 进入下一个', () => {
  click('complete');
  const s = lastSession();
  const parent = s.modules[0];
  assert.ok(parent.children[0].endedAt != null);
  assert.equal(parent.elapsedMs, parent.children[0].elapsedMs);
  assert.ok(parent.endedAt != null, '唯一的子模块完成后，父模块也完成');
  assert.ok(s.modules[1].startedAt != null, '进入下一个一级模块');
});

ok('撤销回滚二级模块用时', () => {
  click('undo');
  const s = lastSession();
  const parent = s.modules[0];
  assert.equal(parent.endedAt, null);
  assert.equal(parent.children[0].endedAt, null);
  assert.equal(parent.children[0].elapsedMs, 0);
  assert.equal(s.modules[1].startedAt, null);
  assert.ok(html().includes('图形推理'));
});

ok('再次完成 → 交卷', () => {
  click('complete'); // 子模块
  let s = lastSession();
  assert.ok(s.modules[0].endedAt != null);
  click('complete'); // 最后一个一级模块 → 触发交卷
  s = lastSession();
  assert.equal(s.status, 'finished');
  assert.equal(s.finishReason, 'manual');
});

console.log('分析：得分与建议用时');

ok('分析页显示建议用时、二级模块与效率', () => {
  assert.ok(html().includes('实际完成总用时'));
  assert.ok(html().includes('建议'));
  assert.ok(html().includes('图形推理'));
  assert.ok(html().includes('模块明细'));
});

ok('按正确题数录分', () => {
  const s = lastSession();
  node(`input[data-mod="${s.modules[0].id}"]`).value = '30';
  node(`input[data-mod="${s.modules[1].id}"]`).value = '15';
  click('save-scores', { id: s.id });
  const after = db().sessions.find((x) => x.id === s.id);
  assert.equal(after.modules[0].correctCount, 30);
  assert.equal(after.modules[0].score, 24, '30 × 0.8');
  assert.equal(after.modules[1].correctCount, 15);
  assert.equal(after.modules[1].score, 15, '每题默认 1 分');
  assert.equal(after.totalScore, null);
  assert.ok(html().includes('39'), '各模块合计 39');
});

ok('手填总分优先', () => {
  const s = lastSession();
  node('#f-total-score').value = '41';
  click('save-scores', { id: s.id });
  const after = db().sessions.find((x) => x.id === s.id);
  assert.equal(after.totalScore, 41);
  assert.ok(html().includes('41'));
});

ok('删掉模版后历史记录保留快照', () => {
  const tplId = db().templates[db().templates.length - 1].id;
  click('go', { view: 'templates' });
  click('tpl-seg', { kind: 'modules' });
  click('tpl-delete', { id: tplId });
  assert.equal(db().templates.some((t) => t.id === tplId), false);
  const s = lastSession();
  assert.equal(s.modules[0].children[0].name, '图形推理');
  assert.equal(s.modules[0].questionCount, 40);
});

ok('记录页 → 分析页', () => {
  click('go', { view: 'history' });
  const s = lastSession();
  click('open-session', { id: s.id });
  assert.ok(html().includes('得分率'));
  assert.ok(html().includes('得分录入'));
});

console.log('旧数据升级');

ok('v1 数据自动升级到 v2', () => {
  const legacy = {
    version: 1,
    settings: {
      clockMode: 'digital', sound: true, keepAwake: true,
      lastSetup: { startVirtual: 32400000, endVirtual: 39600000, moduleCount: 3, templateId: null, totalScore: null },
    },
    templates: [{ id: 't1', name: '老模版', modules: [{ id: 'm1', name: '旧模块', maxScore: 30 }] }],
    sessions: [
      {
        id: 's1', name: '旧考试', templateId: null, templateName: 'x',
        plan: { startVirtual: 32400000, endVirtual: 39600000, durationMs: 7200000, totalScore: 100 },
        modules: [{ id: 'sm1', name: '旧模块', maxScore: 30, score: 20, startedAt: 1, endedAt: 2, elapsedMs: 60000 }],
        status: 'finished', startedAt: 1, finishedAt: 2, finishReason: 'manual', totalScore: 20, note: '', scoresFilled: true,
      },
    ],
  };
  const { replaceAll, db: sdb } = storeMod;
  replaceAll(legacy);
  const d = sdb();
  assert.equal(d.version, 2);
  assert.deepEqual(d.templates[0].modules[0].children, []);
  assert.equal(d.templates[0].modules[0].questionCount, null);
  assert.deepEqual(d.examTemplates, []);
  assert.equal(d.sessions[0].modules[0].score, 20);
  assert.equal(d.sessions[0].modules[0].children.length, 0);
});

console.log(`\n通过 ${passed} 项`);
process.exit(0);
