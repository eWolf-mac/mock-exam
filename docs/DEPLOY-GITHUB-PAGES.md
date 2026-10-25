# 部署到 GitHub Pages（让 PWA 真正离线可用）

为什么要部署：Service Worker（离线缓存）在 iPhone 上**只允许 HTTPS**。局域网 `http://172.20.10.2:8123` 不能注册，
所以一旦关掉本地服务就打不开了。部署到 GitHub Pages 后是固定 HTTPS 地址，首次打开时缓存全部资源，之后**断网也能用**。

> 免费版 GitHub Pages 要求仓库是 **Public**（私有仓库需要 GitHub Pro）。仓库里的 `ios/`、`docs/` 会一并公开。

---

## 先做两件事

1. 注册/登录 GitHub；
2. 想好仓库名，它决定网址：
   `https://<你的用户名>.github.io/<仓库名>/`
   例如仓库叫 `mock-exam`、用户名 `zhangsan` → `https://zhangsan.github.io/mock-exam/`

---

## 方案一（推荐）：一个仓库 + 自动部署，只发布 `web/`

仓库里已经准备好了 [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)，
它会把 `web/` 目录作为站点根目录发布，`ios/`、`docs/` 不会出现在网站上。

**第 1 步｜建一个空仓库**

GitHub → New repository → 填名字 → **不要**勾选 "Add a README file" → Create。

**第 2 步｜把本地代码推上去**

在 `D:\HarnessProject` 目录打开终端（PowerShell），把 `<你的用户名>`、`<仓库名>` 换成自己的：

```powershell
cd D:\HarnessProject
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> 这个目录已经是 git 仓库（`main` 分支）、所有文件都已 `git add`，但**还没有提交**——
> 提交需要你自己的 git 身份。所以先跑下面两行设置身份（只需一次，全局生效）：
>
> ```powershell
> git config --global user.name "你的名字"
> git config --global user.email "你的邮箱"
> ```
>
> 然后提交并推送：
>
> ```powershell
> cd D:\HarnessProject
> git commit -m "初始提交：模拟考场 PWA + SwiftUI"
> git remote add origin https://github.com/<你的用户名>/<仓库名>.git
> git push -u origin main
> ```
> 首次 push 会弹浏览器让你登录 GitHub；也可以在 GitHub 生成 Personal Access Token，用 token 当密码。

**第 3 步｜确认 Pages 已开启**

仓库 → **Settings → Pages → Build and deployment**
- Source 选 **GitHub Actions**（不是 Deploy from a branch）

工作流里的 `actions/configure-pages` 带了 `enablement: true`，一般会自动帮你打开；
如果 Actions 那次运行因为 "Pages is not enabled" 失败了，就手动在这里选一次 GitHub Actions，
然后到 Actions 里点 **Re-run all jobs**。

约 1 分钟后变绿，地址就是 `https://<用户名>.github.io/<仓库名>/`。

**第 4 步｜装到手机**

iPhone Safari 打开那个 https 地址 → 等首页出来（这一次要联网，让它缓存）→ 分享 → **添加到主屏幕**。

**第 5 步｜验证**

打开飞行模式，从桌面图标打开 → 应该照常显示首页、能新建考试。能打开就说明离线缓存成功了。

---

## 方案二：单独一个小仓库，只放网页，不用 Actions

适合「不想让源码公开」或者「不熟悉 Actions」的情况。缺点是源码和线上文件是两份。

**第 1 步｜建空仓库**（同上）。

**第 2 步｜用网页上传**

仓库首页 → **Add file → Upload files**，把 `D:\HarnessProject\web\` **里面的内容**拖进去：

```
index.html
styles.css
sw.js
manifest.webmanifest
.nojekyll
js/            （整个文件夹）
icons/         （整个文件夹）
```

注意：**不要把 `web` 这个文件夹本身拖进去**，否则网址会变成 `/仓库名/web/`，而且会 404。

**第 3 步｜打开 Pages**

Settings → Pages → **Deploy from a branch** → Branch 选 `main`、目录选 `/ (root)` → Save。

等 1–2 分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

---

## 之后怎么更新

- **方案一**：改完代码 `git add -A && git commit -m "..." && git push`，Actions 自动重新发布。
- **方案二**：在网页上重新上传改动的文件，或本地新建 git 仓库 push 到同一个仓库。

**手机上可能要点两次才看到新版**：Service Worker 的策略是「先用缓存秒开，后台偷偷更新」，
所以更新后第一次打开还是旧版，第二次才是新版。想强制刷新：把
[`web/sw.js`](../web/sw.js) 第一行 `const CACHE = 'mock-exam-v1'` 改成 `v2`、`v3`… 再发布。

---

## 数据迁移（重要）

浏览器的 `localStorage` 跟**域名+端口**绑定。换地址后旧数据不会自动带过去：

1. 旧地址（或本地局域网地址）首页 → **导出备份** → 得到一个 `.json` 文件；
2. 新地址首页 → **导入备份**。

同理，如果你从局域网 IP 换到 GitHub Pages，之前录的模版和记录都要这样搬一次。

---

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 打开是 404 | 站点根目录没有 `index.html`。方案二最常犯：多套了一层 `web/` |
| 页面出来了但白屏 | 同上，或者 `js/app.js` 没传上去（检查 `js/` 文件夹是否完整） |
| 图标是默认空白方块 | 等 1–2 分钟 CDN 刷新；或强刷一次 |
| 「添加到主屏幕」后仍有地址栏 | 说明不是从 https 地址打开的，或 manifest 没加载成功 |
| 断网打不开 | 首次访问时没让它缓存完就断网了；联网重开一次 |
| Actions 报错 "Pages is not enabled" | Settings → Pages 里 Source 要先选 GitHub Actions 再跑工作流 |
| 私有仓库用不了 | 免费版 Pages 只支持 Public 仓库 |

---

## 想用自己的域名（可选）

仓库 → Settings → Pages → Custom domain 填 `exam.example.com`，
然后到域名商处添加一条 CNAME 指向 `<用户名>.github.io`，勾选 Enforce HTTPS。
**注意**：换域名后 `localStorage` 又变成新的存储空间，数据要重新导入一次。
