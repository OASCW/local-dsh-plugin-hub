# 插件中心 · Plugin Hub

给 DSH（DeepSeek Harness）Web 界面加一个**可搜索的插件面板**，把已安装外部插件的英文描述显示成中文。

`@local/dsh-plugin-hub` · v0.2.0 · Web 平台 · 10 个文件约 46 KB

---

## 它解决什么问题

DSH 插件自带的 `description` 几乎全是英文。插件装多了以后，光看包名和英文描述很难一眼分清哪个是干什么的。

这个插件提供一个中文中转站：一页看全所有已装插件的**中文用途说明**，支持搜索，需要核对原文时可以一键展开英文原文。

## 功能

| 功能 | 说明 |
| --- | --- |
| 中文描述 | 内置「包名 → 中文说明」词典，覆盖快照内的全部插件 |
| 搜索 | 匹配 **包名 / 版本 / 英文描述 / 中文描述**，命中片段高亮 |
| 原文对照 | 「显示英文 / 隐藏英文」切换，方便核对译文是否走样 |
| 统计行 | `共 N 个 · 已译 N 个 · 当前显示 N 个 · 数据来源 · 构建戳` |
| 异常可见 | 渲染出错时把错误直接画在面板上，绝不留空白 |
| 未收录标记 | 词典里没有的插件标「未收录中文」，并回落显示英文原文 |

## 界面

面板由三部分组成：

1. **操作栏** —— 搜索框、「刷新」、「显示英文 / 隐藏英文」按钮
2. **状态行** —— 例：`共 N 个插件 · 已译 N 个 · 当前显示 N 个 · 数据来源：内置快照 · BUILD-<构建戳>`
3. **列表** —— 每张卡片包含：包名（命中处高亮）、版本号、分组标签、中文描述

入口有多个（见「四条注册通道」），正常可从**侧栏图标**或**设置页 → 插件中心**进入。

## 安装

本包是一个 **DSH 插件包（plugin bundle）**，通过 `cordis.patch.yml` 把自己插入当前 profile：

```yaml
- insert:
    - id: plugin-hub
      name: '@local/dsh-plugin-hub'
```

`package.json` 中对应的声明：

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "immediately": true, "inject": [] }
}
```

## 工作原理

### 双半边结构

DSH 插件分为 Host（Node 侧）与 Client（浏览器侧）两半，本包两边都有入口。

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| Host | `index.js` | **目前是空壳**：只导出 `name` 与 `apply`，`apply` 内不注册任何资源。保留它是为了让插件成为合法的 Host 入口，保证能在 profile 里正常激活与卸载。已规划在这里实现「英文描述 → 中文」的 LLM 自动翻译 + 落盘缓存（浏览器侧没有 LLM 通道，`ctx.llm` 只在 Host 可用）。 |
| Client | `client.js` | **全部功能都在这里**（556 行）。通过 `window.__ModuleLoader__.load({ id, factory })` 注册，只 `require('react')`，不引入任何 `@deepseek-ai/dsh-client-ui-*` 包。 |

### 四条注册通道

`client.js` 的 `apply()` 把同一份 UI 注册到了四个插槽：

| 插槽 | 组件 | 状态 |
| --- | --- | --- |
| `main` | `HubRoot` | ✅ 主面板页面本体 |
| `sidebar.panellist` | `PluginHubIcon` | ✅ 侧栏图标入口，`order: 1` |
| `plugins.item` | `PluginHubInline` | ❌ **走不通**。官方该槽位按「官方插件」过滤，第三方注册进去不显示。代码保留仅为记录这次尝试。 |
| `settings.section` | `HubRoot` | ✅ **最终选用的通道**，`order: 90`。它渲染在设置页这类普通内容区，皮肤覆盖不到。 |

### 三个关键设计决定

**1. 数据只用内置快照，完全不碰 `ctx.remote`**

`client.js` 里的 `BUNDLED` 数组把插件记录（包名 / 版本 / 英文描述）直接写死在代码里。原因是实测该 profile **没有挂载** `remote.pluginManager` 与 `remote.pluginInventory`：

- 不声明就访问 `ctx.remote` → `cannot get property "remote" without inject`
- 声明后访问 `remote.pluginManager` → `cannot get property "remote.pluginManager" without inject`（Cordis 是**逐层校验**，每一层都要单独声明）
- 但声明了**不存在**的服务时，Cordis 会让插件一直等待、干脆不加载 —— 面板会整个消失，比「没有实时数据」更糟

所以这里彻底不依赖远程：**面板一打开就有内容**。

**2. Client 侧零 Hooks，全部用 class 组件**

上一版用函数组件 + `useState/useEffect` 时，面板出现了被错误边界兜住的异常，最可能的原因是 **Invalid hook call**（宿主提供的 React 与渲染本组件的 React 不是同一个实例）。原先的 `hasHooks` 检查只能看出函数是否存在，查不出实例不同。

现在整页改用 `React.Component + this.setState`，从根上避开这一类失败。错误边界 `HubBoundary` 本身也是 class 组件。

**3. 反皮肤隔离层**

某些第三方皮肤用 `position:fixed + inset:0 + 100vw/100vh + z-index:4` 的全屏侧栏装饰**把侧栏整条埋掉**，导致注册在 `sidebar.panellist` 的图标看不见也点不到（颜色不是问题，纯粹是布局遮挡）。

因此面板声明了一组隔离样式，逐一反制皮肤使用的四种隐藏手段（`display:none` / `visibility:hidden` / `opacity:0` / `pointer-events:none`）：

- 每条声明带 `!important` —— 压过皮肤样式表里的普通规则
- `z-index: 2147483647` —— 没有比它更高的层
- `isolation: isolate` —— 自成层叠上下文，不受外层 `z-index` 摆布
- 不透明底色 —— 皮肤的花纹透不过来
- `contain: layout paint style` —— 绘制范围锁在自己盒子里

视觉上其余部分只用宿主主题令牌（`--dsw-alias-*`，名字取自官方 `PluginManagerPage` 的 CSS），且**每一档都带 fallback**，令牌取不到时也不会变成空值。

## 已知限制

1. **清单是内置快照，且仓库里附带的是示例数据。** `BUNDLED` / `ZH` 里是 4 条 `@example/*` 占位记录，只为演示面板效果，不是任何真实环境的插件清单；装了新插件也不会自动出现，需要手工替换 `BUNDLED`（数据来源：profile 的 `package.json` 里的 `bundles` + `dependencies`，再逐个读各包自己的 `package.json` 取 `name` / `version` / `description`）。
2. **中文词典 `ZH` 是手工维护的映射**，不会自动翻译新插件。Host 侧已预留 LLM 自动翻译 + 缓存的落点，但尚未实现。
3. **`plugins.item` 通道走不通**，理由见上表。
4. **反皮肤方案是「用力压过去」**：依赖 `z-index: 2147483647` 与 `!important`。若宿主将来调整插槽结构或皮肤改变策略，需要重新核对。

## 开发

### 跑逻辑自测

`_test-data.mjs` 是一份**纯数据自测**（不涉及 React / DOM）。它用 `new Function` 从 `client.js` 里截出 `ZH / BUNDLED / zhFor / normalize / dedupe` 这一段做验证，覆盖的正是上一版「面板显示共 0 个插件」那个 bug：

```bash
node _test-data.mjs client.js
```

预期结果（6 项全过）：

```
快照原始条数 (BUNDLED)        = N
解析后条数 (normalize+dedupe) = N
✓ BUNDLED 有 N 条
✓ 解析后也是 N 条（这就是上次的 bug）
✓ 每条都有非空 pkg
✓ 每条都有英文描述  N/N
✓ 中文词典全覆盖 N 条  N/N
✓ 每条都有版本号
```

> 坑点记录：快照条目的键是 `{ pkg, version, en }`，而 `normalize()` 原先只认 `packageName/name/id/package` 和 `description/summary`，两边对不上 ⇒ `pkg` 取到空串 ⇒ 被守卫丢掉 ⇒ 列表 0 条。所以 `item.pkg` 与 `item.en` 必须排在最前面。

### 改代码时的注意事项

- **每次改 `client.js` 都要更新 `BUILD` 常量。** 它会显示在面板状态行里，用来一眼判断浏览器当前跑的是哪一版代码 —— 如果这个戳没变，说明客户端模块压根没被重新加载，那是加载问题而不是代码问题。
- Client 侧不要 `import` 任何 `@deepseek-ai/dsh-client-ui-*` 包，也不要碰组件外的东西（不写 `document.body`，不读别的插件的 DOM）。
- `.ph-root` 的底色**故意不透明**：它与「文字不加底」的视觉原则不冲突 —— 后者针对单个文字控件不要假透明色块，前者是整块面板必须盖住皮肤。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `package.json` | 包元数据 + `dsh.bundle` / `dsh.client` 声明 |
| `index.js` | Host 半边（当前为空壳，为 LLM 翻译预留） |
| `client.js` | Client 半边，全部界面与数据逻辑 |
| `cordis.patch.yml` | 把自己 insert 进 profile 的补丁 |
| `locale/zh.json` | 中文界面文案 |
| `locale/en.json` | 英文界面文案 |
| `icon.svg` | 侧栏图标 |
| `_test-data.mjs` | 纯数据自测脚本 |
| `README.md` | 本文件 |
| `LICENSE` | MIT 许可证 |

## 版本

- **0.2.0** —— Client 侧从函数组件改为 class 组件（绕开 Invalid hook call）；新增 `settings.section` 通道；新增反皮肤隔离层；修正 `normalize()` 字段链导致列表为 0 的 bug。
- **0.1.0** —— 初始版本：侧栏面板 + 中文词典 + 内置快照。

## 许可

[MIT](LICENSE) © 2026 OASCW

可自由使用、修改、分发与商用，唯一要求是保留版权声明与许可证全文。
