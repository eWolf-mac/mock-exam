/**
 * app.js —— 界面与交互（原生视图切换，无框架）
 */
import {
  fmtHMS, fmtMS, fmtHuman, fmtMinutes, msToHM, msToHMS, fmtScore, pct, esc, uid, clamp, cnNum,
  parseHM, durationFor, numOrNull, virtualNow, remainingMs, elapsedWall, analyze, reportText,
  defaultModules, MODULE_COLORS, allSteps, currentStep, completeCurrentStep, undoLastStep,
  closeCurrentStep, isModuleDone, hasChildren, moduleScore, moduleMaxScore, moduleSuggestedMs,
  stepSuggestedMs, perQuestionScore,
} from './core.js';
import * as store from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* --------------------------------------------------------------- 视图状态 */

const ui = {
  view: 'home',
  params: {},
  draft: null,
  tpl: null,
  etpl: null,
  tplKind: 'modules',
  flash: null,
  timer: null,
  ending: false,
};

const views = {};

/* --------------------------------------------------------------- 小部件 */

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function flashHTML() {
  if (!ui.flash) return '';
  const html = `<div class="flash">${esc(ui.flash)}</div>`;
  ui.flash = null;
  return html;
}

function navHTML(active) {
  const items = [
    ['home', '首页', '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-5.5h4V20h5V9.5"/>'],
    ['templates', '模版', '<path d="M4 6h16M4 12h16M4 18h10"/>'],
    ['history', '记录', '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'],
  ];
  return `<nav class="tabbar">${items
    .map(
      ([key, label, path]) =>
        `<button class="tab${key === active ? ' on' : ''}" data-act="go" data-view="${key}">
           <svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg><span>${label}</span>
         </button>`,
    )
    .join('')}</nav>`;
}

function pageHead(title, { back = true, right = '' } = {}) {
  return `<header class="page-head">
    ${back ? '<button class="icon-btn" data-act="back" aria-label="返回">‹</button>' : '<span class="icon-btn ghost"></span>'}
    <h1>${esc(title)}</h1>
    <div class="head-right">${right}</div>
  </header>`;
}

function sumModuleMs(s) {
  return (s.modules || []).reduce((a, m) => a + (m.elapsedMs || 0), 0);
}

function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ------------------------------------------------------------- 首页 */

views.home = () => {
  const data = store.db();
  const running = store.runningSession();
  const setup = data.settings.lastSetup;
  const tpl = setup.templateId ? store.findTemplate(setup.templateId) : null;
  const finished = data.sessions
    .filter((s) => s.status === 'finished')
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const last = finished[0];
  const duration = durationFor(setup.startVirtual, setup.endVirtual);
  const lastAnalysis = last ? analyze(last) : null;

  const resumeCard = running
    ? `<button class="resume-card" data-act="resume" data-id="${running.id}">
         <span class="pulse"></span>
         <span class="resume-main">
           <b>有一场考试还没结束</b>
           <small>${msToHM(running.plan.startVirtual)} – ${msToHM(running.plan.endVirtual)} · 已进行 ${fmtHuman(elapsedWall(running))}</small>
         </span>
         <span class="chev">继续 ›</span>
       </button>`
    : '';

  const lastCard = last
    ? `<section class="card tight">
         <div class="card-head"><h2>最近一次</h2><button class="text-btn" data-act="go" data-view="history">全部记录</button></div>
         <button class="last-row" data-act="open-session" data-id="${last.id}">
           <span>
             <b>${esc(last.name || '模拟考试')}</b>
             <small>${fmtDateTime(last.startedAt)} · ${esc(last.templateName || '')}</small>
           </span>
           <span class="last-score">${
             lastAnalysis && lastAnalysis.effectiveTotal != null
               ? `${fmtScore(lastAnalysis.effectiveTotal)}${last.plan.totalScore ? `<i>/${fmtScore(last.plan.totalScore)}</i>` : ''}`
               : fmtMS(sumModuleMs(last))
           }</span>
         </button>
       </section>`
    : '';

  return `<main class="page home">
    <div class="brand">
      <div class="brand-mark">考</div>
      <h1>模拟考场</h1>
      <p>把任何时间，变成考场上的那两个小时</p>
    </div>
    ${resumeCard}
    <section class="card hero">
      <div class="hero-range">${msToHM(setup.startVirtual)} <span>—</span> ${msToHM(setup.endVirtual)}</div>
      <div class="hero-meta">${fmtHuman(duration)} · ${esc(tpl ? tpl.name : `默认模块 × ${setup.moduleCount}`)}</div>
      <button class="btn primary big" data-act="new-exam">开始模拟考试</button>
    </section>
    <div class="tiles">
      <button class="tile" data-act="go" data-view="templates">
        <b>${data.templates.length}</b><span>模块模版</span>
      </button>
      <button class="tile" data-act="go" data-view="templates">
        <b>${data.examTemplates.length}</b><span>考试模版</span>
      </button>
    </div>
    <button class="tile wide" data-act="go" data-view="history">
      <span>考试记录</span><b>${finished.length}</b>
    </button>
    ${lastCard}
    <section class="card tight more">
      <div class="card-head"><h2>偏好设置</h2></div>
      <label class="switch-row">
        <span>提示音</span>
        <input type="checkbox" data-setting="sound" ${data.settings.sound ? 'checked' : ''}>
      </label>
      <label class="switch-row">
        <span>考试中保持屏幕常亮</span>
        <input type="checkbox" data-setting="keepAwake" ${data.settings.keepAwake ? 'checked' : ''}>
      </label>
      <div class="btn-row">
        <button class="btn ghost small" data-act="export">导出备份</button>
        <button class="btn ghost small" data-act="import">导入备份</button>
      </div>
      <p class="foot-note">数据只保存在这台设备的浏览器里，不会上传。换设备请用备份文件。</p>
    </section>
    ${navHTML('home')}
  </main>`;
};

/* --------------------------------------------------------- 新建考试 */

function newExamDraft() {
  if (ui.draft && ui.draft.kind === 'exam') return ui.draft;
  const s = store.db().settings.lastSetup;
  ui.draft = {
    kind: 'exam',
    name: '',
    start: msToHM(s.startVirtual),
    end: msToHM(s.endVirtual),
    templateId: s.templateId || null,
    moduleCount: clamp(Number(s.moduleCount) || 4, 2, 8),
    totalScore: s.totalScore == null ? '' : String(s.totalScore),
    examTemplateId: null,
  };
  return ui.draft;
}

function durLabelHTML(startStr, endStr) {
  const s = parseHM(startStr);
  const e = parseHM(endStr);
  if (s == null || e == null) return '请填写有效的开始 / 结束时间';
  const d = durationFor(s, e);
  const cross = e <= s;
  return `共 ${fmtHuman(d)}${cross ? '（跨零点）' : ''}`;
}

views.newExam = () => {
  const d = newExamDraft();
  const data = store.db();
  let tpl = d.templateId ? store.findTemplate(d.templateId) : null;
  if (d.templateId && !tpl) d.templateId = null;
  const duration = durationFor(parseHM(d.start) || 0, parseHM(d.end) || 0);

  const examChips = [
    `<button class="chip${d.examTemplateId ? '' : ' on'}" data-act="pick-exam-template" data-id="">自定义</button>`,
    ...data.examTemplates.map(
      (e) => `<button class="chip${d.examTemplateId === e.id ? ' on' : ''}" data-act="pick-exam-template" data-id="${e.id}">${esc(e.name)}</button>`,
    ),
  ].join('');

  const choices = [
    { id: '', title: `默认模块 × ${d.moduleCount}`, sub: '按顺序生成「模块一、模块二…」' },
    ...data.templates.map((t) => ({
      id: t.id,
      title: t.name,
      sub: t.modules.map((m) => m.name).slice(0, 5).join(' · ') + (t.modules.length > 5 ? ' …' : ''),
    })),
  ];

  return `<main class="page sub">
    ${pageHead('新建模拟考试')}

    ${
      data.examTemplates.length
        ? `<section class="card tight">
            <div class="card-head"><h2>考试模版</h2><button class="text-btn" data-act="tpl-new-exam">+ 新建</button></div>
            <div class="chips">${examChips}</div>
            <p class="hint">选一个会自动带上考试时间、模块模版和总分，下面仍可以改。</p>
          </section>`
        : ''
    }

    <section class="card">
      <label class="field">
        <span>考试名称<em>选填</em></span>
        <input id="f-name" type="text" placeholder="例：2026 国考行测 第 3 套" value="${esc(d.name)}">
      </label>
      <div class="field-row">
        <label class="field">
          <span>开始时间</span>
          <input id="f-start" type="time" value="${d.start}">
        </label>
        <label class="field">
          <span>结束时间</span>
          <input id="f-end" type="time" value="${d.end}">
        </label>
      </div>
      <p class="hint" id="durLabel">${durLabelHTML(d.start, d.end)}</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>模块模版</h2><button class="text-btn" data-act="tpl-new">+ 新建模版</button></div>
      <div class="radio-list">
        ${choices
          .map(
            (c) => `<button class="radio-row${(c.id || '') === (d.templateId || '') ? ' on' : ''}" data-act="pick-template" data-id="${c.id}">
              <span class="radio-dot"></span>
              <span class="radio-body"><b>${esc(c.title)}</b><small>${esc(c.sub)}</small></span>
            </button>`,
          )
          .join('')}
      </div>
      ${d.templateId ? '' : `<div class="stepper">
          <span>模块数量</span>
          <div>
            <button class="step-btn" data-act="mod-count" data-delta="-1" ${d.moduleCount <= 2 ? 'disabled' : ''}>−</button>
            <b>${d.moduleCount}</b>
            <button class="step-btn" data-act="mod-count" data-delta="1" ${d.moduleCount >= 8 ? 'disabled' : ''}>+</button>
          </div>
        </div>`}
    </section>

    <section class="card">
      <label class="field">
        <span>考试总分<em>选填</em></span>
        <input id="f-total" type="number" inputmode="decimal" min="0" step="0.5" placeholder="不填也可以" value="${esc(d.totalScore)}">
      </label>
      <p class="hint">填了总分之后，交卷时录入得分就能看到得分率与投入产出分析。</p>
    </section>

    <button class="btn primary big" data-act="start-exam">开始考试</button>
    <p class="foot-note center">开始后，考场时钟从 ${esc(d.start)} 走起，与你手机上的真实时间无关。</p>
  </main>`;
};

function syncExamDraft() {
  const d = newExamDraft();
  const name = $('#f-name');
  const start = $('#f-start');
  const end = $('#f-end');
  const total = $('#f-total');
  if (name) d.name = name.value;
  if (start && parseHM(start.value) != null) d.start = start.value;
  if (end && parseHM(end.value) != null) d.end = end.value;
  if (total) d.totalScore = total.value;
  return d;
}

function applyExamTemplate(id) {
  const d = syncExamDraft();
  d.examTemplateId = id || null;
  if (!id) return;
  const e = store.findExamTemplate(id);
  if (!e) return;
  if (e.startVirtual != null) d.start = msToHM(e.startVirtual);
  if (e.endVirtual != null) d.end = msToHM(e.endVirtual);
  d.templateId = e.templateId || null;
  d.moduleCount = clamp(e.moduleCount || 4, 2, 8);
  d.totalScore = e.totalScore == null ? '' : String(e.totalScore);
  if (!d.name.trim()) d.name = '';
}

/* ------------------------------------------------------------- 考试中 */

function sessionOf(id) {
  return store.findSession(id);
}

function currentExam() {
  return sessionOf(ui.params.id);
}

function analogHTML() {
  let ticks = '';
  for (let i = 0; i < 12; i += 1) {
    const a = (i * 30 * Math.PI) / 180;
    const r1 = i % 3 === 0 ? 76 : 80;
    const x1 = 100 + Math.sin(a) * r1;
    const y1 = 100 - Math.cos(a) * r1;
    const x2 = 100 + Math.sin(a) * 86;
    const y2 = 100 - Math.cos(a) * 86;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="tick${i % 3 === 0 ? ' major' : ''}"/>`;
  }
  return `<svg class="analog" viewBox="0 0 200 200" aria-hidden="true">
    <circle class="dial" cx="100" cy="100" r="95"/>
    ${ticks}
    <line id="handH" class="hand hour" x1="100" y1="106" x2="100" y2="54"/>
    <line id="handM" class="hand min" x1="100" y1="110" x2="100" y2="32"/>
    <line id="handS" class="hand sec" x1="100" y1="114" x2="100" y2="24"/>
    <circle class="pin" cx="100" cy="100" r="4.5"/>
  </svg>`;
}

views.exam = () => {
  const s = currentExam();
  if (!s) return `<main class="page">${pageHead('考试')}<p class="empty">找不到这场考试。</p></main>`;
  if (s.status !== 'running') {
    ui.view = 'result';
    ui.params = { id: s.id };
    return views.result();
  }
  const mode = store.db().settings.clockMode;
  const face = mode === 'analog' ? analogHTML() : `<div class="digit" id="digit">00:00:00</div>`;

  return `<main class="page exam-page">
    <div class="exam-top">
      <span class="live"><i class="live-dot"></i>考试进行中</span>
      <span class="real" id="realTime"></span>
    </div>

    <section class="clock-card" id="clockCard">
      <div class="clock-face" id="clockFace">${face}</div>
      <div class="clock-range">考试时间 ${msToHM(s.plan.startVirtual)} – ${msToHM(s.plan.endVirtual)}</div>
      <div class="remain" id="remain">剩余 --:--:--</div>
      <div class="bar"><i id="barFill"></i></div>
      <div class="clock-foot">
        <span id="usedText">已用 00:00:00</span>
        <button class="text-btn dim" data-act="toggle-clock">${mode === 'analog' ? '数字时钟' : '表盘时钟'}</button>
      </div>
    </section>

    <div id="modulePanel">${modulePanelHTML(s)}</div>

    <div class="exam-actions">
      <button class="btn ghost" data-act="submit">提前交卷</button>
      <button class="btn danger-ghost" data-act="abandon">放弃本场</button>
    </div>
  </main>`;
};

function modulePanelHTML(s) {
  const steps = allSteps(s);
  const cur = currentStep(s);
  const doneSteps = steps.filter((x) => x.step.endedAt != null).length;
  const canUndo = doneSteps > 0;

  if (!cur) {
    return `<section class="panel">
      <div class="cm done-all">
        <div class="cm-name">全部模块已完成</div>
        <p class="hint">可以交卷查看分析，也可以撤销上一个模块重新计时。</p>
        <button class="btn primary big" data-act="submit">交卷并查看分析</button>
      </div>
      ${canUndo ? '<button class="text-btn dim undo-btn" data-act="undo">↩ 撤销上一个模块</button>' : ''}
      ${moduleListHTML(s, cur)}
    </section>`;
  }

  const mod = cur.module;
  const isChild = cur.isChild;
  const modIdx = cur.moduleIndex;
  const modTarget = moduleSuggestedMs(mod);
  const parentInfo = isChild
    ? `<div class="cm-parent" id="modParent">${esc(mod.name)} · 本模块按子模块累计</div>`
    : '';

  return `<section class="panel">
    <div class="cm">
      <div class="cm-top">
        <span class="cm-label">${
          isChild
            ? `模块 ${modIdx + 1}/${s.modules.length} · 子模块 ${cur.childIndex + 1}/${mod.children.length}`
            : `当前模块 ${modIdx + 1}/${s.modules.length}`
        }</span>
        <span class="cm-hint"></span>
      </div>
      ${parentInfo}
      <div class="cm-name">${esc(cur.step.name)}</div>
      <div class="cm-timer" id="modTimer">00:00</div>
      <div class="cm-target" id="modTarget"></div>
      <button class="btn primary big" data-act="complete">完成${isChild ? '子模块' : '本模块'} →</button>
    </div>
    ${canUndo ? '<button class="text-btn dim undo-btn" data-act="undo">↩ 撤销上一个模块</button>' : ''}
    ${moduleListHTML(s, cur)}
  </section>`;
}

function moduleListHTML(s, cur) {
  const rows = s.modules
    .map((m, i) => {
      const done = isModuleDone(m);
      const active = cur && cur.moduleIndex === i;
      const state = done ? 'done' : active ? 'now' : 'todo';
      const nested = hasChildren(m);
      const time = done || (active && m.elapsedMs > 0)
        ? fmtMS(m.elapsedMs)
        : active
          ? '进行中'
          : '待开始';
      let html = `<li class="mod ${state}${nested ? ' nested' : ''}">
        <span class="mod-idx">${done ? '✓' : i + 1}</span>
        <span class="mod-name">${esc(m.name)}</span>
        <span class="mod-time">${time}</span>
      </li>`;
      if (nested) {
        html += m.children
          .map((c, ci) => {
            const cDone = c.endedAt != null;
            const cNow = cur && cur.moduleIndex === i && cur.childIndex === ci;
            const cState = cDone ? 'done' : cNow ? 'now' : 'todo';
            const cTime = cDone ? fmtMS(c.elapsedMs) : cNow ? '进行中' : '待开始';
            return `<li class="mod sub ${cState}">
              <span class="mod-idx">${cDone ? '✓' : `${i + 1}.${ci + 1}`}</span>
              <span class="mod-name">${esc(c.name)}</span>
              <span class="mod-time">${cTime}</span>
            </li>`;
          })
          .join('');
      }
      return html;
    })
    .join('');
  return `<ol class="mods">${rows}</ol>`;
}

/* ------------------------------------------------------------- 结果页 */

views.result = () => {
  const s = sessionOf(ui.params.id);
  if (!s) return `<main class="page sub">${pageHead('考试分析')}<p class="empty">记录不存在或已被删除。</p></main>`;
  const a = analyze(s);
  const hasMax = s.plan.totalScore != null;
  const onTime = Math.abs(a.remainMs) < 60000;
  const remainLabel = onTime ? '压线交卷' : a.remainMs > 0 ? '提前交卷' : '超时';
  const remainTone = onTime ? '' : a.remainMs > 0 ? 'good' : 'bad';
  const statScore = a.effectiveTotal != null
    ? `${fmtScore(a.effectiveTotal)}${hasMax ? `<em>/${fmtScore(s.plan.totalScore)}</em>` : ''}`
    : (hasMax ? `<em>满分 ${fmtScore(s.plan.totalScore)}</em>` : '—');
  const autoTag = a.manualTotal == null && a.derivedTotal != null
    ? '<span class="mini-tag">各模块合计</span>'
    : '';

  return `<main class="page sub result">
    ${pageHead(s.name || '模拟考试', { right: '<button class="text-btn" data-act="session-menu" data-id="' + s.id + '">⋯</button>' })}
    ${flashHTML()}
    <p class="result-sub">${fmtDateTime(s.startedAt)} · ${esc(s.templateName || '')} · 考场 ${msToHM(s.plan.startVirtual)}–${msToHM(s.plan.endVirtual)}</p>

    <section class="card">
      <div class="stats">
        <div class="stat"><b>${fmtHMS(a.totalModuleMs)}</b><span>实际完成总用时</span></div>
        <div class="stat"><b>${fmtHMS(a.wallMs)}</b><span>考试耗时</span></div>
        <div class="stat"><b class="${remainTone}">${fmtHMS(Math.abs(a.remainMs))}</b><span>${remainLabel}</span></div>
        <div class="stat"><b class="score">${statScore}</b><span>${a.scoreRate != null ? `得分率 ${pct(a.scoreRate, 1)}` : '总分'} ${autoTag}</span></div>
      </div>
      ${s.status === 'finished' ? '' : '<p class="hint">这场考试还在进行中。</p>'}
    </section>

    <section class="card">
      <div class="card-head"><h2>用时分布</h2><span class="hint">合计 ${fmtHMS(a.totalModuleMs)}</span></div>
      <div class="stackbar">
        ${a.rows.map((r) => `<i style="width:${(r.timeShare * 100).toFixed(2)}%;background:${r.color}"></i>`).join('')}
      </div>
      <ul class="bars">
        ${a.rows
          .map(
            (r) => `<li class="bar-row">
              <div class="bar-top">
                <span class="dot" style="background:${r.color}"></span>
                <span class="bn">${esc(r.name)}</span>
                <span class="bt">${fmtMS(r.ms)}</span>
                <span class="bp">${pct(r.timeShare)}</span>
              </div>
              <div class="bar-track"><i style="width:${(r.timeShare * 100).toFixed(2)}%;background:${r.color}"></i></div>
              ${r.suggestedMs != null ? `<div class="bar-sug"><span>建议 ${fmtMS(r.suggestedMs)}</span><span class="${r.overrunMs > 0 ? 'over' : 'under'}">${r.overrunMs > 0 ? `超 ${fmtMS(r.overrunMs)}` : `省 ${fmtMS(-r.overrunMs)}`}</span></div>` : ''}
              ${r.children.length ? `<ul class="sub-bars">${r.children.map((c) => `<li><span>${esc(c.name)}</span><b>${fmtMS(c.ms)}</b><i>${pct(c.share)}</i></li>`).join('')}</ul>` : ''}
            </li>`,
          )
          .join('')}
      </ul>
    </section>

    <section class="card">
      <div class="card-head"><h2>模块明细</h2></div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>模块</th><th>用时</th><th>较建议</th><th>得分</th><th>效率</th></tr></thead>
          <tbody>
            ${a.rows
              .map(
                (r) => `<tr>
                  <td class="t-name">${esc(r.name)}</td>
                  <td>${fmtMS(r.ms)}</td>
                  <td class="${r.overrunMs > 0 ? 'over' : ''}">${r.suggestedMs != null ? (r.overrunMs > 0 ? `+${fmtMS(r.overrunMs)}` : `-${fmtMS(-r.overrunMs)}`) : '—'}</td>
                  <td>${r.score == null ? '—' : `${fmtScore(r.score)}${r.maxScore != null ? `<i>/${fmtScore(r.maxScore)}</i>` : ''}${r.rate != null ? `<small>${pct(r.rate)}</small>` : ''}`}</td>
                  <td><span class="tag ${r.tag.tone}">${r.tag.text}</span></td>
                </tr>
                ${r.children
                  .map(
                    (c) => `<tr class="sub">
                      <td class="t-name sub">↳ ${esc(c.name)}</td>
                      <td>${fmtMS(c.ms)}</td>
                      <td>${c.suggestedMs != null ? fmtMS(c.suggestedMs) : '—'}</td>
                      <td colspan="2"></td>
                    </tr>`,
                  )
                  .join('')}`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
      ${a.manualTotal != null && a.allScored && Math.abs(a.derivedTotal - a.manualTotal) > 0.01 ? `<p class="hint warn">模块合计 ${fmtScore(a.derivedTotal)}，手填总分 ${fmtScore(a.manualTotal)}，已按手填为准</p>` : ''}
      ${!a.allScored && a.hasScores ? '<p class="hint">部分模块还没录分，补全后才能算总分。</p>' : ''}
    </section>

    ${scoreCardHTML(s, a)}

    <section class="card">
      <div class="card-head"><h2>分析</h2></div>
      <ol class="insights">
        ${a.insights.map((t) => `<li>${esc(t)}</li>`).join('')}
      </ol>
    </section>

    <div class="btn-row">
      <button class="btn ghost" data-act="copy-report" data-id="${s.id}">复制分析文本</button>
      <button class="btn ghost" data-act="go" data-view="home">回到首页</button>
    </div>
    ${navHTML('history')}
  </main>`;
};

function scoreCardHTML(s, a) {
  const hasMax = s.plan.totalScore != null;
  return `<section class="card">
    <div class="card-head"><h2>得分录入</h2><span class="hint">${a.hasScores ? '可随时修改' : '选填'}</span></div>
    <div class="field-row">
      <label class="field">
        <span>总得分<em>不填则按模块合计</em></span>
        <input id="f-total-score" type="number" inputmode="decimal" min="0" step="0.5"
          placeholder="${hasMax ? `满分 ${fmtScore(s.plan.totalScore)}` : '选填'}" value="${s.totalScore == null ? '' : s.totalScore}">
      </label>
      <div class="field score-preview">
        <span>统计总分</span>
        <b id="totalPreview">${a.effectiveTotal != null ? fmtScore(a.effectiveTotal) : '—'}</b>
      </div>
    </div>
    <div class="score-list">
      ${s.modules
        .map((m) => {
          const per = perQuestionScore(m);
          if (m.questionCount != null) {
            const maxScore = moduleMaxScore(m);
            return `<div class="score-row">
              <span class="sr-name">${esc(m.name)}<small>${m.questionCount} 题 · 每题 ${fmtScore(per)} 分${maxScore != null ? ` · 满分 ${fmtScore(maxScore)}` : ''}</small></span>
              <span class="sr-unit">对</span>
              <input data-mod="${m.id}" data-kind="correct" type="number" inputmode="numeric" min="0" step="1"
                max="${m.questionCount}" placeholder="题数" value="${m.correctCount == null ? '' : m.correctCount}">
            </div>`;
          }
          return `<div class="score-row">
            <span class="sr-name">${esc(m.name)}<small>${m.maxScore != null ? `满分 ${fmtScore(m.maxScore)}` : '未设满分'}</small></span>
            <span class="sr-unit">分</span>
            <input data-mod="${m.id}" data-kind="score" type="number" inputmode="decimal" min="0" step="0.5"
              placeholder="得分" value="${m.score == null ? '' : m.score}">
          </div>`;
        })
        .join('')}
    </div>
    <label class="field">
      <span>备注<em>选填</em></span>
      <textarea id="f-note" rows="2" placeholder="这场考试的感受、要改的地方…">${esc(s.note || '')}</textarea>
    </label>
    <button class="btn primary" data-act="save-scores" data-id="${s.id}">保存得分</button>
  </section>`;
}

/* ------------------------------------------------------------- 模版 */

views.templates = () => {
  const data = store.db();
  const kind = ui.tplKind;
  const seg = `<div class="seg">
    <button class="seg-btn${kind === 'modules' ? ' on' : ''}" data-act="tpl-seg" data-kind="modules">模块模版</button>
    <button class="seg-btn${kind === 'exams' ? ' on' : ''}" data-act="tpl-seg" data-kind="exams">考试模版</button>
  </div>`;

  if (kind === 'exams') {
    return `<main class="page sub">
      ${pageHead('模版')}
      ${seg}
      <p class="page-desc">考试模版 = 一场考试的全部预设：默认考试名称、起止时间、用哪个模块模版、总分。新建考试时选它就一键带出。</p>
      ${data.examTemplates.length === 0 ? '<p class="empty">还没有考试模版。</p>' : ''}
      <ul class="tpl-list">
        ${data.examTemplates
          .map(
            (e) => `<li class="tpl-item">
              <button class="tpl-main" data-act="etpl-edit" data-id="${e.id}">
                <b>${esc(e.name)}</b>
                <small>${msToHM(e.startVirtual)} – ${msToHM(e.endVirtual)} · ${esc((store.findTemplate(e.templateId) || {}).name || `默认模块 × ${e.moduleCount}`)}${e.totalScore != null ? ` · 满分 ${fmtScore(e.totalScore)}` : ''}</small>
              </button>
              <button class="icon-btn" data-act="etpl-delete" data-id="${e.id}" aria-label="删除">×</button>
            </li>`,
          )
          .join('')}
      </ul>
      <button class="btn primary big" data-act="tpl-new-exam">+ 新建考试模版</button>
      ${navHTML('templates')}
    </main>`;
  }

  return `<main class="page sub">
    ${pageHead('模版')}
    ${seg}
    <p class="page-desc">模块模版决定考试里模块的顺序与结构：可设二级模块、题目数、每题分值、建议用时。满分可不填。</p>
    ${data.templates.length === 0 ? '<p class="empty">还没有模块模版，先建一个吧。</p>' : ''}
    <ul class="tpl-list">
      ${data.templates
        .map(
          (t) => `<li class="tpl-item">
            <button class="tpl-main" data-act="tpl-edit" data-id="${t.id}">
              <b>${esc(t.name)}</b>
              <small>${t.modules.length} 个模块${t.modules.some((m) => m.children.length) ? '（含二级模块）' : ''} · ${t.modules.map((m) => esc(m.name)).join(' / ')}</small>
            </button>
            <button class="icon-btn" data-act="tpl-delete" data-id="${t.id}" aria-label="删除">×</button>
          </li>`,
        )
        .join('')}
    </ul>
    <button class="btn primary big" data-act="tpl-new">+ 新建模块模版</button>
    ${navHTML('templates')}
  </main>`;
};

/* ---- 模块模版编辑器 ---- */

function emptyModuleDraft(i) {
  return {
    name: `模块${cnNum(i + 1)}`,
    maxScore: null,
    questionCount: null,
    perQuestionScore: null,
    suggestedMinutes: null,
    children: [],
  };
}

function tplDraftFromTemplate(t) {
  return {
    kind: 'tpl',
    id: t ? t.id : null,
    name: t ? t.name : '',
    modules: t
      ? t.modules.map((m) => ({
          name: m.name,
          maxScore: m.maxScore,
          questionCount: m.questionCount,
          perQuestionScore: m.perQuestionScore,
          suggestedMinutes: m.suggestedMinutes,
          children: (m.children || []).map((c) => ({ name: c.name, suggestedMinutes: c.suggestedMinutes })),
        }))
      : [emptyModuleDraft(0), emptyModuleDraft(1)],
    returnTo: null,
  };
}

views.tplEdit = () => {
  const t = ui.tpl;
  if (!t) return views.templates();
  return `<main class="page sub">
    ${pageHead(t.id ? '编辑模块模版' : '新建模块模版', { right: '<button class="text-btn" data-act="tpl-save">保存</button>' })}
    <section class="card">
      <label class="field">
        <span>模版名称</span>
        <input id="t-name" type="text" placeholder="例：国考行测" value="${esc(t.name)}">
      </label>
    </section>
    <section class="card">
      <div class="card-head"><h2>模块</h2><span class="hint">按考试顺序排列</span></div>
      <ul class="tpl-mods">
        ${t.modules
          .map(
            (m, i) => `<li class="tpl-card">
              <div class="tpl-card-head">
                <span class="idx">${i + 1}</span>
                <input class="tpl-name-in" data-i="${i}" type="text" placeholder="模块名，如 资料分析" value="${esc(m.name)}">
                <div class="tpl-actions">
                  <button class="mini" data-act="tpl-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="上移">↑</button>
                  <button class="mini" data-act="tpl-down" data-i="${i}" ${i === t.modules.length - 1 ? 'disabled' : ''} aria-label="下移">↓</button>
                  <button class="mini danger" data-act="tpl-remove" data-i="${i}" ${t.modules.length <= 1 ? 'disabled' : ''} aria-label="删除">×</button>
                </div>
              </div>
              <div class="tpl-grid">
                <label><span>建议用时（分）</span><input class="tpl-sug-in" data-i="${i}" type="number" inputmode="decimal" min="0" step="1" placeholder="选填" value="${m.suggestedMinutes == null ? '' : m.suggestedMinutes}"></label>
                <label><span>题目数</span><input class="tpl-q-in" data-i="${i}" type="number" inputmode="numeric" min="0" step="1" placeholder="选填" value="${m.questionCount == null ? '' : m.questionCount}"></label>
                <label><span>每题分值</span><input class="tpl-qp-in" data-i="${i}" type="number" inputmode="decimal" min="0" step="0.1" placeholder="默认 1" value="${m.perQuestionScore == null ? '' : m.perQuestionScore}"></label>
                <label><span>满分（选填）</span><input class="tpl-max-in" data-i="${i}" type="number" inputmode="decimal" min="0" step="0.5" placeholder="可不填" value="${m.maxScore == null ? '' : m.maxScore}"></label>
              </div>
              <div class="tpl-subs">
                <div class="tpl-subs-head">
                  <span>二级模块${m.children.length ? `（${m.children.length}）` : ''}</span>
                  <button class="text-btn dim" data-act="sub-add" data-i="${i}">+ 添加</button>
                </div>
                ${
                  m.children.length
                    ? `<ul class="sub-list">${m.children
                        .map(
                          (c, ci) => `<li>
                            <input class="sub-name-in" data-i="${i}" data-ci="${ci}" type="text" placeholder="子模块名" value="${esc(c.name)}">
                            <input class="sub-sug-in" data-i="${i}" data-ci="${ci}" type="number" inputmode="decimal" min="0" step="1" placeholder="建议(分)" value="${c.suggestedMinutes == null ? '' : c.suggestedMinutes}">
                            <button class="mini danger" data-act="sub-remove" data-i="${i}" data-ci="${ci}" aria-label="删除子模块">×</button>
                          </li>`,
                        )
                        .join('')}</ul>`
                    : '<p class="hint">不填则这个模块整体计时；填了以后按子模块逐个计时，用时仍计入本模块。</p>'
                }
              </div>
            </li>`,
          )
          .join('')}
      </ul>
      <button class="btn ghost small" data-act="tpl-add">+ 添加模块</button>
    </section>
    <button class="btn primary big" data-act="tpl-save">保存模版</button>
    ${t.id ? '<button class="btn danger-ghost" data-act="tpl-delete-current">删除这个模版</button>' : ''}
  </main>`;
};

function syncTplDraft() {
  const t = ui.tpl;
  if (!t) return null;
  const name = $('#t-name');
  if (name) t.name = name.value;
  $$('.tpl-name-in').forEach((inp) => {
    const i = Number(inp.dataset.i);
    if (t.modules[i]) t.modules[i].name = inp.value;
  });
  $$('.tpl-sug-in').forEach((inp) => {
    const i = Number(inp.dataset.i);
    if (t.modules[i]) t.modules[i].suggestedMinutes = numOrNull(inp.value);
  });
  $$('.tpl-q-in').forEach((inp) => {
    const i = Number(inp.dataset.i);
    if (t.modules[i]) t.modules[i].questionCount = numOrNull(inp.value);
  });
  $$('.tpl-qp-in').forEach((inp) => {
    const i = Number(inp.dataset.i);
    if (t.modules[i]) t.modules[i].perQuestionScore = numOrNull(inp.value);
  });
  $$('.tpl-max-in').forEach((inp) => {
    const i = Number(inp.dataset.i);
    if (t.modules[i]) t.modules[i].maxScore = numOrNull(inp.value);
  });
  $$('.sub-name-in').forEach((inp) => {
    const i = Number(inp.dataset.i);
    const ci = Number(inp.dataset.ci);
    if (t.modules[i] && t.modules[i].children[ci]) t.modules[i].children[ci].name = inp.value;
  });
  $$('.sub-sug-in').forEach((inp) => {
    const i = Number(inp.dataset.i);
    const ci = Number(inp.dataset.ci);
    if (t.modules[i] && t.modules[i].children[ci]) {
      t.modules[i].children[ci].suggestedMinutes = numOrNull(inp.value);
    }
  });
  return t;
}

/* ---- 考试模版编辑器 ---- */

function examTplDraft(e) {
  return {
    kind: 'etpl',
    id: e ? e.id : null,
    name: e ? e.name : '',
    start: e ? msToHM(e.startVirtual) : '09:00',
    end: e ? msToHM(e.endVirtual) : '11:00',
    templateId: e ? e.templateId : null,
    moduleCount: e ? e.moduleCount : 4,
    totalScore: e && e.totalScore != null ? String(e.totalScore) : '',
    returnTo: null,
  };
}

views.examTplEdit = () => {
  const e = ui.etpl;
  if (!e) return views.templates();
  const data = store.db();
  const choices = [
    { id: '', title: `默认模块 × ${e.moduleCount}`, sub: '按顺序生成「模块一、模块二…」' },
    ...data.templates.map((t) => ({ id: t.id, title: t.name, sub: t.modules.map((m) => m.name).slice(0, 5).join(' · ') })),
  ];
  return `<main class="page sub">
    ${pageHead(e.id ? '编辑考试模版' : '新建考试模版', { right: '<button class="text-btn" data-act="etpl-save">保存</button>' })}
    <section class="card">
      <label class="field">
        <span>模版名称</span>
        <input id="e-name" type="text" placeholder="例：国考行测 上午场" value="${esc(e.name)}">
      </label>
      <div class="field-row">
        <label class="field"><span>默认开始时间</span><input id="e-start" type="time" value="${e.start}"></label>
        <label class="field"><span>默认结束时间</span><input id="e-end" type="time" value="${e.end}"></label>
      </div>
      <p class="hint" id="e-dur">${durLabelHTML(e.start, e.end)}</p>
      <label class="field">
        <span>默认总分<em>选填</em></span>
        <input id="e-total" type="number" inputmode="decimal" min="0" step="0.5" placeholder="不填也可以" value="${esc(e.totalScore)}">
      </label>
    </section>
    <section class="card">
      <div class="card-head"><h2>默认模块模版</h2></div>
      <div class="radio-list">
        ${choices
          .map(
            (c) => `<button class="radio-row${(c.id || '') === (e.templateId || '') ? ' on' : ''}" data-act="etpl-pick" data-id="${c.id}">
              <span class="radio-dot"></span>
              <span class="radio-body"><b>${esc(c.title)}</b><small>${esc(c.sub)}</small></span>
            </button>`,
          )
          .join('')}
      </div>
      ${e.templateId ? '' : `<div class="stepper">
          <span>模块数量</span>
          <div>
            <button class="step-btn" data-act="etpl-count" data-delta="-1" ${e.moduleCount <= 2 ? 'disabled' : ''}>−</button>
            <b>${e.moduleCount}</b>
            <button class="step-btn" data-act="etpl-count" data-delta="1" ${e.moduleCount >= 8 ? 'disabled' : ''}>+</button>
          </div>
        </div>`}
    </section>
    <button class="btn primary big" data-act="etpl-save">保存考试模版</button>
    ${e.id ? '<button class="btn danger-ghost" data-act="etpl-delete-current">删除这个考试模版</button>' : ''}
  </main>`;
};

function syncExamTplDraft() {
  const e = ui.etpl;
  if (!e) return null;
  const name = $('#e-name');
  const start = $('#e-start');
  const end = $('#e-end');
  const total = $('#e-total');
  if (name) e.name = name.value;
  if (start && parseHM(start.value) != null) e.start = start.value;
  if (end && parseHM(end.value) != null) e.end = end.value;
  if (total) e.totalScore = total.value;
  return e;
}

/* ------------------------------------------------------------- 记录 */

views.history = () => {
  const data = store.db();
  const list = data.sessions
    .filter((s) => s.status === 'finished')
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return `<main class="page sub">
    ${pageHead('考试记录')}
    ${list.length === 0
      ? '<p class="empty">还没有完成过模拟考试。开始一场试试？</p>'
      : `<ul class="hist-list">
          ${list
            .map((s) => {
              const a = analyze(s);
              return `<li>
                <button class="hist-item" data-act="open-session" data-id="${s.id}">
                  <span class="hist-main">
                    <b>${esc(s.name || '模拟考试')}</b>
                    <small>${fmtDateTime(s.startedAt)} · ${esc(s.templateName || '')}${s.finishReason === 'timeup' ? ' · 时间到' : ''}</small>
                  </span>
                  <span class="hist-side">
                    <b>${a.effectiveTotal != null ? fmtScore(a.effectiveTotal) + (s.plan.totalScore ? `<i>/${fmtScore(s.plan.totalScore)}</i>` : '') : fmtMS(sumModuleMs(s))}</b>
                    <small>${a.effectiveTotal != null ? '得分' : '用时'}</small>
                  </span>
                </button>
              </li>`;
            })
            .join('')}
        </ul>`}
    ${navHTML('history')}
  </main>`;
};

/* --------------------------------------------------------------- 渲染 */

function render() {
  stopTicking();
  const root = $('#app');
  const html = (views[ui.view] || views.home)();
  root.innerHTML = html;
  window.scrollTo(0, 0);
  afterRender();
}

function afterRender() {
  if (ui.view === 'exam') startTicking();
}

function go(view, params = {}) {
  if (view !== 'newExam' && ui.draft && ui.draft.kind === 'exam') ui.draft = null;
  ui.view = view;
  ui.params = params;
  render();
}

/* --------------------------------------------------------------- 时钟 */

let wakeLock = null;

function setText(sel, text) {
  const el = $(sel);
  if (el && el.textContent !== text) el.textContent = text;
}

function rotateHand(sel, deg) {
  const el = $(sel);
  if (el) el.setAttribute('transform', `rotate(${deg.toFixed(2)} 100 100)`);
}

function tick() {
  if (ui.view !== 'exam') return;
  const s = currentExam();
  if (!s || s.status !== 'running') return;
  const now = Date.now();
  const v = virtualNow(s, now);
  const remain = remainingMs(s, now);
  const used = elapsedWall(s, now);

  setText('#digit', msToHMS(v));
  if ($('#handS')) {
    const secs = Math.floor(v / 1000) % 60;
    const mins = Math.floor(v / 60000) % 60;
    const hrs = Math.floor(v / 3600000) % 12;
    rotateHand('#handS', secs * 6);
    rotateHand('#handM', mins * 6 + secs * 0.1);
    rotateHand('#handH', hrs * 30 + mins * 0.5);
  }
  setText('#remain', remain >= 0 ? `剩余 ${fmtHMS(remain)}` : `超时 ${fmtHMS(-remain)}`);
  setText('#usedText', `已用 ${fmtHMS(used)}`);
  setText('#realTime', `现在 ${new Date().toTimeString().slice(0, 5)}`);

  const card = $('#clockCard');
  if (card) card.classList.toggle('urgent', remain <= 5 * 60000);

  const bar = $('#barFill');
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, (used / s.plan.durationMs) * 100)).toFixed(2)}%`;

  const cur = currentStep(s);
  if (cur) {
    const started = cur.step.startedAt || now;
    const stepMs = Math.max(0, now - started);
    setText('#modTimer', fmtMS(stepMs));
    const target = cur.isChild ? stepSuggestedMs(cur.module, cur.step) : moduleSuggestedMs(cur.module);
    const targetEl = $('#modTarget');
    if (targetEl) {
      if (!target) {
        targetEl.textContent = '';
        targetEl.className = 'cm-target';
      } else {
        const diff = stepMs - target;
        const text = diff > 0
          ? `建议 ${fmtMS(target)} · 已超出 ${fmtMS(diff)}`
          : `建议 ${fmtMS(target)} · 还剩 ${fmtMS(-diff)}`;
        if (targetEl.textContent !== text) targetEl.textContent = text;
        targetEl.className = `cm-target${diff > 0 ? ' over' : diff > -5 * 60000 ? ' near' : ''}`;
      }
    }
    if (cur.isChild) {
      const parentLeft = moduleSuggestedMs(cur.module);
      const parentUsed = cur.module.children.reduce((a, c) => a + (c.elapsedMs || 0), 0) + stepMs;
      if (parentLeft) setText('#modParent', `本模块合计 ${fmtMS(parentUsed)} / 建议 ${fmtMS(parentLeft)}`);
    }
  }

  if (remain <= 0 && !ui.ending) {
    ui.ending = true;
    finishExam(s, 'timeup');
  }
}

function startTicking() {
  stopTicking();
  tick();
  ui.timer = setInterval(tick, 250);
  requestWakeLock();
}

function stopTicking() {
  if (ui.timer) clearInterval(ui.timer);
  ui.timer = null;
  releaseWakeLock();
}

async function requestWakeLock() {
  if (!store.db().settings.keepAwake) return;
  if (!('wakeLock' in navigator)) return;
  if (document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (err) {
    /* 忽略 */
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.release(); } catch (err) { /* ignore */ }
    wakeLock = null;
  }
}

/* --------------------------------------------------------------- 提示音 */

let audioCtx = null;

function ensureAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (err) {
    audioCtx = null;
  }
}

function beep(count = 1, freq = 880) {
  if (!store.db().settings.sound) return;
  ensureAudio();
  if (!audioCtx) return;
  for (let i = 0; i < count; i += 1) {
    const t0 = audioCtx.currentTime + i * 0.36;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.32);
  }
}

function buzz() {
  if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
}

/* ----------------------------------------------------------- 考试流程 */

function startExam() {
  const d = syncExamDraft();
  const startV = parseHM(d.start);
  const endV = parseHM(d.end);
  if (startV == null || endV == null) {
    toast('请填写有效的开始与结束时间');
    return;
  }
  const existing = store.runningSession();
  if (existing && !window.confirm('有一场考试还在进行中，开始新考试会放弃它。继续？')) return;
  if (existing) store.removeSession(existing.id);

  const tpl = d.templateId ? store.findTemplate(d.templateId) : null;
  const source = tpl
    ? tpl.modules.map((m) => ({
        name: m.name,
        maxScore: m.maxScore,
        questionCount: m.questionCount,
        perQuestionScore: m.perQuestionScore,
        suggestedMinutes: m.suggestedMinutes,
        children: (m.children || []).map((c) => ({ name: c.name, suggestedMinutes: c.suggestedMinutes })),
      }))
    : defaultModules(d.moduleCount).map((m) => ({
        name: m.name, maxScore: null, questionCount: null, perQuestionScore: null, suggestedMinutes: null, children: [],
      }));
  if (!source.length) {
    toast('至少要有一个模块');
    return;
  }

  const now = Date.now();
  const session = {
    id: uid('ses'),
    name: String(d.name || '').trim(),
    templateId: tpl ? tpl.id : null,
    templateName: tpl ? tpl.name : `默认模块 × ${source.length}`,
    examTemplateId: d.examTemplateId || null,
    plan: {
      startVirtual: startV,
      endVirtual: endV,
      durationMs: durationFor(startV, endV),
      totalScore: numOrNull(d.totalScore),
    },
    modules: source.map((m) => ({
      id: uid('sm'),
      name: m.name,
      maxScore: numOrNull(m.maxScore),
      questionCount: numOrNull(m.questionCount),
      perQuestionScore: numOrNull(m.perQuestionScore),
      suggestedMinutes: numOrNull(m.suggestedMinutes),
      correctCount: null,
      score: null,
      startedAt: null,
      endedAt: null,
      elapsedMs: 0,
      skipped: false,
      children: (m.children || []).map((c) => ({
        id: uid('ss'),
        name: c.name,
        suggestedMinutes: numOrNull(c.suggestedMinutes),
        startedAt: null,
        endedAt: null,
        elapsedMs: 0,
      })),
    })),
    status: 'running',
    startedAt: now,
    finishedAt: null,
    finishReason: null,
    totalScore: null,
    note: '',
    scoresFilled: false,
  };

  const first = allSteps(session)[0];
  if (first) first.step.startedAt = now;

  const data = store.db();
  data.sessions.push(session);
  data.settings.lastSetup = {
    startVirtual: startV,
    endVirtual: endV,
    moduleCount: d.moduleCount,
    templateId: tpl ? tpl.id : null,
    examTemplateId: d.examTemplateId || null,
    totalScore: numOrNull(d.totalScore),
  };
  store.save();
  ui.draft = null;
  ui.ending = false;
  ensureAudio();
  ui.view = 'exam';
  ui.params = { id: session.id };
  render();
}

function completeStepAction() {
  const s = currentExam();
  if (!s || s.status !== 'running') return;
  const cur = currentStep(s);
  if (!cur) return;
  const isLast = allSteps(s).filter((x) => x.step.endedAt == null).length <= 1;
  completeCurrentStep(s, Date.now());
  store.save();
  beep(1, 1040);
  buzz();
  if (isLast) {
    if (window.confirm('全部模块已完成，现在交卷？')) {
      finishExam(s, 'manual');
      return;
    }
  }
  renderModules();
}

function undoStepAction() {
  const s = currentExam();
  if (!s || s.status !== 'running') return;
  const target = undoLastStep(s, Date.now());
  if (!target) return;
  store.save();
  renderModules();
  toast(`已撤销「${target.step.name}」，重新计时`);
}

function renderModules() {
  const s = currentExam();
  const panel = $('#modulePanel');
  if (s && panel) {
    panel.innerHTML = modulePanelHTML(s);
    tick();
  }
}

function finishExam(s, reason) {
  if (!s || s.status !== 'running') return;
  closeCurrentStep(s, Date.now());
  s.status = 'finished';
  s.finishedAt = Date.now();
  s.finishReason = reason;
  store.save();
  stopTicking();
  ui.ending = false;
  if (reason === 'timeup') {
    ui.flash = '考试时间到，已自动收卷';
    beep(3, 720);
    buzz();
  } else {
    beep(2, 880);
  }
  ui.view = 'result';
  ui.params = { id: s.id };
  render();
}

function submitExam() {
  const s = currentExam();
  if (!s) return;
  const cur = currentStep(s);
  const msg = cur
    ? `提前交卷？「${cur.step.name}」未完成的用时也会记入。`
    : '交卷并查看分析？';
  if (!window.confirm(msg)) return;
  finishExam(s, 'manual');
}

function abandonExam() {
  const s = currentExam();
  if (!s) return;
  if (!window.confirm('放弃这场考试？本场不会留下记录。')) return;
  store.removeSession(s.id);
  stopTicking();
  ui.view = 'home';
  ui.params = {};
  render();
}

/* ----------------------------------------------------------- 得分保存 */

function readScoreInputs(s) {
  const values = {};
  s.modules.forEach((m) => {
    const input = $(`input[data-mod="${m.id}"]`);
    values[m.id] = input ? numOrNull(input.value) : null;
  });
  const totalEl = $('#f-total-score');
  return { values, total: totalEl ? numOrNull(totalEl.value) : null };
}

function applyScores(s, raw) {
  s.modules.forEach((m) => {
    const v = raw.values[m.id];
    if (m.questionCount != null) {
      m.correctCount = v;
      m.score = v == null ? null : v * perQuestionScore(m);
    } else {
      m.score = v;
    }
  });
  // 手填总分优先；清空则回到「各模块合计」
  s.totalScore = raw.total;
  s.scoresFilled = s.totalScore != null || s.modules.some((m) => moduleScore(m) != null);
}

function liveScorePreview() {
  const s = sessionOf(ui.params.id);
  if (!s) return;
  const raw = readScoreInputs(s);
  const clone = {
    ...s,
    modules: s.modules.map((m) => {
      const v = raw.values[m.id];
      return m.questionCount != null
        ? { ...m, correctCount: v, score: v == null ? null : v * perQuestionScore(m) }
        : { ...m, score: v };
    }),
    totalScore: raw.total,
  };
  const preview = $('#totalPreview');
  if (preview) {
    const a = analyze({ ...clone, finishedAt: clone.finishedAt || Date.now() });
    preview.textContent = a.effectiveTotal != null ? fmtScore(a.effectiveTotal) : '—';
  }
}

function saveScores(id) {
  const s = sessionOf(id);
  if (!s) return;
  applyScores(s, readScoreInputs(s));
  s.note = $('#f-note') ? $('#f-note').value : s.note;
  store.save();
  render();
  toast('得分已保存');
}

/* --------------------------------------------------------------- 模版 */

function saveTemplate() {
  const t = syncTplDraft();
  if (!t) return;
  const name = String(t.name || '').trim();
  if (!name) {
    toast('给模版起个名字');
    return;
  }
  const modules = t.modules
    .map((m) => ({
      name: String(m.name || '').trim(),
      maxScore: numOrNull(m.maxScore),
      questionCount: numOrNull(m.questionCount),
      perQuestionScore: numOrNull(m.perQuestionScore),
      suggestedMinutes: numOrNull(m.suggestedMinutes),
      children: (m.children || [])
        .map((c) => ({ name: String(c.name || '').trim(), suggestedMinutes: numOrNull(c.suggestedMinutes) }))
        .filter((c) => c.name),
    }))
    .filter((m) => m.name);
  if (!modules.length) {
    toast('至少填一个模块名');
    return;
  }
  const data = store.db();
  const now = Date.now();
  const payload = modules.map((m) => ({
    id: uid('tmod'),
    name: m.name,
    maxScore: m.maxScore,
    questionCount: m.questionCount,
    perQuestionScore: m.perQuestionScore,
    suggestedMinutes: m.suggestedMinutes,
    children: m.children.map((c) => ({ id: uid('tsub'), ...c })),
  }));

  if (t.id) {
    const target = data.templates.find((x) => x.id === t.id);
    if (target) {
      target.name = name;
      target.modules = payload;
      target.updatedAt = now;
    }
  } else {
    const created = { id: uid('tpl'), name, modules: payload, createdAt: now, updatedAt: now };
    data.templates.push(created);
    if (ui.tpl.returnTo === 'new') {
      const d = newExamDraft();
      d.templateId = created.id;
    }
  }
  store.save();
  toast('模版已保存');

  if (ui.tpl.returnTo === 'new') {
    ui.tpl = null;
    ui.view = 'newExam';
    render();
  } else {
    ui.tpl = null;
    ui.view = 'templates';
    ui.tplKind = 'modules';
    render();
  }
}

function saveExamTemplate() {
  const e = syncExamTplDraft();
  if (!e) return;
  const name = String(e.name || '').trim();
  if (!name) {
    toast('给考试模版起个名字');
    return;
  }
  const startV = parseHM(e.start);
  const endV = parseHM(e.end);
  if (startV == null || endV == null) {
    toast('请填写有效的开始 / 结束时间');
    return;
  }
  const data = store.db();
  const now = Date.now();
  const payload = {
    name,
    startVirtual: startV,
    endVirtual: endV,
    templateId: e.templateId || null,
    moduleCount: clamp(e.moduleCount || 4, 2, 8),
    totalScore: numOrNull(e.totalScore),
    updatedAt: now,
  };
  if (e.id) {
    const target = data.examTemplates.find((x) => x.id === e.id);
    if (target) Object.assign(target, payload);
  } else {
    data.examTemplates.push({ id: uid('etpl'), createdAt: now, ...payload });
  }
  store.save();
  toast('考试模版已保存');
  ui.etpl = null;
  ui.view = 'templates';
  ui.tplKind = 'exams';
  render();
}

/* --------------------------------------------------------------- 事件 */

function onAct(act, el) {
  switch (act) {
    case 'go':
      ui.tplKind = el.dataset.view === 'templates' ? ui.tplKind : ui.tplKind;
      go(el.dataset.view, {});
      break;
    case 'back':
      if (ui.view === 'tplEdit' && ui.tpl && ui.tpl.returnTo === 'new') {
        ui.tpl = null;
        ui.view = 'newExam';
      } else if (ui.view === 'tplEdit') {
        ui.tpl = null;
        ui.view = 'templates';
        ui.tplKind = 'modules';
      } else if (ui.view === 'examTplEdit') {
        ui.etpl = null;
        ui.view = 'templates';
        ui.tplKind = 'exams';
      } else {
        ui.view = 'home';
      }
      render();
      break;
    case 'new-exam':
      ui.draft = null;
      ui.view = 'newExam';
      render();
      break;
    case 'pick-exam-template':
      applyExamTemplate(el.dataset.id || null);
      render();
      break;
    case 'pick-template':
      syncExamDraft();
      ui.draft.templateId = el.dataset.id || null;
      render();
      break;
    case 'mod-count': {
      syncExamDraft();
      ui.draft.moduleCount = clamp(ui.draft.moduleCount + Number(el.dataset.delta), 2, 8);
      render();
      break;
    }
    case 'start-exam':
      startExam();
      break;
    case 'resume':
      ui.ending = false;
      ui.view = 'exam';
      ui.params = { id: el.dataset.id };
      render();
      break;
    case 'complete':
      completeStepAction();
      break;
    case 'undo':
      undoStepAction();
      break;
    case 'submit':
      submitExam();
      break;
    case 'abandon':
      abandonExam();
      break;
    case 'toggle-clock': {
      const data = store.db();
      data.settings.clockMode = data.settings.clockMode === 'analog' ? 'digital' : 'analog';
      store.save();
      render();
      break;
    }
    case 'save-scores':
      saveScores(el.dataset.id);
      break;
    case 'open-session':
      ui.view = 'result';
      ui.params = { id: el.dataset.id };
      render();
      break;
    case 'session-menu':
      sessionMenu(el.dataset.id);
      break;
    case 'copy-report':
      copyReport(el.dataset.id);
      break;
    case 'tpl-seg':
      ui.tplKind = el.dataset.kind;
      render();
      break;
    case 'tpl-new':
      ui.tpl = tplDraftFromTemplate(null);
      ui.tpl.returnTo = ui.view === 'newExam' ? 'new' : null;
      ui.view = 'tplEdit';
      render();
      break;
    case 'tpl-new-exam':
      ui.etpl = examTplDraft(null);
      ui.view = 'examTplEdit';
      render();
      break;
    case 'tpl-edit':
      ui.tpl = tplDraftFromTemplate(store.findTemplate(el.dataset.id));
      ui.view = 'tplEdit';
      render();
      break;
    case 'etpl-edit':
      ui.etpl = examTplDraft(store.findExamTemplate(el.dataset.id));
      ui.view = 'examTplEdit';
      render();
      break;
    case 'etpl-pick':
      syncExamTplDraft();
      ui.etpl.templateId = el.dataset.id || null;
      render();
      break;
    case 'etpl-count':
      syncExamTplDraft();
      ui.etpl.moduleCount = clamp((ui.etpl.moduleCount || 4) + Number(el.dataset.delta), 2, 8);
      render();
      break;
    case 'etpl-save':
      saveExamTemplate();
      break;
    case 'etpl-delete':
    case 'etpl-delete-current': {
      const id = el.dataset.id || (ui.etpl && ui.etpl.id);
      if (!id) break;
      if (!window.confirm('删除这个考试模版？已产生的考试记录不受影响。')) break;
      store.removeExamTemplate(id);
      ui.etpl = null;
      ui.view = 'templates';
      ui.tplKind = 'exams';
      render();
      toast('考试模版已删除');
      break;
    }
    case 'tpl-add':
      syncTplDraft();
      if (ui.tpl.modules.length < 12) ui.tpl.modules.push(emptyModuleDraft(ui.tpl.modules.length));
      render();
      break;
    case 'tpl-remove':
      syncTplDraft();
      if (ui.tpl.modules.length > 1) ui.tpl.modules.splice(Number(el.dataset.i), 1);
      render();
      break;
    case 'tpl-up': {
      syncTplDraft();
      const i = Number(el.dataset.i);
      if (i > 0) {
        const m = ui.tpl.modules.splice(i, 1)[0];
        ui.tpl.modules.splice(i - 1, 0, m);
      }
      render();
      break;
    }
    case 'tpl-down': {
      syncTplDraft();
      const i = Number(el.dataset.i);
      if (i < ui.tpl.modules.length - 1) {
        const m = ui.tpl.modules.splice(i, 1)[0];
        ui.tpl.modules.splice(i + 1, 0, m);
      }
      render();
      break;
    }
    case 'sub-add': {
      syncTplDraft();
      const i = Number(el.dataset.i);
      if (ui.tpl.modules[i] && ui.tpl.modules[i].children.length < 12) {
        ui.tpl.modules[i].children.push({ name: '', suggestedMinutes: null });
      }
      render();
      break;
    }
    case 'sub-remove': {
      syncTplDraft();
      const i = Number(el.dataset.i);
      const ci = Number(el.dataset.ci);
      if (ui.tpl.modules[i]) ui.tpl.modules[i].children.splice(ci, 1);
      render();
      break;
    }
    case 'tpl-save':
      saveTemplate();
      break;
    case 'tpl-delete':
    case 'tpl-delete-current': {
      const id = el.dataset.id || (ui.tpl && ui.tpl.id);
      if (!id) break;
      if (!window.confirm('删除这个模版？已有的考试记录不受影响。')) break;
      store.removeTemplate(id);
      ui.tpl = null;
      ui.view = 'templates';
      ui.tplKind = 'modules';
      render();
      toast('模版已删除');
      break;
    }
    case 'export':
      exportBackup();
      break;
    case 'import':
      $('#import-file').click();
      break;
    default:
      break;
  }
}

function sessionMenu(id) {
  const s = sessionOf(id);
  if (!s) return;
  const choice = window.prompt('输入数字：1 删除这条记录　2 复制分析文本', '1');
  if (choice === '1') {
    if (window.confirm('删除这条考试记录？无法恢复。')) {
      store.removeSession(id);
      ui.view = 'history';
      render();
      toast('记录已删除');
    }
  } else if (choice === '2') {
    copyReport(id);
  }
}

function copyReport(id) {
  const s = sessionOf(id);
  if (!s) return;
  const text = reportText(s);
  const done = () => toast('分析文本已复制');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch (err) {
    toast('复制失败，请手动选择');
  }
  document.body.removeChild(ta);
}

function exportBackup() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  a.href = url;
  a.download = `mock-exam-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('备份文件已导出');
}

/* --------------------------------------------------------------- 绑定 */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  e.preventDefault();
  ensureAudio();
  onAct(btn.dataset.act, btn);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'f-start' || t.id === 'f-end') {
    const label = $('#durLabel');
    const startEl = $('#f-start');
    const endEl = $('#f-end');
    if (label && startEl && endEl) label.innerHTML = durLabelHTML(startEl.value, endEl.value);
  }
  if (t.id === 'e-start' || t.id === 'e-end') {
    const label = $('#e-dur');
    const startEl = $('#e-start');
    const endEl = $('#e-end');
    if (label && startEl && endEl) label.innerHTML = durLabelHTML(startEl.value, endEl.value);
  }
  if (ui.view === 'result' && (t.id === 'f-total-score' || t.dataset?.kind)) {
    liveScorePreview();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.setting) {
    const data = store.db();
    data.settings[t.dataset.setting] = t.checked;
    store.save();
    if (t.dataset.setting === 'keepAwake' && ui.view === 'exam') {
      if (t.checked) requestWakeLock();
      else releaseWakeLock();
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui.view === 'exam') {
    tick();
    requestWakeLock();
  }
});

/* --------------------------------------------------------------- 启动 */

function boot() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.id = 'import-file';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importJson(String(reader.result));
        toast('备份已导入');
        ui.view = 'home';
        render();
      } catch (err) {
        toast('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });
  document.body.appendChild(fileInput);

  const running = store.runningSession();
  if (running && remainingMs(running) <= 0) {
    finishExam(running, 'timeup');
    return;
  }
  ui.view = 'home';
  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
