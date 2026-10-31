/**
 * 极简 DOM 桩 + 端到端流程冒烟测试
 * 在 Node 里真实加载 web/js/app.js，模拟点击走完：
 * 建模版（二级模块带题目数/每题分/建议用时）→ 建考试模版 → 开考（子模块计时）
 * → 撤销 → 交卷 → 二级模块录分 → 手填总分 → 趋势（分组）→ 删除（单条/按模版）→ 旧数据升级。
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
  '.sub-q-in': [inp('', '10', { i: '0', ci: '0' })],
  '.sub-qp-in': [inp('', '', { i: '0', ci: '0' })],
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
globalThis.window.prompt = () => null;
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

console.log('模版：二级模块（题目数 / 每题分 / 建议用时）');

ok('新建带子模块的模块模版', () => {
  click('go', { view: 'templates' });
  click('tpl-new');
  node('#t-name').value = '国考行测 v3';
  click('sub-add', { i: '0' });
  click('tpl-save');
  const tpl = db().templates[db().templates.length - 1];
  assert.equal(tpl.name, '国考行测 v3');
  assert.equal(tpl.modules.length, 2);
  assert.equal(tpl.modules[0].name, '判断推理');
  assert.equal(tpl.modules[0].questionCount, 40);
  assert.equal(tpl.modules[0].perQuestionScore, 0.8);
  assert.equal(tpl.modules[0].suggestedMinutes, 35);
  assert.equal(tpl.modules[0].children.length, 1);
  const child = tpl.modules[0].children[0];
  assert.equal(child.name, '图形推理');
  assert.equal(child.questionCount, 10);
  assert.equal(child.perQuestionScore, null, '没填就继承一级模块');
  assert.equal(child.suggestedMinutes, 12);
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
  assert.equal(et.totalScore, 100);
  assert.ok(et.templateId);
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
  assert.equal(s.plan.durationMs, 2 * 3600000);
  assert.equal(s.modules[0].questionCount, 40);
  assert.equal(s.modules[0].children.length, 1);
  assert.equal(s.modules[0].children[0].questionCount, 10);
  assert.ok(html().includes('子模块 1/1'));
});

console.log('考试：子模块计时');

ok('完成子模块 → 时间汇总到一级模块 → 进入下一个', () => {
  click('complete');
  const s = lastSession();
  const parent = s.modules[0];
  assert.ok(parent.children[0].endedAt != null);
  assert.equal(parent.elapsedMs, parent.children[0].elapsedMs);
  assert.ok(parent.endedAt != null);
  assert.ok(s.modules[1].startedAt != null);
});

ok('撤销回滚二级模块用时', () => {
  click('undo');
  const s = lastSession();
  const parent = s.modules[0];
  assert.equal(parent.endedAt, null);
  assert.equal(parent.children[0].elapsedMs, 0);
  assert.equal(s.modules[1].startedAt, null);
});

ok('再次完成 → 交卷', () => {
  click('complete');
  let s = lastSession();
  assert.ok(s.modules[0].endedAt != null);
  click('complete');
  s = lastSession();
  assert.equal(s.status, 'finished');
  assert.equal(s.finishReason, 'manual');
});

console.log('分析：二级模块录分');

ok('分析页显示二级模块与建议用时', () => {
  assert.ok(html().includes('实际完成总用时'));
  assert.ok(html().includes('图形推理'));
  assert.ok(html().includes('模块明细'));
  assert.ok(html().includes('得分录入'));
});

ok('按正确题数给二级模块录分（继承每题 0.8 分）', () => {
  const s = lastSession();
  const parentId = s.modules[0].id;
  node(`input[data-mod="${parentId}"][data-ci="0"]`).value = '5'; // 5/10 × 0.8 = 4
  node(`input[data-mod="${s.modules[1].id}"]`).value = '15'; // 15/20 × 1 = 15
  click('save-scores', { id: s.id });
  const after = db().sessions.find((x) => x.id === s.id);
  const parent = after.modules[0];
  assert.equal(parent.correctCount, null, '父模块不记正确题数');
  assert.equal(parent.children[0].correctCount, 5);
  assert.equal(parent.score, null, '父模块得分由二级模块汇总');
  assert.equal(after.modules[1].correctCount, 15);
  assert.equal(after.modules[1].score, null, '得分由正确题数实时换算');
  assert.ok(html().includes('19'), '各模块合计 4 + 15 = 19');
});

ok('手填总分优先于模块合计', () => {
  const s = lastSession();
  node('#f-total-score').value = '21';
  click('save-scores', { id: s.id });
  const after = db().sessions.find((x) => x.id === s.id);
  assert.equal(after.totalScore, 21);
  assert.ok(html().includes('21'));
});

console.log('趋势：按考试分组');

ok('趋势页有分组筛选', () => {
  click('go', { view: 'trend' });
  assert.ok(html().includes('趋势'));
  assert.ok(html().includes('全部'));
  assert.ok(html().includes('行测上午场'), '按考试模版名分组');
  assert.ok(html().includes('chart'));
});

ok('切换到具体考试分组', () => {
  const key = db().examTemplates[0].id;
  click('trend-group', { key });
  assert.ok(html().includes('只看'));
  assert.ok(html().includes('chart'));
  click('trend-mode', { mode: 'time' });
  assert.ok(html().includes('用时'));
  click('trend-group', { key: 'all' });
  click('back');
  assert.ok(html().includes('考试记录'));
});

console.log('删除记录');

ok('进入管理模式', () => {
  click('manage-on');
  assert.ok(html().includes('删除全部记录'));
  assert.ok(html().includes('按考试模版删除'));
});

ok('按考试模版删除页面列出分组', () => {
  click('go-purge');
  assert.ok(html().includes('行测上午场'));
  assert.ok(html().includes('1 条'));
  click('back');
});

ok('单条删除', () => {
  const before = db().sessions.length;
  click('del-session', { id: lastSession().id });
  assert.equal(db().sessions.length, before - 1);
  click('manage-off');
});

console.log('逐题模式');

ok('按题创建 30 题考试', () => {
  click('new-exam');
  click('exam-mode', { mode: 'questions' });
  node('#f-qcount').value = '30';
  click('start-exam');
  const s = lastSession();
  assert.equal(s.mode, 'questions');
  assert.equal(s.modules.length, 30);
  assert.equal(s.modules[0].name, '第1题');
  assert.equal(s.modules[29].name, '第30题');
  assert.equal(s.modules[0].questionCount, 1);
  assert.ok(html().includes('答题卡'), '题多时切换成答题卡');
  assert.ok(html().includes('/ 30'));
});

ok('逐题完成两题后交卷', () => {
  click('complete');
  click('complete');
  click('submit');
  const s = lastSession();
  assert.equal(s.status, 'finished');
  assert.ok(s.modules.filter((m) => m.endedAt != null).length >= 3);
  assert.ok(html().includes('每题用时'));
  assert.ok(html().includes('平均每题'));
  assert.ok(html().includes('最慢 5 题'));
});

ok('每题用时明细页（排序 / 展开）', () => {
  const s = lastSession();
  click('go', { view: 'history' });
  click('open-session', { id: s.id });
  click('open-questions', { id: s.id });
  assert.ok(html().includes('题目用时明细'));
  assert.ok(html().includes('平均每题'));
  assert.ok(html().includes('中位数'));
  click('q-sort', { sort: 'time' });
  assert.ok(html().includes('按用时'));
  click('q-expand', { i: '0' });
  click('back');
  assert.ok(html().includes('每题用时'));
});

ok('从记录页进详情，返回回到记录页', () => {
  click('back');
  assert.ok(html().includes('考试记录'), '不应直接跳回首页');
});

console.log('考试模版：按题结构');

ok('考试模版支持按题计时', () => {
  click('go', { view: 'templates' });
  click('tpl-seg', { kind: 'exams' });
  click('tpl-new-exam');
  node('#e-name').value = '30题套卷';
  node('#e-start').value = '09:00';
  node('#e-end').value = '11:00';
  click('etpl-mode', { mode: 'questions' });
  node('#e-qcount').value = '15';
  click('etpl-save');
  const et = db().examTemplates.find((x) => x.name === '30题套卷');
  assert.ok(et, '模版已保存');
  assert.equal(et.mode, 'questions');
  assert.equal(et.questionCount, 15);
});

ok('用逐题模版开考，满分自动等于题数', () => {
  const et = db().examTemplates.find((x) => x.name === '30题套卷');
  click('new-exam');
  click('pick-exam-template', { id: et.id });
  node('#f-qcount').value = '15';
  node('#f-total').value = '';
  click('start-exam');
  const s = lastSession();
  assert.equal(s.mode, 'questions');
  assert.equal(s.modules.length, 15);
  assert.equal(s.plan.totalScore, 15, '逐题模式不填总分时默认满分 = 题数');
  click('submit');
});

console.log('旧数据升级');

ok('v1 数据自动升级到当前版本', () => {
  const legacy = {
    version: 1,
    settings: {
      clockMode: 'digital', sound: true, keepAwake: true,
      lastSetup: { startVirtual: 32400000, endVirtual: 39600000, moduleCount: 3, templateId: null, totalScore: null },
    },
    templates: [{ id: 't1', name: '老模版', modules: [{ id: 'm1', name: '旧模块', maxScore: 30 }] }],
    sessions: [
      {
        id: 's1', name: '旧考试', templateId: 't1', templateName: '老模版',
        plan: { startVirtual: 32400000, endVirtual: 39600000, durationMs: 7200000, totalScore: 100 },
        modules: [{ id: 'sm1', name: '旧模块', maxScore: 30, score: 20, startedAt: 1, endedAt: 2, elapsedMs: 60000 }],
        status: 'finished', startedAt: 1, finishedAt: 2, finishReason: 'manual', totalScore: 20, note: '', scoresFilled: true,
      },
    ],
  };
  const { replaceAll, db: sdb } = storeMod;
  replaceAll(legacy);
  const d = sdb();
  assert.equal(d.version, 3);
  assert.deepEqual(d.templates[0].modules[0].children, []);
  assert.equal(d.templates[0].modules[0].questionCount, null);
  assert.deepEqual(d.examTemplates, []);
  assert.equal(d.sessions[0].modules[0].score, 20);
  assert.deepEqual(d.sessions[0].modules[0].children, []);
  assert.equal(d.settings.suggestWarn, true);
});

ok('按考试模版删除（升级后的数据）', () => {
  click('go', { view: 'history' });
  click('manage-on');
  click('go-purge');
  const key = db().sessions[0].templateId;
  click('purge-group', { key, label: '老模版' });
  assert.equal(db().sessions.length, 0);
  assert.ok(html().includes('考试记录'));
});

console.log(`\n通过 ${passed} 项`);
process.exit(0);
