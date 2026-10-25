/**
 * core.js 逻辑单元测试
 *   node tools/test-core.mjs
 */
import assert from 'node:assert/strict';
import {
  parseHM, msToHM, msToHMS, fmtHMS, fmtMS, fmtHuman, durationFor,
  virtualNow, remainingMs, currentIndex, analyze, reportText, pct, fmtScore, defaultModules,
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

test('fmtHMS / fmtMS / fmtHuman', () => {
  assert.equal(fmtHMS(2 * H - 1000), '01:59:59');
  assert.equal(fmtHMS(-5000), '00:00:00');
  assert.equal(fmtMS(59 * MIN + 59000), '59:59');
  assert.equal(fmtMS(H + 2 * MIN + 3000), '1:02:03');
  assert.equal(fmtHuman(90 * MIN), '1 小时 30 分');
  assert.equal(fmtHuman(45 * MIN), '45 分 0 秒');
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
        { id: 'm1', name: '常识', maxScore: 30, score: 25, startedAt, endedAt: startedAt + 20 * MIN, elapsedMs: 20 * MIN },
        { id: 'm2', name: '资料分析', maxScore: 30, score: 18, startedAt: startedAt + 20 * MIN, endedAt: startedAt + 95 * MIN, elapsedMs: 75 * MIN },
        { id: 'm3', name: '数量', maxScore: 40, score: 30, startedAt: startedAt + 95 * MIN, endedAt: startedAt + 110 * MIN, elapsedMs: 15 * MIN },
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
  // 结束之后（未收卷的极端情况）继续推进并回绕
  assert.equal(remainingMs(s, s.startedAt), 2 * H);
  assert.equal(remainingMs(s, s.startedAt + 100 * MIN), 20 * MIN);
});

test('currentIndex 找到第一个未完成模块', () => {
  const s = makeSession();
  assert.equal(currentIndex(s), -1);
  s.modules[2].endedAt = null;
  s.modules[2].elapsedMs = 0;
  assert.equal(currentIndex(s), 2);
});

console.log('分析');

test('已录入得分：总分、得分率、效率标签、提示', () => {
  const s = makeSession();
  const a = analyze(s);
  assert.equal(a.totalModuleMs, 110 * MIN);
  assert.equal(a.wallMs, 110 * MIN);
  assert.equal(a.remainMs, 10 * MIN);
  assert.equal(a.sumScores, 73);
  assert.equal(a.allScored, true);
  assert.equal(a.scoreRate, 0.73);
  assert.equal(a.rows.length, 3);

  const r2 = a.rows[1];
  assert.equal(r2.ms, 75 * MIN);
  assert.ok(Math.abs(r2.timeShare - 75 / 110) < 1e-9);
  assert.ok(Math.abs(r2.rate - 0.6) < 1e-9);
  assert.ok(Math.abs(r2.scoreShare - 18 / 73) < 1e-9);
  // 得分占比 24.7% / 用时占比 68.2% => 低效
  assert.equal(r2.tag.text, '低效');
  // 常识：scoreShare 34.2% / timeShare 18.2% => 优势
  assert.equal(a.rows[0].tag.text, '优势');

  assert.ok(a.insights.some((t) => t.includes('资料分析')), '应指出用时最多的模块');
  assert.ok(a.insights.some((t) => t.includes('压缩')), '应给出压缩建议');
  assert.ok(a.insights.some((t) => t.includes('提前')), '应提示提前交卷');
});

test('未录入得分：按用时占比打标签并提示补录', () => {
  const s = makeSession({ totalScore: null });
  s.modules.forEach((m) => { m.score = null; });
  const a = analyze(s);
  assert.equal(a.hasScores, false);
  assert.equal(a.allScored, false);
  assert.equal(a.scoreRate, null);
  assert.equal(a.rows[1].tag.text, '重头'); // 68%
  assert.equal(a.rows[2].tag.text, '一般'); // 15/110 = 13.6%
  assert.ok(a.insights.some((t) => t.includes('还没有录入得分')));
});

test('只填总分不填模块分：不产生效率对比', () => {
  const s = makeSession();
  s.modules.forEach((m) => { m.score = null; });
  s.totalScore = 60;
  const a = analyze(s);
  assert.equal(a.scoreRate, 0.6);
  assert.equal(a.rows[0].scoreShare, null);
  assert.equal(a.rows[0].tag.text, '一般'); // 18.2% 用时
});

test('模块得分合计与总得分不一致时给出提醒', () => {
  const s = makeSession({ totalScore: 80 });
  const a = analyze(s);
  assert.ok(a.insights.some((t) => t.includes('不一致')));
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
});

console.log('文本报告与工具');

test('reportText 含关键信息', () => {
  const text = reportText(makeSession());
  assert.ok(text.includes('国考行测 模拟'));
  assert.ok(text.includes('09:00–11:00'));
  assert.ok(text.includes('资料分析'));
  assert.ok(text.includes('73'));
});

test('pct / fmtScore / defaultModules', () => {
  assert.equal(pct(0.7333, 1), '73.3%');
  assert.equal(pct(null), '—');
  assert.equal(fmtScore(73), '73');
  assert.equal(fmtScore(73.5), '73.5');
  assert.equal(fmtScore(null), '—');
  const mods = defaultModules(3);
  assert.equal(mods.length, 3);
  assert.equal(mods[0].name, '模块一');
  assert.equal(defaultModules(1).length, 2); // 下限保护
  assert.equal(defaultModules(99).length, 8); // 上限保护
});

console.log(`\n通过 ${passed} 项`);
