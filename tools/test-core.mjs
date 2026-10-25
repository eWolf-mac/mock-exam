/**
 * core.js 逻辑单元测试（v2：二级模块 / 题目数计分 / 建议用时）
 *   node tools/test-core.mjs
 */
import assert from 'node:assert/strict';
import {
  parseHM, msToHM, msToHMS, fmtHMS, fmtMS, fmtHuman, fmtMinutes, durationFor,
  virtualNow, remainingMs, currentIndex, analyze, reportText, pct, fmtScore, defaultModules,
  fmtPerQuestion,
  allSteps, currentStep, completeCurrentStep, undoLastStep, closeCurrentStep,
  isModuleDone, moduleScore, moduleMaxScore, moduleSuggestedMs, stepSuggestedMs,
} from '../web/js/core.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const MIN = 60000;
const H = 3600000;

console.log('时间换算');

test('parseHM 09:00 / 9:00 / 非法值', () => {
  assert.equal(parseHM('09:00'), 9 * H);
  assert.equal(parseHM('9:00'), 9 * H);
  assert.equal(parseHM('23:59'), 23 * H + 59 * MIN);
  assert.equal(parseHM('24:00'), null);
  assert.equal(parseHM('9:60'), null);
  assert.equal(parseHM(''), null);
  assert.equal(parseHM(undefined), null);
});

test('msToHM / msToHMS 取模', () => {
  assert.equal(msToHM(9 * H + 30 * MIN), '09:30');
  assert.equal(msToHM(9 * H - 1), '08:59');
  assert.equal(msToHMS(9 * H + 30 * MIN + 15000), '09:30:15');
  assert.equal(msToHMS(24 * H + 1000), '00:00:01');
});

test('fmtHMS / fmtMS / fmtHuman / fmtMinutes', () => {
  assert.equal(fmtHMS(2 * H - 1000), '01:59:59');
  assert.equal(fmtHMS(-5000), '00:00:00');
  assert.equal(fmtMS(59 * MIN + 59000), '59:59');
  assert.equal(fmtMS(H + 2 * MIN + 3000), '1:02:03');
  assert.equal(fmtHuman(90 * MIN), '1 小时 30 分');
  assert.equal(fmtMinutes(45), '45 分钟');
  assert.equal(fmtMinutes(75), '1 小时 15 分');
  assert.equal(fmtMinutes(null), '—');
});

test('计划时长：正常 / 跨零点 / 相等按 24h', () => {
  assert.equal(durationFor(parseHM('09:00'), parseHM('11:00')), 2 * H);
  assert.equal(durationFor(parseHM('23:00'), parseHM('01:00')), 2 * H);
  assert.equal(durationFor(parseHM('09:00'), parseHM('09:00')), 24 * H);
});

console.log('虚拟时钟');

function makeSession(over = {}) {
  const startedAt = 1700000000000;
  return Object.assign(
    {
      id: 'ses_test',
      name: '国考行测 模拟',
      templateId: null,
      templateName: '默认模块 × 3',
      plan: { startVirtual: 9 * H, endVirtual: 11 * H, durationMs: 2 * H, totalScore: 100 },
      modules: [
        { id: 'm1', name: '常识', maxScore: 30, questionCount: null, perQuestionScore: null, suggestedMinutes: null, correctCount: null, score: 25, children: [], startedAt, endedAt: startedAt + 20 * MIN, elapsedMs: 20 * MIN },
        { id: 'm2', name: '资料分析', maxScore: 30, questionCount: null, perQuestionScore: null, suggestedMinutes: null, correctCount: null, score: 18, children: [], startedAt: startedAt + 20 * MIN, endedAt: startedAt + 95 * MIN, elapsedMs: 75 * MIN },
        { id: 'm3', name: '数量', maxScore: 40, questionCount: null, perQuestionScore: null, suggestedMinutes: null, correctCount: null, score: 30, children: [], startedAt: startedAt + 95 * MIN, endedAt: startedAt + 110 * MIN, elapsedMs: 15 * MIN },
      ],
      status: 'finished',
      startedAt,
      finishedAt: startedAt + 110 * MIN,
      finishReason: 'manual',
      totalScore: 73,
      note: '',
      scoresFilled: true,
    },
    over,
  );
}

test('虚拟时钟按时间戳推进（与真实时钟无关）', () => {
  const s = makeSession();
  assert.equal(msToHMS(virtualNow(s, s.startedAt)), '09:00:00');
  assert.equal(msToHMS(virtualNow(s, s.startedAt + 61 * MIN)), '10:01:00');
  assert.equal(remainingMs(s, s.startedAt), 2 * H);
  assert.equal(remainingMs(s, s.startedAt + 100 * MIN), 20 * MIN);
});

test('currentIndex / isModuleDone', () => {
  const s = makeSession();
  assert.equal(currentIndex(s), -1);
  s.modules[2].endedAt = null;
  assert.equal(currentIndex(s), 2);
  assert.equal(isModuleDone(s.modules[0]), true);
  assert.equal(isModuleDone(s.modules[2]), false);
});

console.log('二级模块计时');

function makeChildSession() {
  const t0 = 1700000000000;
  return {
    id: 'ses_child',
    name: '带子模块',
    plan: { startVirtual: 9 * H, endVirtual: 11 * H, durationMs: 2 * H, totalScore: 100 },
    modules: [
      {
        id: 'm1',
        name: '判断推理',
        maxScore: null,
        questionCount: 40,
        perQuestionScore: 0.8,
        suggestedMinutes: 30,
        correctCount: null,
        score: null,
        children: [
          { id: 'c1', name: '图形推理', suggestedMinutes: 10, startedAt: t0, endedAt: null, elapsedMs: 0 },
          { id: 'c2', name: '定义判断', suggestedMinutes: 10, startedAt: null, endedAt: null, elapsedMs: 0 },
        ],
        startedAt: t0,
        endedAt: null,
        elapsedMs: 0,
      },
      {
        id: 'm2',
        name: '资料分析',
        maxScore: null,
        questionCount: 20,
        perQuestionScore: 1,
        suggestedMinutes: 30,
        correctCount: null,
        score: null,
        children: [],
        startedAt: null,
        endedAt: null,
        elapsedMs: 0,
      },
    ],
    status: 'running',
    startedAt: t0,
    finishedAt: null,
  };
}

test('展开步骤：子模块逐个计时', () => {
  const s = makeChildSession();
  const steps = allSteps(s);
  assert.equal(steps.length, 3);
  assert.deepEqual(steps.map((x) => x.step.name), ['图形推理', '定义判断', '资料分析']);
  assert.equal(currentStep(s).step.name, '图形推理');
});

test('完成子模块 → 时间汇总到一级模块 → 自动进入下一个', () => {
  const s = makeChildSession();
  const t0 = s.startedAt;
  completeCurrentStep(s, t0 + 12 * MIN);
  assert.equal(s.modules[0].children[0].elapsedMs, 12 * MIN);
  assert.equal(s.modules[0].elapsedMs, 12 * MIN);
  assert.equal(s.modules[0].children[1].startedAt, t0 + 12 * MIN);
  assert.equal(s.modules[0].endedAt, null);

  completeCurrentStep(s, t0 + 20 * MIN);
  assert.equal(s.modules[0].children[1].elapsedMs, 8 * MIN);
  assert.equal(s.modules[0].elapsedMs, 20 * MIN);
  assert.equal(isModuleDone(s.modules[0]), true);
  assert.equal(s.modules[0].endedAt, t0 + 20 * MIN);
  assert.equal(s.modules[1].startedAt, t0 + 20 * MIN);
  assert.equal(currentStep(s).step.name, '资料分析');
});

test('撤销最后一个子模块：父模块用时回滚', () => {
  const s = makeChildSession();
  const t0 = s.startedAt;
  completeCurrentStep(s, t0 + 12 * MIN);
  completeCurrentStep(s, t0 + 20 * MIN);
  undoLastStep(s, t0 + 21 * MIN);
  assert.equal(s.modules[0].children[1].endedAt, null);
  assert.equal(s.modules[0].children[1].elapsedMs, 0);
  assert.equal(s.modules[0].elapsedMs, 12 * MIN);
  assert.equal(s.modules[0].endedAt, null);
  assert.equal(s.modules[1].startedAt, null);
  assert.equal(s.modules[0].children[1].startedAt, t0 + 21 * MIN);
});

test('收卷结算当前步骤', () => {
  const s = makeChildSession();
  const t0 = s.startedAt;
  completeCurrentStep(s, t0 + 12 * MIN);
  closeCurrentStep(s, t0 + 30 * MIN);
  assert.equal(s.modules[0].elapsedMs, 30 * MIN);
  assert.equal(isModuleDone(s.modules[0]), true);
});

console.log('题目数与得分');

test('模块得分：正确题数 × 每题分（默认 1 分）', () => {
  const m1 = { questionCount: 40, perQuestionScore: 0.8, correctCount: 30, score: null, maxScore: null };
  assert.equal(moduleScore(m1), 24);
  assert.equal(moduleMaxScore(m1), 32);

  const m2 = { questionCount: 20, perQuestionScore: null, correctCount: 15, score: null, maxScore: null };
  assert.equal(moduleScore(m2), 15);
  assert.equal(moduleMaxScore(m2), 20);

  const m3 = { questionCount: 10, perQuestionScore: null, correctCount: null, score: null, maxScore: null };
  assert.equal(moduleScore(m3), null);

  const m4 = { questionCount: null, perQuestionScore: null, correctCount: null, score: 12, maxScore: 20 };
  assert.equal(moduleScore(m4), 12);
  assert.equal(moduleMaxScore(m4), 20);

  const m5 = { questionCount: 40, perQuestionScore: 0.8, correctCount: 30, score: null, maxScore: 30 };
  assert.equal(moduleMaxScore(m5), 30, '显式满分优先');
});

test('总分：各模块合计，手填总分优先', () => {
  const s = makeChildSession();
  s.modules[0].correctCount = 30; // 24 分
  s.modules[1].correctCount = 18; // 18 分
  s.status = 'finished';
  s.finishedAt = s.startedAt + 90 * MIN;
  s.totalScore = null;
  let a = analyze(s);
  assert.equal(a.derivedTotal, 42);
  assert.equal(a.effectiveTotal, 42);
  assert.equal(a.scoreRate, 0.42);

  s.totalScore = 45;
  a = analyze(s);
  assert.equal(a.effectiveTotal, 45);
  assert.equal(a.scoreRate, 0.45);
  assert.ok(a.insights.some((t) => t.includes('不一致')));
});

console.log('建议用时');

test('建议用时：自身优先，否则子模块之和', () => {
  const m = { suggestedMinutes: null, children: [{ suggestedMinutes: 10 }, { suggestedMinutes: 5 }] };
  assert.equal(moduleSuggestedMs(m), 15 * MIN);
  m.suggestedMinutes = 40;
  assert.equal(moduleSuggestedMs(m), 40 * MIN);
  assert.equal(stepSuggestedMs(m, m.children[0]), 10 * MIN);
  const child = { id: 'c9', name: '没填建议的子模块', suggestedMinutes: null };
  m.children.push(child);
  assert.equal(stepSuggestedMs(m, child), null, '子模块没有建议时间时不继承');
});

test('分析里给出超时建议', () => {
  const s = makeSession();
  s.modules[1].suggestedMinutes = 60;
  s.modules[1].elapsedMs = 75 * MIN;
  s.modules[1].endedAt = s.startedAt + 95 * MIN;
  const a = analyze(s);
  assert.equal(a.rows[1].overrunMs, 15 * MIN);
  assert.ok(a.insights.some((t) => t.includes('多花了') && t.includes('资料分析')));
});

test('每题平均耗时与速度对比', () => {
  const s = makeSession();
  s.modules[1].questionCount = 20; // 75 分钟 / 20 题 = 3 分 45 秒
  s.modules[2].questionCount = 15; // 15 分钟 / 15 题 = 1 分钟
  const a = analyze(s);
  assert.equal(a.rows[1].questionCount, 20);
  assert.equal(a.rows[1].avgPerQuestionMs, (75 * MIN) / 20);
  assert.equal(a.rows[0].avgPerQuestionMs, null, '没有题目数时为 null');
  assert.equal(fmtPerQuestion(102000), '1 分 42 秒');
  assert.equal(fmtPerQuestion(32000), '32 秒');
  assert.equal(fmtPerQuestion(60000), '1 分');
  assert.ok(a.insights.some((t) => t.includes('平均每题') && t.includes('资料分析')));
});

console.log('分析（旧字段兼容）');

test('已录入得分：总分、得分率、效率标签、提示', () => {
  const s = makeSession();
  const a = analyze(s);
  assert.equal(a.totalModuleMs, 110 * MIN);
  assert.equal(a.wallMs, 110 * MIN);
  assert.equal(a.remainMs, 10 * MIN);
  assert.equal(a.derivedTotal, 73);
  assert.equal(a.allScored, true);
  assert.equal(a.scoreRate, 0.73);
  assert.equal(a.rows.length, 3);

  const r2 = a.rows[1];
  assert.equal(r2.ms, 75 * MIN);
  assert.ok(Math.abs(r2.timeShare - 75 / 110) < 1e-9);
  assert.ok(Math.abs(r2.rate - 0.6) < 1e-9);
  assert.equal(r2.tag.text, '低效');
  assert.equal(a.rows[0].tag.text, '优势');
  assert.ok(a.insights.some((t) => t.includes('资料分析')));
  assert.ok(a.insights.some((t) => t.includes('压缩')));
  assert.ok(a.insights.some((t) => t.includes('提前')));
});

test('未录入得分：按用时占比打标签并提示补录', () => {
  const s = makeSession({ totalScore: null });
  s.modules.forEach((m) => { m.score = null; });
  const a = analyze(s);
  assert.equal(a.hasScores, false);
  assert.equal(a.allScored, false);
  assert.equal(a.scoreRate, null);
  assert.equal(a.effectiveTotal, null);
  assert.equal(a.rows[1].tag.text, '重头');
  assert.equal(a.rows[2].tag.text, '一般');
  assert.ok(a.insights.some((t) => t.includes('还没有录入得分')));
});

test('只填总分不填模块分：不产生效率对比', () => {
  const s = makeSession();
  s.modules.forEach((m) => { m.score = null; });
  s.totalScore = 60;
  const a = analyze(s);
  assert.equal(a.scoreRate, 0.6);
  assert.equal(a.rows[0].scoreShare, null);
  assert.equal(a.rows[0].tag.text, '一般');
});

test('超时场景 remainMs 为负', () => {
  const s = makeSession();
  s.finishedAt = s.startedAt + 130 * MIN;
  const a = analyze(s);
  assert.ok(a.remainMs < 0);
  assert.ok(a.insights.some((t) => t.includes('超出计划时间')));
});

test('模块用时全为 0 时不出现 NaN', () => {
  const s = makeSession();
  s.modules.forEach((m) => { m.elapsedMs = 0; m.score = null; });
  const a = analyze(s);
  assert.equal(a.totalModuleMs, 0);
  assert.ok(a.rows.every((r) => Number.isFinite(r.timeShare)));
  assert.ok(a.insights.every((t) => !t.includes('NaN')));
  assert.equal(a.rows[0].tag.text, '未开始');
});

console.log('文本报告与工具');

test('reportText 含关键信息（含子模块）', () => {
  const s = makeChildSession();
  s.modules[0].correctCount = 30;
  s.modules[1].correctCount = 18;
  s.status = 'finished';
  s.finishedAt = s.startedAt + 90 * MIN;
  const text = reportText(s);
  assert.ok(text.includes('带子模块'));
  assert.ok(text.includes('判断推理'));
  assert.ok(text.includes('图形推理'));
  assert.ok(text.includes('42'));
});

test('pct / fmtScore / defaultModules v2 字段', () => {
  assert.equal(pct(0.7333, 1), '73.3%');
  assert.equal(pct(null), '—');
  assert.equal(fmtScore(73.5), '73.5');
  assert.equal(fmtScore(null), '—');
  const mods = defaultModules(3);
  assert.equal(mods.length, 3);
  assert.equal(mods[0].name, '模块一');
  assert.deepEqual(mods[0].children, []);
  assert.equal(defaultModules(1).length, 2);
  assert.equal(defaultModules(99).length, 8);
});

console.log(`\n通过 ${passed} 项`);
