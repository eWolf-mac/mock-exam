/**
 * store.js —— localStorage 持久化（Web 端）
 * 数据结构与 docs/SPEC.md 第 2 节一致；读取时自动把 v1 数据升级到 v2。
 */
import { defaultData, uid, numOrNull, DATA_VERSION } from './core.js';

const KEY = 'mock-exam:v1';

let cache = null;

function normModule(m) {
  return {
    id: m.id || uid('tmod'),
    name: String(m.name || '未命名模块'),
    maxScore: numOrNull(m.maxScore),
    questionCount: numOrNull(m.questionCount),
    perQuestionScore: numOrNull(m.perQuestionScore),
    suggestedMinutes: numOrNull(m.suggestedMinutes),
    children: Array.isArray(m.children)
      ? m.children
          .map((c) => ({
            id: c.id || uid('tsub'),
            name: String(c.name || '子模块'),
            suggestedMinutes: numOrNull(c.suggestedMinutes),
          }))
          .filter((c) => c.name)
      : [],
  };
}

function normTemplate(t) {
  return {
    id: t.id || uid('tpl'),
    name: String(t.name || '未命名模版'),
    modules: Array.isArray(t.modules) ? t.modules.map(normModule) : [],
    createdAt: numOrNull(t.createdAt) || Date.now(),
    updatedAt: numOrNull(t.updatedAt) || Date.now(),
  };
}

function normExamTemplate(e) {
  return {
    id: e.id || uid('etpl'),
    name: String(e.name || '未命名考试模版'),
    startVirtual: numOrNull(e.startVirtual),
    endVirtual: numOrNull(e.endVirtual),
    templateId: e.templateId || null,
    moduleCount: numOrNull(e.moduleCount) || 4,
    totalScore: numOrNull(e.totalScore),
    createdAt: numOrNull(e.createdAt) || Date.now(),
    updatedAt: numOrNull(e.updatedAt) || Date.now(),
  };
}

function normSessionModule(m) {
  const base = {
    id: m.id || uid('sm'),
    name: String(m.name || '模块'),
    maxScore: numOrNull(m.maxScore),
    questionCount: numOrNull(m.questionCount),
    perQuestionScore: numOrNull(m.perQuestionScore),
    suggestedMinutes: numOrNull(m.suggestedMinutes),
    correctCount: numOrNull(m.correctCount),
    score: numOrNull(m.score),
    startedAt: numOrNull(m.startedAt),
    endedAt: numOrNull(m.endedAt),
    elapsedMs: numOrNull(m.elapsedMs) || 0,
    skipped: !!m.skipped,
    children: [],
  };
  if (Array.isArray(m.children)) {
    base.children = m.children.map((c) => ({
      id: c.id || uid('ss'),
      name: String(c.name || '子模块'),
      suggestedMinutes: numOrNull(c.suggestedMinutes),
      startedAt: numOrNull(c.startedAt),
      endedAt: numOrNull(c.endedAt),
      elapsedMs: numOrNull(c.elapsedMs) || 0,
    }));
    if (base.children.length) {
      const total = base.children.reduce((a, c) => a + c.elapsedMs, 0);
      const started = base.children.reduce((a, c) => (c.startedAt && (!a || c.startedAt < a) ? c.startedAt : a), null);
      const done = base.children.every((c) => c.endedAt != null);
      const lastEnd = base.children.reduce((a, c) => (c.endedAt && (!a || c.endedAt > a) ? c.endedAt : a), null);
      base.elapsedMs = total;
      base.startedAt = started;
      base.endedAt = done ? lastEnd : null;
    }
  }
  return base;
}

function normSession(s, fallback) {
  const plan = s.plan || {};
  return {
    id: s.id || uid('ses'),
    name: String(s.name || ''),
    templateId: s.templateId || null,
    templateName: String(s.templateName || ''),
    examTemplateId: s.examTemplateId || null,
    plan: {
      startVirtual: numOrNull(plan.startVirtual) ?? fallback.startVirtual,
      endVirtual: numOrNull(plan.endVirtual) ?? fallback.endVirtual,
      durationMs: numOrNull(plan.durationMs) ?? 0,
      totalScore: numOrNull(plan.totalScore),
    },
    modules: Array.isArray(s.modules) ? s.modules.map(normSessionModule) : [],
    status: ['running', 'finished', 'discarded'].includes(s.status) ? s.status : 'finished',
    startedAt: numOrNull(s.startedAt),
    finishedAt: numOrNull(s.finishedAt),
    finishReason: s.finishReason || null,
    totalScore: numOrNull(s.totalScore),
    note: String(s.note || ''),
    scoresFilled: !!s.scoresFilled,
  };
}

function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const settingsRaw = raw.settings || {};
  const data = {
    version: DATA_VERSION,
    settings: {
      clockMode: settingsRaw.clockMode === 'analog' ? 'analog' : 'digital',
      sound: settingsRaw.sound !== false,
      keepAwake: settingsRaw.keepAwake !== false,
      lastSetup: Object.assign({}, base.settings.lastSetup, settingsRaw.lastSetup || {}),
    },
    templates: Array.isArray(raw.templates) && raw.templates.length
      ? raw.templates.filter((t) => t && t.id).map(normTemplate)
      : base.templates,
    examTemplates: Array.isArray(raw.examTemplates) ? raw.examTemplates.filter((e) => e && e.id).map(normExamTemplate) : [],
    sessions: Array.isArray(raw.sessions)
      ? raw.sessions
          .filter((s) => s && s.id && s.plan && Array.isArray(s.modules))
          .map((s) => normSession(s, base.settings.lastSetup))
      : [],
  };
  const ls = data.settings.lastSetup;
  ls.startVirtual = numOrNull(ls.startVirtual) ?? base.settings.lastSetup.startVirtual;
  ls.endVirtual = numOrNull(ls.endVirtual) ?? base.settings.lastSetup.endVirtual;
  ls.moduleCount = Math.min(8, Math.max(2, numOrNull(ls.moduleCount) || 4));
  ls.totalScore = numOrNull(ls.totalScore);
  if (ls.templateId && !data.templates.some((t) => t.id === ls.templateId)) ls.templateId = null;
  if (ls.examTemplateId && !data.examTemplates.some((e) => e.id === ls.examTemplateId)) ls.examTemplateId = null;
  return data;
}

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? normalize(JSON.parse(raw)) : defaultData();
  } catch (err) {
    console.warn('[store] 读取失败，使用默认数据', err);
    cache = defaultData();
  }
  if (!localStorage.getItem(KEY)) save();
  return cache;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[store] 保存失败', err);
  }
}

export function db() {
  return load();
}

export function replaceAll(next) {
  cache = normalize(next);
  save();
  return cache;
}

export function runningSession() {
  return db().sessions.find((s) => s.status === 'running') || null;
}

export function findSession(id) {
  return db().sessions.find((s) => s.id === id) || null;
}

export function findTemplate(id) {
  return db().templates.find((t) => t.id === id) || null;
}

export function findExamTemplate(id) {
  return db().examTemplates.find((e) => e.id === id) || null;
}

export function removeSession(id) {
  const data = db();
  data.sessions = data.sessions.filter((s) => s.id !== id);
  save();
}

export function removeTemplate(id) {
  const data = db();
  data.templates = data.templates.filter((t) => t.id !== id);
  data.examTemplates.forEach((e) => { if (e.templateId === id) e.templateId = null; });
  if (data.settings.lastSetup.templateId === id) data.settings.lastSetup.templateId = null;
  save();
}

export function removeExamTemplate(id) {
  const data = db();
  data.examTemplates = data.examTemplates.filter((e) => e.id !== id);
  if (data.settings.lastSetup.examTemplateId === id) data.settings.lastSetup.examTemplateId = null;
  save();
}

export function setSetting(key, value) {
  db().settings[key] = value;
  save();
}

export function exportJson() {
  return JSON.stringify(db(), null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.templates)) {
    throw new Error('文件格式不正确：缺少 sessions / templates');
  }
  return replaceAll(parsed);
}
