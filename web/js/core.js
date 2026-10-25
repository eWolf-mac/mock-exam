/**
 * core.js —— 纯逻辑层（无 DOM 依赖，可在 Node 中直接测试）
 *
 * 关键约定：
 *  - 虚拟时间 = 一天内的毫秒偏移（0 … 86399999），用 startVirtual / endVirtual 表示
 *  - 考试中的虚拟时钟必须由「真实时间戳差值」推算，绝不能用定时器累加
 *  - 所有分数、满分都可为 null
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

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

/** 时长 -> "HH:MM:SS"（用于考场时钟、剩余时间） */
export function fmtHMS(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
}

/** 时长 -> "MM:SS"（超过 1 小时用 "H:MM:SS"，用于模块计时） */
export function fmtMS(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  if (total >= 3600) {
    return `${Math.floor(total / 3600)}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
  }
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** 时长 -> "1 小时 12 分" 这类可读文本 */
export function fmtHuman(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
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

/** 第一个未完成的模块下标，全部完成返回 -1 */
export function currentIndex(session) {
  if (!session) return -1;
  return session.modules.findIndex((m) => m.endedAt == null);
}

/* ------------------------------------------------------------ 默认数据结构 */

export function defaultData() {
  const now = Date.now();
  return {
    version: 1,
    settings: {
      clockMode: 'digital',
      sound: true,
      keepAwake: true,
      lastSetup: {
        startVirtual: parseHM('09:00'),
        endVirtual: parseHM('11:00'),
        moduleCount: 4,
        templateId: null,
        totalScore: null,
      },
    },
    templates: [
      {
        id: uid('tpl'),
        name: '行测（示例）',
        modules: [
          { id: uid('tmod'), name: '常识判断', maxScore: null },
          { id: uid('tmod'), name: '判断推理', maxScore: 30 },
          { id: uid('tmod'), name: '资料分析', maxScore: 30 },
          { id: uid('tmod'), name: '言语理解', maxScore: 25 },
          { id: uid('tmod'), name: '数量关系', maxScore: 15 },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    sessions: [],
  };
}

export function defaultModules(count) {
  const n = clamp(Math.round(count) || 4, 2, 8);
  return Array.from({ length: n }, (_, i) => ({
    id: uid('um'),
    name: `模块${cnNum(i + 1)}`,
    maxScore: null,
  }));
}

/* ------------------------------------------------------------------ 分析 */

/**
 * 生成考试分析。
 * 返回结构见 docs/SPEC.md 3.4；rows 与 session.modules 一一对应。
 */
export function analyze(session) {
  const mods = Array.isArray(session && session.modules) ? session.modules : [];
  const plan = (session && session.plan) || {};
  const examDurationMs = plan.durationMs || 0;
  const wallMs = elapsedWall(session);
  const totalModuleMs = mods.reduce((a, m) => a + Math.max(0, m.elapsedMs || 0), 0);
  const remain = examDurationMs - wallMs;

  const scoredRows0 = mods.filter((m) => m.score != null);
  const hasScores = scoredRows0.length > 0;
  const allScored = mods.length > 0 && scoredRows0.length === mods.length;
  const sumScores = scoredRows0.reduce((a, m) => a + (m.score || 0), 0);

  const totalScore = session ? session.totalScore : null;
  const totalScoreMax = plan.totalScore;
  const scoreRate =
    totalScore != null && totalScoreMax ? totalScore / totalScoreMax : null;

  const rows = mods.map((m, i) => {
    const ms = Math.max(0, m.elapsedMs || 0);
    const timeShare = totalModuleMs > 0 ? ms / totalModuleMs : 0;
    const hasMax = m.maxScore != null && m.maxScore > 0;
    const rate = m.score != null && hasMax ? m.score / m.maxScore : null;
    const scoreShare =
      allScored && sumScores > 0 && m.score != null ? m.score / sumScores : null;

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

    return {
      id: m.id,
      name: m.name,
      ms,
      timeShare,
      score: m.score,
      maxScore: m.maxScore,
      rate,
      scoreShare,
      tag,
      color: MODULE_COLORS[i % MODULE_COLORS.length],
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
    if (allScored && sumScores > 0) {
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
          `「${r.name}」产出较高（用时占 ${pct(r.timeShare)}，得分占 ${pct(r.scoreShare)}），模考时应优先保证它的时间，不要被前面的题拖住。`,
        );
      }
    } else if (!allScored) {
      insights.push('部分模块还没有录入得分，补全后可以看到完整的「投入产出」对比。');
    }
  } else {
    insights.push('还没有录入得分。补录总分与各模块得分后，可以看到得分率与投入产出分析。');
  }

  if (session && session.finishedAt) {
    if (remain >= 60000) {
      insights.push(`本场提前 ${fmtHuman(remain)} 交卷，剩余时间可以考虑留给检查或难题。`);
    } else if (remain <= -60000) {
      insights.push(`本场超出计划时间 ${fmtHuman(-remain)}，注意控制节奏。`);
    }
  }

  if (
    totalScore != null &&
    allScored &&
    Math.abs(sumScores - totalScore) > 0.01
  ) {
    insights.push(
      `各模块得分合计 ${fmtScore(sumScores)} 与总得分 ${fmtScore(totalScore)} 不一致，请确认是否漏填某一模块。`,
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
    sumScores,
    totalScore,
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
  if (a.totalScore != null || a.totalScoreMax != null) {
    lines.push(
      `总分 ${fmtScore(a.totalScore)}${a.totalScoreMax ? ` / ${fmtScore(a.totalScoreMax)}` : ''}${
        a.scoreRate != null ? `（得分率 ${pct(a.scoreRate, 1)}）` : ''
      }`,
    );
  }
  lines.push('');
  lines.push('各模块：');
  a.rows.forEach((r, i) => {
    const parts = [`${i + 1}. ${r.name}  ${fmtMS(r.ms)}（${pct(r.timeShare)}）`];
    if (r.score != null) {
      parts.push(
        `得分 ${fmtScore(r.score)}${r.maxScore != null ? `/${fmtScore(r.maxScore)}` : ''}${
          r.rate != null ? ` ${pct(r.rate)}` : ''
        }`,
      );
    }
    parts.push(r.tag.text);
    lines.push(parts.join(' · '));
  });
  if (a.insights.length) {
    lines.push('');
    lines.push('分析：');
    a.insights.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  return lines.join('\n');
}
