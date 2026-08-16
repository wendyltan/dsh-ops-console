# dsh-ops-console

> DeepSeek Harness 的**服务器运营控制台**插件：在网页「设置」里增加一个「运维控制台」入口，把余额、服务器、远程访问等运维能力聚合到一个面板。手机经 Tailscale 访问也能用。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 功能

| Tab | 内容 |
| --- | --- |
| **概览** | DeepSeek 账户余额（赠金/充值/已用）+ 官方充值/用量入口；Harness 引擎版本与 npm 最新版对比 |
| **服务器** | 服务状态（地址 / PID / 运行时长 / 引擎版本）、一键重启、最近日志流式查看 |
| **远程访问** | Tailscale `serve :3080` 开关、tailnet 域名与访问地址、可信主机（`connection.trustedHosts`）只读审计 |

> Agent 的模型 / 预设 / 权限等配置仍在 Harness 网页原生的「设置」里；本插件只管**运维面**。

## 安装

### 前置条件

- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh web`，Node ≥ 18）
- （可选）余额功能：`~/.dsh/.credentials.yaml` 里有 `DEEPSEEK_API_KEY`
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

> ⚠️ 无论哪种方式，**安装后都要重启 `dsh web`** 才会加载新 bundle。

### 卸载

```sh
dsh plugin --profile web remove dsh-ops-console
```

（或从 `package.json` 里删掉依赖与 bundle 项，再 `pnpm install`，最后重启。）

## 配置

| 项 | 位置 | 说明 |
| --- | --- | --- |
| DeepSeek API Key | `~/.dsh/.credentials.yaml` | `DEEPSEEK_API_KEY: sk-...`（只用于余额查询，不落盘、不打印；缺失时其余功能不受影响） |
| 日志文件 | 默认 `~/.dsh/logs/dsh-web.log` | 可用环境变量 `DSH_OPS_LOG` 覆盖 |
| 可信主机 | profile 的 `cordis.patch.yml` | 远程 Tab 只读展示 `connection.trustedHosts` |

## 使用

1. 打开 `dsh web` → **设置 → 运维控制台**
2. 概览 Tab 看余额与版本；服务器 Tab 看状态/日志、一键重启；远程访问 Tab 开/关 Tailscale
3. 手机在 tailnet 内打开 `https://<你的mac>.<tailnet>.ts.net`，同一面板可直接操作

## 架构

- **Host**（`lib/index.js`）：在 `webServer` 服务上挂 `/dsh-ops/*` HTTP 路由，用 Node 内建 `fetch` / `fs` / `child_process` 完成余额、版本、日志、Tailscale 与自重启（重放原始 `dsh` 启动命令，不依赖任何桌面客户端）。
- **Client**（`lib/client.js`）：注册 `settings.section` 设置页入口，三个 Tab 通过 `fetch("/dsh-ops/…")` 调 Host。

**零运行时 npm 依赖**（只有 `webServer` / `slots` 服务），`lib/` 下是纯 JS，无构建步骤，改完即生效。

## 安全说明

- 写操作（重启、远程开关）要求**同源 POST**，防止跨站请求伪造。
- 余额读取本地凭据，接口响应不返回任何密钥。
- 可信主机目前为**只读**展示，避免误改 `cordis.patch.yml` 破坏 profile。

## 开发

```sh
git clone https://github.com/wendyltan/dsh-ops-console.git
cd dsh-ops-console
# 直接改 lib/index.js（Host）或 lib/client.js（Client），无需构建
# 本地挂载验证：dsh plugin --profile web add "$PWD"
```

## 许可

[MIT](LICENSE)。独立第三方项目，与 DeepSeek 官方无隶属关系。
