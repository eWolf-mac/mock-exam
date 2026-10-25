/**
 * 检查 PWA 可安装性（依赖已运行的 headless Chrome，端口 9222）。
 *   node tools/check-pwa.mjs
 */
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await new Promise((r) => setTimeout(r, 1500));

const manifest = await send('Page.getAppManifest');
console.log('manifest url :', manifest.url);
console.log('manifest 错误:', manifest.errors && manifest.errors.length ? manifest.errors : '无');

const parsed = JSON.parse(manifest.data || '{}');
console.log('name/display :', parsed.name, '/', parsed.display, '/ icons:', (parsed.icons || []).length);

try {
  const errs = await send('Page.getInstallabilityErrors');
  console.log('可安装性错误:', errs.installabilityErrors.length ? errs.installabilityErrors : '无（可安装）');
} catch (err) {
  console.log('可安装性检查不可用:', err.message);
}

ws.close();
process.exit(0);
