# dsh-ops-console

> DeepSeek Harness 的 Web/手机运维控制台：在网页“设置”中集中管理服务器、余额、日志、Tailscale 远程与可信主机，并通过 dsh-desktop Guardian 执行经过预检、可恢复的安全操作。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 为什么值得用

- **手机也能掌握运行状态**：通过 Tailscale HTTPS 从浏览器查看服务、余额、版本、日志和 Guardian 防护状态，不必远程登录 Mac 或打开终端。
- **重启前先证明“新配置能启动”**：安装 [dsh-desktop](https://github.com/wendyltan/dsh-desktop) 后，完整预检会在隔离环境加载 profile、依赖和全部 client bundle；通过后才允许正式重启。
- **出错可恢复，不执行危险降级**：支持 last-known-good 黄金版本和部署备份；Guardian 不可用时安全操作会明确禁用并返回错误，绝不会偷偷退化成裸重启。
- **远程访问一处配置**：管理 Tailscale Serve、tailnet 地址与 `connection.trustedHosts`，同时审计当前远程域名是否已进入浏览器信任围栏。
- **Agent 可以自助排障**：注册 6 个结构化 `ops_*` 工具，让 Harness Agent 查询状态、余额、日志和远程连接，并在保护链可用时执行预检或安全重启。
- **插件故障不拖垮正式服务**：仓库开发、候选验证、内部快照、原子部署和回滚彼此隔离，适合频繁迭代运维插件。

## 两个项目如何配合

| 项目 | 负责什么 | 依赖关系 |
| --- | --- | --- |
| **[dsh-ops-console](https://github.com/wendyltan/dsh-ops-console)** | Harness Web 内的运维界面、HTTP 路由、远程管理与 Agent 自运维工具 | 可独立安装 |
| **[dsh-desktop](https://github.com/wendyltan/dsh-desktop)** | macOS 原生客户端，以及进程外 Guardian、安全启动、自动恢复和原生服务保护面板 | 启用增强保护能力 |

dsh-ops-console 本身不是 dsh-desktop 的强制插件，dsh-desktop 也不依赖本插件启动：

- **只装 dsh-ops-console**：余额、日志、版本、设置、Tailscale 和可信主机功能可用；Guardian 相关按钮显示不可用。
- **只装 dsh-desktop**：Guardian 会在后台完整保护 `dsh web`，并可通过原生面板或 `dshctl` 操作。
- **两者一起安装**：网页和手机端获得同一套 Guardian 状态、完整预检、安全重启和黄金版本恢复能力。

Guardian 的唯一源码和安装生命周期属于 dsh-desktop；本插件只读取稳定 JSON 协议，不复制 Guardian 实现。

## 功能一览

| Tab | 内容 |
| --- | --- |
| **概览** | DeepSeek 账户余额（赠金/充值/已用，**低于预警阈值时黄色徽章提示**，可按设置自动刷新）+ 官方充值/用量入口；Harness 引擎版本（**自动探测运行中的 dsh 包版本**）与 npm 最新版对比 |
| **服务器** | 服务状态、外部 Guardian 版本/协议与防护模式、黄金快照/部署备份数量、完整预检、安全重启、黄金版本恢复、最近日志 |
| **远程访问** | Tailscale `serve :3080` 开关、tailnet 域名与访问地址、**可信主机编辑**（`connection.trustedHosts` 增删 + 暴露面审计：当前 tailnet 域名是否在信任名单里、一键加入、保存后重启生效） |
| **设置** | 余额自动刷新间隔（秒，0=关闭）、余额预警阈值（元）、日志条数，持久化到 profile 的 `.dsh-ops.json` |

界面支持**中/英双语**并记住选择。插件另注册 `ops_status`、`ops_balance`、`ops_logs`、`ops_tailscale`、`ops_preflight`、`ops_restart` 六个 Agent 工具；所有工具 schema 都是显式的 object JSON Schema。Agent 的模型、预设和权限仍由 Harness 原生设置管理，本插件只负责运维面。

## 安装

### 前置条件

- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh web`，Node ≥ 18）
- （可选）余额功能：配置 `DEEPSEEK_API_KEY`（优先读 DSH 的 `credentials` 服务——env / `.credentials.yaml` / 项目与用户 `.env` 均可；未组合该服务时回退直读 `~/.dsh/.credentials.yaml`）
- （可选）远程访问：机器上已安装并登录 [Tailscale](https://tailscale.com)

### 方式一：从 npm 安装（发布后）

```sh
dsh plugin --profile web add dsh-ops-console
```

### 方式二：从 GitHub 安装（无需发布，立即可用）

```sh
dsh plugin --profile web add github:wendyltan/dsh-ops-console
```

### 方式三：从本地目录安装（开发 / 二次开发）

```sh
dsh plugin --profile web add /path/to/dsh-ops-console
```

### 方式四：手动安装（完全掌控）

`dsh plugin add` 本质是在 profile 里加依赖 + 挂 bundle。手动等价操作：

1. 编辑 `~/.dsh/profiles/web/package.json`：

   ```json
   {
     "dependencies": {
       "dsh-ops-console": "github:wendyltan/dsh-ops-console"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "dsh-ops-console"
         ]
       }
     }
   }
   ```

2. 安装并重启：

   ```sh
   cd ~/.dsh/profiles/web && pnpm install
   # 重启 dsh web 使新 bundle 生效
   ```

> ⚠️ 安装后要重启 `dsh web` 才会加载新 bundle。已安装 dsh-desktop 时，优先使用“服务保护 → 安全重启”或 `dshctl guardian restart`；没有 Guardian 时请使用当前环境原有的服务管理方式。

### 卸载

```sh
dsh plugin --profile web remove dsh-ops-console
```

（或从 `package.json` 里删掉依赖与 bundle 项，再 `pnpm install`，最后重启。）

## 配置

| 项 | 位置 | 说明 |
| --- | --- | --- |
| DeepSeek API Key | DSH `credentials` 服务（env / `.credentials.yaml` / 项目与用户 `.env`）优先，回退 `~/.dsh/.credentials.yaml` | 只用于余额查询，不落盘、不打印；缺失时其余功能不受影响 |
| 日志文件 | 默认 `~/.dsh/logs/dsh-web.log` | 可用环境变量 `DSH_OPS_LOG` 覆盖 |
| 引擎版本 | **自动探测**运行中的 dsh 包版本 | 可用环境变量 `DSH_OPS_ENGINE` 覆盖（固定版本启动时用）；两者都拿不到才回退内置常量 |
| 可信主机 | profile 的 `cordis.patch.yml` | 远程 Tab 增删 `connection.trustedHosts`（含裸 authority 校验），**重启服务后生效** |
| 控制台设置 | profile 的 `.dsh-ops.json` | 设置 Tab 保存刷新间隔 / 预警阈值 / 日志条数 |

## 使用

1. 打开 `dsh web` → **设置 → 运维控制台**（右上角可切 中/EN）
2. 概览 Tab 看余额（低于预警阈值会黄标）与版本；服务器 Tab 看状态、Guardian、预检与日志（勾选“实时跟尾”自动滚动）；设置 Tab 调整自动刷新间隔、预警阈值和日志条数
3. 远程访问 Tab 开/关 Tailscale；可信主机卡片可增删主机：输入 `host` 或 `host:port` 添加（服务端校验裸 authority），删除按钮移除；修改保存在 `cordis.patch.yml`，点「立即重启」让浏览器信任围栏加载新名单
4. 手机在 tailnet 内打开 `https://<你的mac>.<tailnet>.ts.net`，同一面板可直接操作

## 架构

- **Host**（`lib/index.js`）：在 `webServer` 服务上挂 `/dsh-ops/*` HTTP 路由，除余额、版本、日志、Tailscale、可信主机与设置外，还代理外部 Guardian 的状态、完整预检、安全重启和黄金版本恢复；可选注入 `credentials` 与 `tools`（注册 6 个 `ops_*` 工具）。Guardian 缺失时查询会明确降级，插件本身仍可加载，保护类写操作返回 503。
- **Client**（`lib/client.js`）：注册 `settings.section` 设置页入口，四个 Tab（概览/服务器/远程访问/设置）通过 `fetch("/dsh-ops/…")` 调 Host；内置中英 i18n，host 消息通过 `msgKey`/`msgParams` 翻译（未知键回退原文）。
- **Guardian 边界**：插件通过 `package.json` 的 `dsh.guardian` 元数据声明健康端点和快照需求；desktop Guardian 不保存插件名、仓库路径或 `/dsh-ops/*` 常量。运行时仅接受已声明能力且协议版本兼容的 Guardian。

**零运行时 npm 依赖**（只依赖 `webServer` 等 ctx 服务，不 import 任何 `@deepseek-ai/*` 包），`lib/` 下是纯 JS，无构建步骤，改完即生效。

## 安全说明

- 写操作（重启、远程开关、可信主机增删、设置保存）要求**同源 POST**，防止跨站请求伪造。
- 余额读取本地凭据，接口响应不返回任何密钥。
- 可信主机增删带服务端校验（只接受裸 `host[:port]` authority），写入前先内存回读校验（round-trip），再原子落盘；不匹配即拒绝，不会破坏 `cordis.patch.yml` 其它内容。
- `ops_*` 工具等同本地 shell 权限（能读日志、查余额、触发重启），仅注册给本机 Harness 的 Agent 使用。

## 开发

```sh
git clone https://github.com/wendyltan/dsh-ops-console.git
cd dsh-ops-console
# 直接改 lib/index.js（Host）或 lib/client.js（Client），无需构建
```

### 安全开发流程（防止改崩线上服务）

线上 profile 不再链接仓库或外接盘，而是链接内置盘 `~/.dsh/deployments/dsh-ops-console/current`。仓库修改、外接盘挂载时序和正式服务完全隔离：

1. **改**：只改仓库里的 `lib/`。线上服务只读内置盘 `current/` 快照，改到一半或外接盘未挂载都不会影响线上。
2. **验证**：`node scripts/verify.mjs` —— 四道关卡，前三道不碰任何 profile，第四道在仓库内 `.smoke-dsh/` 起一个临时 dsh web 端到端测 `/dsh-ops/*`：
   - gate 1：`node --check` 两个 lib 文件（抓语法错误）
   - gate 2：桩加载 `lib/client.js`（抓浏览器 bundle 格式的加载期崩溃）
   - gate 3：mock ctx 调 `apply()`，断言 6 个 `ops_*` 工具注册、object schema 合法、`/dsh-ops/status` 正常、跨站 POST 被拒绝，以及 Guardian 缺失时不会裸重启
   - gate 4：临时 dsh web 明确加载仓库候选源码（不是线上快照），逐条验证 ops/Guardian 路由
   - 任一失败 → 退出码非 0，禁止部署。
3. **部署**：`node scripts/deploy.mjs`。候选通过后原子写入内置盘 `current/`，旧版移入 `backups/`（保留 8 份），再由 Guardian 对完整 profile 做第二次隔离冒烟；失败自动撤销。
4. **重启生效**：`node ~/.dsh/guardian/guardian.mjs restart --json`。正式进程只会在预检通过后停止。
5. **回滚**：`node scripts/rollback.mjs` 恢复最新内部备份并再次预检；也可从控制台恢复 Guardian 的 last-known-good 黄金快照。

> Guardian、watchdog 和安全模式运行在 DSH 进程之外。即使 profile 或插件导致 DSH 无法启动，外部恢复链仍然可用。

> `scripts/deploy.mjs` 是本机的增强安全部署流程，因此要求 dsh-desktop Guardian 已安装；普通用户仍可通过 npm、GitHub 或插件市场独立安装本插件。

## 许可

[MIT](LICENSE)。独立第三方项目，与 DeepSeek 官方无隶属关系。
