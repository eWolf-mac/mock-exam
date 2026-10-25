/**
 * store.js —— localStorage 持久化（Web 端）
 * 数据结构与 docs/SPEC.md 第 2 节一致。
 */
import { defaultData, uid, numOrNull } from './core.js';

const KEY = 'mock-exam:v1';

let cache = null;

function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const data = {
    version: 1,
    settings: Object.assign({}, base.settings, raw.settings || {}, {
      lastSetup: Object.assign({}, base.settings.lastSetup, (raw.settings || {}).lastSetup || {}),
    }),
    templates: Array.isArray(raw.templates) ? raw.templates.filter((t) => t && t.id && Array.isArray(t.modules)) : base.templates,
    sessions: Array.isArray(raw.sessions) ? raw.sessions.filter((s) => s && s.id && s.plan && Array.isArray(s.modules)) : [],
  };
  data.templates.forEach((t) => {
    t.name = String(t.name || '未命名模版');
    t.modules = t.modules.map((m) => ({
      id: m.id || uid('tmod'),
      name: String(m.name || '未命名模块'),
      maxScore: numOrNull(m.maxScore),
    }));
  });
  data.sessions.forEach((s) => {
    s.plan = s.plan || {};
    s.plan.startVirtual = numOrNull(s.plan.startVirtual) ?? base.settings.lastSetup.startVirtual;
    s.plan.endVirtual = numOrNull(s.plan.endVirtual) ?? base.settings.lastSetup.endVirtual;
    s.plan.durationMs = numOrNull(s.plan.durationMs) ?? 0;
    s.plan.totalScore = numOrNull(s.plan.totalScore);
    s.modules = s.modules.map((m) => ({
      id: m.id || uid('sm'),
      name: String(m.name || '模块'),
      maxScore: numOrNull(m.maxScore),
      score: numOrNull(m.score),
      startedAt: numOrNull(m.startedAt),
      endedAt: numOrNull(m.endedAt),
      elapsedMs: numOrNull(m.elapsedMs) || 0,
      skipped: !!m.skipped,
    }));
    s.totalScore = numOrNull(s.totalScore);
    s.status = ['running', 'finished', 'discarded'].includes(s.status) ? s.status : 'finished';
  });
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

export function removeSession(id) {
  const data = db();
  data.sessions = data.sessions.filter((s) => s.id !== id);
  save();
}

export function removeTemplate(id) {
  const data = db();
  data.templates = data.templates.filter((t) => t.id !== id);
  if (data.settings.lastSetup.templateId === id) data.settings.lastSetup.templateId = null;
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
