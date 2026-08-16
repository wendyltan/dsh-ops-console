# dsh-ops-console

> DeepSeek Harness 的**服务器运营控制台**插件：在网页「设置」里增加一个「运维控制台」入口，把余额、服务器、远程访问等运维能力聚合到一个面板。手机经 Tailscale 访问也能用。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 功能

| Tab | 内容 |
| --- | --- |
| **概览** | DeepSeek 账户余额（赠金/充值/已用，**低于预警阈值时黄色徽章提示**，可按设置自动刷新）+ 官方充值/用量入口；Harness 引擎版本（**自动探测运行中的 dsh 包版本**）与 npm 最新版对比 |
| **服务器** | 服务状态（地址 / PID / 运行时长 / 引擎版本）、一键重启、最近日志（条数可配置，**实时跟尾**开关，3 秒轮询） |
| **远程访问** | Tailscale `serve :3080` 开关、tailnet 域名与访问地址、**可信主机编辑**（`connection.trustedHosts` 增删 + 暴露面审计：当前 tailnet 域名是否在信任名单里、一键加入、保存后重启生效） |
| **设置** | 余额自动刷新间隔（秒，0=关闭）、余额预警阈值（元）、日志条数，持久化到 profile 的 `.dsh-ops.json` |

> 界面**中/英双语**（右上角切换，记住选择）。Agent 的模型 / 预设 / 权限等配置仍在 Harness 网页原生的「设置」里；本插件只管**运维面**。

> 额外：注册了 **5 个 Agent 自运维工具**（`ops_status` / `ops_balance` / `ops_logs` / `ops_tailscale` / `ops_restart`），模型可以自己查状态、余额、日志，甚至自愈重启。

> Agent 的模型 / 预设 / 权限等配置仍在 Harness 网页原生的「设置」里；本插件只管**运维面**。

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

> ⚠️ 无论哪种方式，**安装后都要重启 `dsh web`** 才会加载新 bundle。

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
2. 概览 Tab 看余额（低于预警阈值会黄标）与版本；服务器 Tab 看状态/日志（勾选「实时跟尾」自动滚动）、一键重启；设置 Tab 调整自动刷新间隔、预警阈值、日志条数
3. 远程访问 Tab 开/关 Tailscale；可信主机卡片可增删主机：输入 `host` 或 `host:port` 添加（服务端校验裸 authority），删除按钮移除；修改保存在 `cordis.patch.yml`，点「立即重启」让浏览器信任围栏加载新名单
4. 手机在 tailnet 内打开 `https://<你的mac>.<tailnet>.ts.net`，同一面板可直接操作

## 架构

- **Host**（`lib/index.js`）：在 `webServer` 服务上挂 `/dsh-ops/*` HTTP 路由，用 Node 内建 `fetch` / `fs` / `child_process` 完成余额、版本、日志、Tailscale、可信主机、设置持久化与自重启（重放原始 `dsh` 启动命令，不依赖任何桌面客户端）；可选注入 `credentials`（余额 Key 多来源）与 `tools`（注册 5 个 `ops_*` 自运维工具，注册失败不影响其余功能）。
- **Client**（`lib/client.js`）：注册 `settings.section` 设置页入口，四个 Tab（概览/服务器/远程访问/设置）通过 `fetch("/dsh-ops/…")` 调 Host；内置中英 i18n，host 消息通过 `msgKey`/`msgParams` 翻译（未知键回退原文）。

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
# 本地挂载验证：dsh plugin --profile web add "$PWD"
```

## 许可

[MIT](LICENSE)。独立第三方项目，与 DeepSeek 官方无隶属关系。
