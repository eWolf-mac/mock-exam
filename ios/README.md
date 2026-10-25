# 模拟考场 MockExamClock（SwiftUI 原生 iOS）

> ## ⚠️ v1 存档，暂缓维护
>
> 这个目录是 **v1** 的原生实现，功能落后于 [`web/`](../web)（没有二级模块、考试模版、题目数计分、建议用时），
> 而且是在 Windows 上生成的工程、**从未用 Xcode 编译验证过**。
> 目前项目以 PWA 版为主，这里仅作存档；想继续做原生版时，请先按
> [`docs/SPEC.md`](../docs/SPEC.md) v2 重做数据模型与相关页面。
>
> 下面是 v1 时期的说明，仅作参考。

把任何真实时间，变成考场上的那两个小时：虚拟考场时钟 + 模块计时 + 用时 / 得分分析。
本目录是独立于 `web/` 的 iOS 原生实现，零第三方依赖、无网络请求、数据只存在本机。

## 1. 环境与打开方式

- macOS + **Xcode 15.0 或更高版本**（需要 iOS 17 SDK）。
- 系统要求：**iOS 17.0+**，Swift 5。
- 工程文件：`ios/MockExamClock.xcodeproj`。

```text
1. 双击 ios/MockExamClock.xcodeproj（不要直接打开 project.pbxproj）
2. 左上角 Scheme 选择 MockExamClock
3. 目标设备选择任意 iPhone 模拟器（如 iPhone 15）
4. 按 ⌘R 运行
```

真机运行：Xcode → 选中 MockExamClock target → **Signing & Capabilities** → 选择自己的 Team。
工程里 `CODE_SIGN_STYLE = Automatic`，**没有写入 DEVELOPMENT_TEAM**，所以模拟器可直接跑；
真机需要手动选一次团队。Bundle id 固定为 `com.harness.mockexamclock`。

> 本工程没有 `Info.plist`、没有 Storyboard、没有 LaunchScreen 文件，全部由
> `GENERATE_INFOPLIST_FILE = YES` 及 `INFOPLIST_KEY_*` 生成。

## 2. 文件结构

```text
ios/
  MockExamClock.xcodeproj/
    project.pbxproj
    project.xcworkspace/contents.xcworkspacedata
  MockExamClock/
    MockExamClockApp.swift   应用入口
    Models.swift             数据模型 / TimeMath（全部时间换算的唯一实现）
    Analysis.swift           结果页派生数据、效率标签、自动分析文字
    AppStore.swift           ObservableObject + JSON 持久化 + 业务操作
    Theme.swift              深色 / 浅色配色、卡片、按钮样式
    RootView.swift           Tab + 新建考试 Sheet + 考试 fullScreenCover
    HomeView.swift           首页 + SettingsView
    NewExamView.swift        新建考试
    ExamView.swift           考试页（时钟、交卷）
    ExamModuleSection.swift  考试页的模块进度区
    AnalogClockView.swift    Canvas 模拟表盘
    ResultView.swift         成绩分析
    ScoreEditView.swift      得分补录
    TemplateView.swift       模版列表 / 编辑
    HistoryView.swift        考试记录
    Assets.xcassets/
      Contents.json
      AppIcon.appiconset/Contents.json      （按需求为空图标集）
      AccentColor.colorset/Contents.json
  README.md
```

为确保「单文件不超过约 450 行」，分析算法、考试模块区、表盘、得分编辑四个相对独立的
视图/类型从大文件中拆成了 `Analysis.swift`、`ExamModuleSection.swift`、
`AnalogClockView.swift`、`ScoreEditView.swift`。

## 3. 已实现功能

### 首页
- 品牌区「模拟考场 / 把任何时间，变成考场上的那两个小时」。
- 快速开始大按钮。
- 上次设置摘要：`09:00 – 11:00 · 120 分钟 · 行测（示例）`。
- 模版、记录入口与数量。
- 存在 running 考试时，顶部显示呼吸红点「有一场考试未结束」卡片，点击继续。
- 设置页：提示音、屏幕常亮、默认时钟模式、分享 JSON 备份。

### 新建考试（Sheet）
- 名称（可选）、开始 / 结束时间（DatePicker 只显示时 / 分，避免日期部分干扰）。
- 自动计算总时长并支持跨零点：结束早于开始加 24h；结束 = 开始视为 24h。
- 默认模块 2–8 个（Stepper）或自定义模版，可现场新建模版。
- 总分（可选），非法数字时禁用「开始考试」并提示。
- 通过 `ExamSetup` 把模版名 / 模块名 / 满分快照写入 session。

### 考试中（fullScreenCover，无 TabView）
- 数字 HH:MM:SS（等宽大字号 + minimumScaleFactor）与 Canvas 模拟表盘切换。
- 12 个整点长刻度 + 分钟刻度 + 时针 / 分针 / 秒针。
- 剩余时间（HH:MM:SS，最后 5 分钟变红并闪烁）、已用时间、进度条。
- 考试时间区间、真实时间小字。
- 当前模块卡片、实时模块用时、完成本模块 / 撤销上一个、模块列表状态。
- 完成最后一个模块弹出「全部模块已完成，现在交卷？」。
- 提前交卷、放弃本场（均有二次确认）。
- 到点：系统提示音 + 重震动 + 全屏「考试结束」遮罩，1.8 秒后自动收卷
  （`finishReason = timeup`）。
- `.onAppear` 申请 `UIApplication.shared.isIdleTimerDisabled = true`，`.onDisappear` 恢复；
  切后台释放，回前台重新申请。
- 时钟只用时间戳差值：`virtualNow = startVirtual + (现在 - startedAt)`，
  `Timer.publish(every: 0.5)` 仅负责触发刷新；`scenePhase == .active` 时立即重算并检查超时。

### 结果分析
- 概览：模块用时合计、考试耗时、提前 / 超时、总分 / 满分与得分率。
- 模块覆盖率不足时显示覆盖率标签。
- 纯 SwiftUI 横向堆叠条 + 模块图例。
- 模块明细表：用时、占比、得分、满分、得分率、效率；无模块得分时自动隐藏得分 / 效率列。
- 效率严格按 SPEC 3.4：`scoreShare / timeShare >= 1.15` 优势、`0.85…1.15` 均衡、
  `< 0.85` 低效；仅有用时时 `timeShare >= 0.30` 重头、`<= 0.10` 轻量。
- 自动分析 3–5 条：最费时模块、得分率最高 / 最低、投入偏高可压缩模块
  （目标时间 = 当前用时 × 得分占比 / 用时占比，四舍五入到分钟且最少 3 分钟）、
  提前 / 超时建议、未录分提示。
- 编辑得分（总分 + 各模块得分 + 备注）、复制分析文本、删除记录。
- 模块得分合计 ≠ 总得分时显示提示。

### 模版
- 列表、新建、编辑（改名、增删模块、上移 / 下移、满分选填）、删除。
- 至少 1 个模块；名称为空 / 模块名为空 / 满分非法时拒绝保存并提示。
- 删除模版不影响历史（session 内已快照）。

### 记录
- 按完成时间倒序，显示名称、日期、已完成状态、用时、得分。
- 点击进入分析，左滑删除，结果页也可删除。

## 4. 关键设计说明

### 4.1 JSON 字段与 null
- 存储路径：`Application Support/mockexam.json`，原子写入。
- 字段名与 SPEC 第 2 节完全一致，没有 `keyEncodingStrategy` 转换。
- 默认的 Codable 合成会**省略**值为 nil 的字段；为与 Web / SPEC 的显式 `null` 对齐，
  `LastSetup`、`TemplateModule`、`ExamPlan`、`SessionModule`、`ExamSession`
  使用自定义 `encode(to:)`，nil 一律写 `null`。
- 未开始的模块：`startedAt = null`、`endedAt = null`、`elapsedMs = 0`；
  进行中的模块：`startedAt` 有值、`endedAt = null`。这是 SPEC 未展开处的实现约定。
- 首次启动写入默认设置与示例模版「行测（示例）」；读取 / 解析失败回退默认值，
  首页显示提示，不崩溃。

### 4.2 得分补录与派生总分
- `scoresFilled = 总分非空 || 任一模块得分非空`。
- 只填总分、不填模块得分：可用；结果页只展示总分 / 得分率，不展示效率列。
- **只填各模块得分、总分留空：自动用模块得分合计作为总得分**，
  这样「满分 100、模块得分 25/18/30」会直接显示 `73 / 100（73%）`。
- 同时填写总分与模块得分且不一致时保留用户总分，并提示
  「模块得分合计 73 ≠ 总得分 78」。

### 4.3 模块计时与撤销
- 开始考试时第一个模块开始计时，其余 `startedAt = null`。
- 「完成本模块」写入真实时间戳差 `endedAt - startedAt`，并让下一个模块从当前时刻开始计时。
- 「撤销上一个」把最后一个已结束模块清空用时、从当前时刻重新计时，之后的模块全部复位。
- 交卷时会把**当前正在进行的模块**也结算一次；从未开始的模块保持 0。
  （SPEC 的「未完成模块不计时」按「从未开始」理解。）

### 4.4 超时与恢复
- 考试页每 0.5s 重算剩余时间；`scenePhase` 回到 active 立即重算。
- 超时先展示全屏「考试结束」并播放声音 / 震动，1.8s 后收卷，`finishedAt` 截到计划结束时刻。
- 冷启动时 `AppStore` 会扫描 running session：若已超过计划结束时间，直接按计划结束时刻
  收卷（`timeup`），避免关闭 App 期间的时间污染分析。
- 放弃本场：`status = discarded`，保留在 JSON 但**不进入记录列表**（符合 SPEC 3.3）。

### 4.5 视觉
- 深色：背景 `#0B0F14`、面板 `#141A21`、主色 `#3DDC97`、警告 `#FF5C5C`。
- 浅色：纸张白 + 墨色数字，根据系统 `colorScheme` 自动切换。
- 模块图表使用 SPEC 的 8 色。
- 主按钮 / 次按钮最小高度 50pt，图标按钮 44×44pt。

## 5. pbxproj 自查结论

`project.pbxproj` 使用经典写法、`objectVersion = 56`、`compatibilityVersion = "Xcode 14.0"`。
已用一个自写的 OpenStep plist 解析器逐项校验：

- `objects` 共 47 个，UUID 全部为 24 位十六进制且无重复。
- **15 个 `.swift` 文件**各有唯一 `PBXFileReference` + `PBXBuildFile`，
  并在 `PBXSourcesBuildPhase` 中各出现一次；源文件数量 = 15。
- `Assets.xcassets` 使用 `lastKnownFileType = folder.assetcatalog`，
  引用唯一，且在 `PBXResourcesBuildPhase` 中出现一次。
- 每个文件引用都被 `MockExamClock` group 收录；所有 group / build phase / target /
  configuration list 的 UUID 引用均存在；花括号、圆括号、分号配平。
- 目标 `MockExamClock`、bundle id `com.harness.mockexamclock`、`SWIFT_VERSION = 5.0`、
  `IPHONEOS_DEPLOYMENT_TARGET = 17.0`、`TARGETED_DEVICE_FAMILY = "1,2"`、
  `CODE_SIGN_STYLE = Automatic`、无 `DEVELOPMENT_TEAM`。
- `GENERATE_INFOPLIST_FILE = YES`，无 `INFOPLIST_FILE`，无 storyboard；
  `INFOPLIST_KEY_UILaunchScreen_Generation` 与
  `INFOPLIST_KEY_UIApplicationSceneManifest_Generation` 均为 `YES`。
- iPhone 支持竖屏 + 左右横屏；iPad 支持全部方向。
- 无测试 target、无第三方依赖。

## 6. 无法验证 / 已知限制（重要，请如实看待）

- **没有在 macOS / Xcode 上编译过。** 开发环境是 Windows，没有 Swift / Xcode。
  `project.pbxproj` 的结构、UUID 引用、配平与构建设置是用脚本逐项验证的；
  Swift 代码做了人工逐文件检查与括号 / 字符串配平检查，但**类型检查、SwiftUI 行为、
  真机交互均未经过编译或运行验证**。首次在 Xcode 打开时如有编译错误，最可能在：
  1) 个别 SwiftUI 修饰符的可用版本 / 签名；
  2) 展示层（Pulse / Canvas / Form）的细节；
  3) 自定义 Codable 的编译推断。
- `AppIcon.appiconset` 按需求使用空 `images` 数组，因此 App 图标是空白占位；
  这不会提供图标资源，但可编译（可能伴随资源目录警告）。
- 提示音使用 `AudioServicesPlaySystemSound/AlertSound` 系统音，受静音开关影响；
  模拟器通常没有震动，真机才有触感反馈。
- App 进入后台会被 iOS 挂起，不能保证在后台准点播放提示音；回到前台或冷启动时
  会按时间戳补算并自动收卷。未实现本地通知 / Live Activity。
- 只实现 JSON 分享导出，没有实现 JSON 导入；`Application Support` 目录不在「文件」App
  中直接可见，需通过设置页分享，或用 Xcode 下载 App 容器。
- 分数只接受非负整数，不支持小数。
- 放弃的考试保留在 JSON 中（status = discarded）但不在记录里展示；这是对
  SPEC 3.3「不进记录」的实现选择。
- 当前没有 UI 阻止「已有 running 考试时再新建一场」；正常使用只有一场。若出现异常残留，
  `runningSession` 取最近一场。建议后续加互斥提示。
- 横屏没有做左右分栏，考试页在横屏下仍是上下滚动布局（符合「横屏时上下布局」）。
- 没有单元测试 target；纯算法（TimeMath / SessionAnalysis）目前只能人工核对。

## 7. SPEC 验收用例对照

| 用例 | 实现位置 |
| --- | --- |
| 任意时刻开始 09:00–11:00，时钟从 09:00:00 递减 | `TimeMath.virtualNow` / `ExamView` |
| 完成 / 撤销模块，用时累加与清零 | `AppStore.completeCurrentModule` / `undoLastModule` |
| 系统时间 +10 分钟，虚拟时钟同步前进 | 时间戳差值 + `scenePhase` 重算 |
| 到 11:00 自动结束、finishReason=timeup | `ExamView.triggerTimeUp` / `AppStore.finishSession` |
| 总分 100、模块满分 30/30/40、得分 25/18/30 → 73/100 | `AppStore.updateScores` 派生总分 + `SessionAnalysis` |
| 只填总分不填模块分 → 只显示总分与得分率 | `SessionAnalysis.hasModuleScores` 控制列显示 |
| 模版改名 / 删除不影响历史 | session 快照 `templateName` / module `name` / `maxScore` |
| 09:00–11:00 与 23:00–01:00 都显示 120 分钟 | `TimeMath.virtualDurationMs` |
| 重新打开后继续未完成考试 | `AppStore` 加载 running session + 首页继续卡片 |

## 8. 数据重置

- 删除 App 会清空本机数据。
- 或删除 App 沙盒中的 `Library/Application Support/mockexam.json`。
- 设置页可生成 `mockexam.json` 并通过系统分享面板导出备份。
