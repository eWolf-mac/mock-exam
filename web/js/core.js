/**
 * core.js —— 纯逻辑层（无 DOM 依赖，可在 Node 中直接测试）
 *
 * v2 新增：
 *  - 二级模块：一级模块可含 children，时间逐级汇总到一级模块
 *  - 题目数 / 每题分数：按正确题数折算得分（每题分默认 1）
 *  - 各模块建议用时：与实际用时对比
 *  - 考试模版：名称 + 起止时间 + 模块模版 + 总分
 *
 * 关键约定：
 *  - 虚拟时间 = 一天内的毫秒偏移（0 … 86399999）
 *  - 考试中的虚拟时钟必须由「真实时间戳差值」推算，绝不能用定时器累加
 *  - 所有分数、满分、题目数都可为 null
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DATA_VERSION = 3;

export const MODULE_COLORS = [
  '#3DDC97', '#4AA8FF', '#FFC857', '#B983FF',
  '#FF7A9C', '#5CE1E6', '#F5A623', '#93A7BA',
];

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/* ---------------------------------------------------------------- 基础工具 */

export function pad2(n) {
  return String(Math.abs(Math.trunc(n))).padStart(2, '0');
}

export function uid(prefix) {
  const rnd = Math.random().toString(36).slice(2, 8);
  const tail = Date.now().toString(36).slice(-4);
  return `${prefix}_${rnd}${tail}`;
}

export function cnNum(n) {
  return CN_NUM[n] || String(n);
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** "09:00" / "9:00" -> 毫秒偏移，非法返回 null */
export function parseHM(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return (h * 60 + mi) * 60000;
}

/** 毫秒偏移 -> "HH:MM" */
export function msToHM(ms) {
  const norm = ((Math.round(ms) % DAY_MS) + DAY_MS) % DAY_MS;
  const total = Math.floor(norm / 60000);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** 时刻（毫秒偏移）-> "HH:MM:SS" */
export function msToHMS(ms) {
  const norm = ((Math.round(ms) % DAY_MS) + DAY_MS) % DAY_MS;
  const total = Math.floor(norm / 1000);
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
}

/** 时长 -> "HH:MM:SS" */
export function fmtHMS(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
}

/** 时长 -> "MM:SS"（超过 1 小时用 "H:MM:SS"） */
export function fmtMS(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  if (total >= 3600) {
    return `${Math.floor(total / 3600)}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
  }
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** 时长 -> "1 小时 12 分" */
export function fmtHuman(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

/** 分钟数 -> "30 分钟" / "1 小时 5 分" */
export function fmtMinutes(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分` : `${h} 小时`;
}

export function pct(x, digits = 0) {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

/** 计划时长（结束 <= 开始 视为跨零点，等于开始视为 24 小时） */
export function durationFor(startVirtual, endVirtual) {
  let d = endVirtual - startVirtual;
  if (d <= 0) d += DAY_MS;
  return d;
}

/** 解析可空数字；空字符串 / null / 非法 -> null */
export function numOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v).trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 分数显示：去掉无意义的小数位 */
export function fmtScore(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/* -------------------------------------------------------------- 考试时间轴 */

/** 考试经过的真实毫秒数（已收卷的考试停在收卷时刻） */
export function elapsedWall(session, now = Date.now()) {
  if (!session || !session.startedAt) return 0;
  const end = session.finishedAt ? Math.min(now, session.finishedAt) : now;
  return Math.max(0, end - session.startedAt);
}

/** 当前虚拟时刻（毫秒偏移） */
export function virtualNow(session, now = Date.now()) {
  if (!session) return 0;
  return (session.plan.startVirtual + elapsedWall(session, now)) % DAY_MS;
}

/** 距考试结束还剩多少毫秒（负数表示已超时） */
export function remainingMs(session, now = Date.now()) {
  if (!session) return 0;
  return session.plan.durationMs - elapsedWall(session, now);
}

/* ------------------------------------------------------- 模块 / 二级模块 */

export function hasChildren(m) {
  return !!(m && Array.isArray(m.children) && m.children.length);
}

/** 展开成「计时步骤」：有子模块则逐个，否则模块自身算一步 */
export function allSteps(session) {
  const out = [];
  if (!session || !Array.isArray(session.modules)) return out;
  session.modules.forEach((m, mi) => {
    if (hasChildren(m)) {
      m.children.forEach((c, ci) => {
        out.push({ module: m, moduleIndex: mi, step: c, childIndex: ci, isChild: true });
      });
    } else {
      out.push({ module: m, moduleIndex: mi, step: m, childIndex: -1, isChild: false });
    }
  });
  return out;
}

/** 第一个没结束的步骤，全部完成返回 null */
export function currentStep(session) {
  return allSteps(session).find((x) => x.step.endedAt == null) || null;
}

/** 第一个没完成的模块下标（兼容旧调用） */
export function currentIndex(session) {
  if (!session) return -1;
  return session.modules.findIndex((m) => !isModuleDone(m));
}

export function isModuleDone(m) {
  if (hasChildren(m)) return m.children.every((c) => c.endedAt != null);
  return m.endedAt != null;
}

/** 把子模块用时汇总到一级模块 */
export function recomputeModule(m) {
  if (!m || !hasChildren(m)) return m;
  let total = 0;
  let started = null;
  let endedAll = true;
  let lastEnd = null;
  m.children.forEach((c) => {
    total += Math.max(0, c.elapsedMs || 0);
    if (c.startedAt && (started == null || c.startedAt < started)) started = c.startedAt;
    if (c.endedAt == null) endedAll = false;
    else if (lastEnd == null || c.endedAt > lastEnd) lastEnd = c.endedAt;
  });
  m.elapsedMs = total;
  m.startedAt = started;
  m.endedAt = endedAll ? lastEnd : null;
  return m;
}

/** 完成当前步骤：记录用时，并启动下一步 */
export function completeCurrentStep(session, now = Date.now()) {
  const steps = allSteps(session);
  const idx = steps.findIndex((x) => x.step.endedAt == null);
  if (idx < 0) return null;
  const cur = steps[idx];
  if (!cur.step.startedAt) cur.step.startedAt = now;
  cur.step.endedAt = now;
  cur.step.elapsedMs = Math.max(0, now - cur.step.startedAt);
  if (idx + 1 < steps.length && !steps[idx + 1].step.startedAt) {
    steps[idx + 1].step.startedAt = now;
  }
  session.modules.forEach((m) => recomputeModule(m));
  return cur;
}

/** 撤销最后一个已完成的步骤（清零重计） */
export function undoLastStep(session, now = Date.now()) {
  const steps = allSteps(session);
  let last = -1;
  steps.forEach((x, i) => { if (x.step.endedAt != null) last = i; });
  if (last < 0) return null;
  const target = steps[last];
  for (let i = last; i < steps.length; i += 1) {
    steps[i].step.endedAt = null;
    steps[i].step.elapsedMs = 0;
    steps[i].step.startedAt = i === last ? now : null;
  }
  session.modules.forEach((m) => recomputeModule(m));
  return target;
}

/** 收卷：结算当前步骤 */
export function closeCurrentStep(session, now = Date.now()) {
  const cur = currentStep(session);
  if (!cur) return null;
  if (!cur.step.startedAt) cur.step.startedAt = now;
  cur.step.endedAt = now;
  cur.step.elapsedMs = Math.max(0, now - cur.step.startedAt);
  session.modules.forEach((m) => recomputeModule(m));
  return cur;
}

/* --------------------------------------------------------------- 分值计算 */

export function perQuestionScore(m) {
  return m && m.perQuestionScore != null ? m.perQuestionScore : 1;
}

/** 每题平均耗时 -> "1 分 42 秒" */
export function fmtPerQuestion(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} 秒`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m} 分 ${s} 秒` : `${m} 分`;
}

/** 模块满分：有二级模块时按二级模块合计；否则显式满分或用 题目数 × 每题分 */
export function moduleMaxScore(m) {
  if (!m) return null;
  if (hasChildren(m)) {
    const vals = m.children.map((c) => childMaxScore(c, m));
    if (vals.every((v) => v != null)) return vals.reduce((a, b) => a + b, 0);
  }
  if (m.maxScore != null) return m.maxScore;
  if (m.questionCount != null && m.questionCount > 0) return m.questionCount * perQuestionScore(m);
  return null;
}

/** 二级模块的每题分值：自己没填就继承一级模块，再没有按 1 分 */
export function childPerQuestionScore(child, parent) {
  if (child && child.perQuestionScore != null) return child.perQuestionScore;
  if (parent && parent.perQuestionScore != null) return parent.perQuestionScore;
  return 1;
}

export function childMaxScore(child, parent) {
  if (!child) return null;
  if (child.maxScore != null) return child.maxScore;
  if (child.questionCount != null && child.questionCount > 0) {
    return child.questionCount * childPerQuestionScore(child, parent);
  }
  return null;
}

export function childScoreValue(child, parent) {
  if (!child) return null;
  if (child.score != null) return child.score;
  if (child.correctCount != null && child.questionCount != null) {
    return child.correctCount * childPerQuestionScore(child, parent);
  }
  return null;
}

/** 模块得分：有二级模块时 = 各二级模块之和（全部录完才算）；否则显式得分或 正确题数 × 每题分 */
export function moduleScore(m) {
  if (!m) return null;
  if (hasChildren(m)) {
    const vals = m.children.map((c) => childScoreValue(c, m));
    if (vals.some((v) => v == null)) return null;
    return vals.reduce((a, b) => a + b, 0);
  }
  if (m.score != null) return m.score;
  if (m.correctCount != null && m.questionCount != null) {
    return m.correctCount * perQuestionScore(m);
  }
  return null;
}

/** 模块建议用时（毫秒）：自身优先，否则子模块之和 */
export function moduleSuggestedMs(m) {
  if (!m) return null;
  if (m.suggestedMinutes != null) return Math.round(m.suggestedMinutes * 60000);
  if (hasChildren(m)) {
    const sum = m.children.reduce((a, c) => a + (c.suggestedMinutes || 0), 0);
    return sum > 0 ? Math.round(sum * 60000) : null;
  }
  return null;
}

/** 某一步骤的建议用时（毫秒）：子模块用自己的，没有就返回 null；模块自身回落到模块建议 */
export function stepSuggestedMs(module, step) {
  if (!step) return moduleSuggestedMs(module);
  if (step.suggestedMinutes != null) return Math.round(step.suggestedMinutes * 60000);
  const isChild = Array.isArray(module.children) && module.children.includes(step);
  if (isChild) return null;
  return moduleSuggestedMs(module);
}

/* ------------------------------------------------------------ 分组（趋势） */

/** 趋势分组键：优先考试模版，其次模块模版，都没有归为默认 */
export function sessionGroupKey(session) {
  if (!session) return '__default__';
  return session.examTemplateId || session.templateId || '__default__';
}

/* ------------------------------------------------------------ 默认数据结构 */

export function defaultData() {
  const now = Date.now();
  return {
    version: DATA_VERSION,
    settings: {
      clockMode: 'digital',
      sound: true,
      keepAwake: true,
      suggestWarn: true,
      lastSetup: {
        startVirtual: parseHM('09:00'),
        endVirtual: parseHM('11:00'),
        moduleCount: 4,
        templateId: null,
        examTemplateId: null,
        totalScore: null,
      },
    },
    templates: [
      {
        id: uid('tpl'),
        name: '行测（示例）',
        modules: [
          {
            id: uid('tmod'), name: '常识判断', maxScore: null, questionCount: 20, perQuestionScore: 0.5, suggestedMinutes: 15, children: [],
          },
          {
            id: uid('tmod'), name: '判断推理', maxScore: null, questionCount: 40, perQuestionScore: 0.8, suggestedMinutes: 35, children: [
              { id: uid('tsub'), name: '图形推理', suggestedMinutes: 10 },
              { id: uid('tsub'), name: '定义判断', suggestedMinutes: 10 },
              { id: uid('tsub'), name: '类比推理', suggestedMinutes: 5 },
              { id: uid('tsub'), name: '逻辑判断', suggestedMinutes: 10 },
            ],
          },
          {
            id: uid('tmod'), name: '资料分析', maxScore: null, questionCount: 20, perQuestionScore: 1, suggestedMinutes: 30, children: [],
          },
          {
            id: uid('tmod'), name: '言语理解', maxScore: null, questionCount: 40, perQuestionScore: 0.8, suggestedMinutes: 30, children: [],
          },
          {
            id: uid('tmod'), name: '数量关系', maxScore: null, questionCount: 15, perQuestionScore: 1, suggestedMinutes: 10, children: [],
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    examTemplates: [],
    sessions: [],
  };
}

export function defaultModules(count) {
  const n = clamp(Math.round(count) || 4, 2, 8);
  return Array.from({ length: n }, (_, i) => ({
    id: uid('um'),
    name: `模块${cnNum(i + 1)}`,
    maxScore: null,
    questionCount: null,
    perQuestionScore: null,
    suggestedMinutes: null,
    children: [],
  }));
}

/* ------------------------------------------------------------------ 分析 */

/**
 * 生成考试分析。返回结构见 docs/SPEC.md 3.4；rows 与 session.modules 一一对应。
 */
export function analyze(session) {
  const mods = Array.isArray(session && session.modules) ? session.modules : [];
  const plan = (session && session.plan) || {};
  const examDurationMs = plan.durationMs || 0;
  const wallMs = elapsedWall(session);
  const totalModuleMs = mods.reduce((a, m) => a + Math.max(0, m.elapsedMs || 0), 0);
  const remain = examDurationMs - wallMs;

  const scoredMods = mods.filter((m) => moduleScore(m) != null);
  const hasScores = scoredMods.length > 0;
  const allScored = mods.length > 0 && scoredMods.length === mods.length;
  const derivedTotal = allScored
    ? mods.reduce((a, m) => a + (moduleScore(m) || 0), 0)
    : null;

  const manualTotal = session ? session.totalScore : null;
  const effectiveTotal = manualTotal != null ? manualTotal : derivedTotal;
  const totalScoreMax = plan.totalScore;
  const scoreRate =
    effectiveTotal != null && totalScoreMax ? effectiveTotal / totalScoreMax : null;

  const rows = mods.map((m, i) => {
    const ms = Math.max(0, m.elapsedMs || 0);
    const timeShare = totalModuleMs > 0 ? ms / totalModuleMs : 0;
    const score = moduleScore(m);
    const maxScore = moduleMaxScore(m);
    const rate = score != null && maxScore ? score / maxScore : null;
    const scoreShare =
      allScored && derivedTotal > 0 && score != null ? score / derivedTotal : null;
    const suggestedMs = moduleSuggestedMs(m);
    const overrunMs = suggestedMs != null ? ms - suggestedMs : null;
    const avgPerQuestionMs = m.questionCount ? ms / m.questionCount : null;

    let tag;
    if (ms <= 0) tag = { text: '未开始', tone: 'muted' };
    else if (scoreShare != null && timeShare > 0) {
      const r = scoreShare / timeShare;
      if (r >= 1.15) tag = { text: '优势', tone: 'good' };
      else if (r >= 0.85) tag = { text: '均衡', tone: 'ok' };
      else tag = { text: '低效', tone: 'bad' };
    } else if (timeShare >= 0.3) tag = { text: '重头', tone: 'warn' };
    else if (timeShare <= 0.1) tag = { text: '轻量', tone: 'muted' };
    else tag = { text: '一般', tone: 'muted' };

    const children = hasChildren(m)
      ? m.children.map((c) => {
          const cMax = childMaxScore(c, m);
          const cScore = childScoreValue(c, m);
          return {
            id: c.id,
            name: c.name,
            ms: Math.max(0, c.elapsedMs || 0),
            share: ms > 0 ? Math.max(0, c.elapsedMs || 0) / ms : 0,
            suggestedMs: c.suggestedMinutes != null ? Math.round(c.suggestedMinutes * 60000) : null,
            questionCount: c.questionCount == null ? null : c.questionCount,
            correctCount: c.correctCount == null ? null : c.correctCount,
            perQuestionScore: childPerQuestionScore(c, m),
            score: cScore,
            maxScore: cMax,
            rate: cScore != null && cMax ? cScore / cMax : null,
          };
        })
      : [];

    return {
      id: m.id,
      name: m.name,
      ms,
      timeShare,
      score,
      maxScore,
      rate,
      scoreShare,
      tag,
      color: MODULE_COLORS[i % MODULE_COLORS.length],
      suggestedMs,
      overrunMs,
      avgPerQuestionMs,
      questionCount: m.questionCount == null ? null : m.questionCount,
      correctCount: m.correctCount == null ? null : m.correctCount,
      perQuestionScore: perQuestionScore(m),
      children,
    };
  });

  const insights = [];
  if (rows.length) {
    const byTime = rows.slice().sort((a, b) => b.ms - a.ms);
    if (byTime[0].ms > 0) {
      insights.push(
        `用时最多的是「${byTime[0].name}」，${fmtMS(byTime[0].ms)}，占总用时 ${pct(byTime[0].timeShare)}。`,
      );
    }
  }

  const overrun = rows
    .filter((r) => r.overrunMs != null && r.overrunMs > 60000)
    .sort((a, b) => b.overrunMs - a.overrunMs);
  if (overrun.length) {
    const r = overrun[0];
    insights.push(
      `「${r.name}」比建议用时多花了 ${fmtHuman(r.overrunMs)}（建议 ${fmtMS(r.suggestedMs)}，实际 ${fmtMS(r.ms)}），是超时最明显的模块。`,
    );
  } else if (rows.some((r) => r.overrunMs != null)) {
    insights.push('所有模块都没有超过建议用时，节奏控制得不错。');
  }

  const speeds = rows.filter((r) => r.avgPerQuestionMs != null && r.avgPerQuestionMs > 0);
  if (speeds.length >= 2) {
    const slow = speeds.slice().sort((a, b) => b.avgPerQuestionMs - a.avgPerQuestionMs)[0];
    const fast = speeds.slice().sort((a, b) => a.avgPerQuestionMs - b.avgPerQuestionMs)[0];
    insights.push(
      `平均每题：最慢「${slow.name}」${fmtPerQuestion(slow.avgPerQuestionMs)}/题，最快「${fast.name}」${fmtPerQuestion(fast.avgPerQuestionMs)}/题。`,
    );
  }

  if (hasScores) {
    const withRate = rows.filter((r) => r.rate != null);
    if (withRate.length >= 2) {
      const best = withRate.slice().sort((a, b) => b.rate - a.rate)[0];
      const worst = withRate.slice().sort((a, b) => a.rate - b.rate)[0];
      const gap = Math.round((best.rate - worst.rate) * 100);
      insights.push(
        `得分率最高的是「${best.name}」${pct(best.rate)}，最低的是「${worst.name}」${pct(worst.rate)}，相差 ${gap} 个百分点。`,
      );
    }
    if (allScored && derivedTotal > 0) {
      const mismatch = rows
        .filter((r) => r.timeShare - (r.scoreShare || 0) > 0.1)
        .sort((a, b) => b.timeShare - b.scoreShare - (a.timeShare - a.scoreShare));
      if (mismatch.length) {
        const r = mismatch[0];
        const excess = totalModuleMs * (r.timeShare - r.scoreShare);
        const cut = Math.max(3, Math.round(excess / 60000));
        insights.push(
          `「${r.name}」用了 ${pct(r.timeShare)} 的时间，只换来 ${pct(r.scoreShare)} 的分数，是当前性价比最低的部分，建议压缩约 ${cut} 分钟。`,
        );
      }
      const strong = rows
        .filter((r) => (r.scoreShare || 0) - r.timeShare > 0.1)
        .sort((a, b) => b.scoreShare - b.timeShare - (a.scoreShare - a.timeShare));
      if (strong.length) {
        const r = strong[0];
        insights.push(
          `「${r.name}」产出较高（用时占 ${pct(r.timeShare)}，得分占 ${pct(r.scoreShare)}），模考时应优先保证它的时间。`,
        );
      }
    } else if (!allScored) {
      insights.push('部分模块还没有录入正确题数或得分，补全后可以看到完整的「投入产出」对比。');
    }
  } else {
    insights.push('还没有录入得分。补录正确题数或模块得分后，可以看到得分率与投入产出分析。');
  }

  if (session && session.finishedAt) {
    if (remain >= 60000) {
      insights.push(`本场提前 ${fmtHuman(remain)} 交卷，剩余时间可以考虑留给检查或难题。`);
    } else if (remain <= -60000) {
      insights.push(`本场超出计划时间 ${fmtHuman(-remain)}，注意控制节奏。`);
    }
  }

  if (manualTotal != null && allScored && Math.abs(derivedTotal - manualTotal) > 0.01) {
    insights.push(
      `各模块得分合计 ${fmtScore(derivedTotal)}，与手填总得分 ${fmtScore(manualTotal)} 不一致，已按手填总分为准。`,
    );
  }

  return {
    rows,
    examDurationMs,
    wallMs,
    totalModuleMs,
    remainMs: remain,
    hasScores,
    allScored,
    derivedTotal,
    manualTotal,
    effectiveTotal,
    totalScore: effectiveTotal,
    totalScoreMax,
    scoreRate,
    insights,
  };
}

/** 纯文本报告（复制/分享用） */
export function reportText(session) {
  const a = analyze(session);
  const lines = [];
  const title = session.name || '模拟考试';
  const date = session.startedAt ? new Date(session.startedAt) : null;
  const dateStr = date
    ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    : '';
  lines.push(`【${title}】${dateStr}`);
  lines.push(
    `考场时间 ${msToHM(session.plan.startVirtual)}–${msToHM(session.plan.endVirtual)}（${Math.round(a.examDurationMs / 60000)} 分钟）`,
  );
  lines.push(
    `实际完成总用时 ${fmtHMS(a.totalModuleMs)} · 考试耗时 ${fmtHMS(a.wallMs)} · ${
      a.remainMs >= 60000
        ? `提前 ${fmtHuman(a.remainMs)}`
        : a.remainMs <= -60000
          ? `超时 ${fmtHuman(-a.remainMs)}`
          : '压线交卷'
    }`,
  );
  if (a.effectiveTotal != null || a.totalScoreMax != null) {
    lines.push(
      `总分 ${fmtScore(a.effectiveTotal)}${a.totalScoreMax ? ` / ${fmtScore(a.totalScoreMax)}` : ''}${
        a.scoreRate != null ? `（得分率 ${pct(a.scoreRate, 1)}）` : ''
      }${a.manualTotal == null && a.derivedTotal != null ? '（各模块合计）' : ''}`,
    );
  }
  lines.push('');
  lines.push('各模块：');
  a.rows.forEach((r, i) => {
    const parts = [`${i + 1}. ${r.name}  ${fmtMS(r.ms)}（${pct(r.timeShare)}）`];
    if (r.avgPerQuestionMs != null) parts.push(`${fmtPerQuestion(r.avgPerQuestionMs)}/题`);
    if (r.suggestedMs != null) {
      const d = r.ms - r.suggestedMs;
      parts.push(`建议 ${fmtMS(r.suggestedMs)}${d > 0 ? `，超 ${fmtMS(d)}` : `，省 ${fmtMS(-d)}`}`);
    }
    if (r.score != null) {
      parts.push(
        `得分 ${fmtScore(r.score)}${r.maxScore != null ? `/${fmtScore(r.maxScore)}` : ''}${
          r.rate != null ? ` ${pct(r.rate)}` : ''
        }`,
      );
    }
    parts.push(r.tag.text);
    lines.push(parts.join(' · '));
    r.children.forEach((c) => {
      const cp = [`   - ${c.name} ${fmtMS(c.ms)}`];
      if (c.suggestedMs != null) cp.push(`建议 ${fmtMS(c.suggestedMs)}`);
      lines.push(cp.join(' · '));
    });
  });
  if (a.insights.length) {
    lines.push('');
    lines.push('分析：');
    a.insights.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  return lines.join('\n');
}
