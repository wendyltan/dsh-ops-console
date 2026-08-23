# dsh-ops-console

> DeepSeek Harness 的远程访问控制台：在浏览器或手机里开启/关闭 Tailscale 远程访问，并管理可信主机与运维令牌。

## 为什么需要它

当你想从手机或另一台电脑访问 DeepSeek Harness 时，不应该先理解端口、进程或守护进程。dsh-ops 把这些操作整理成简单动作：

1. **远程访问**：一键开启或关闭 Tailscale 远程访问地址；开启时自动把本机 tailnet 域名加入可信主机。
2. **可信主机**：从 tailnet 设备列表一键信任或移除，也可手动增删 `host` / `host:port`。
3. **自检**：开启后验证手机能否真正打开该地址，并提示还差哪一步。
4. **管理令牌**：保护远程访问设置，默认隐藏，只保存在本机文件和该浏览器。

默认界面不展示模块数、端口、进程号、原始日志、协议或其他实现细节。需要排障时再展开“高级访问设置”。

## 产品边界

| 项目 | 负责什么 |
| --- | --- |
| **dsh-ops-console** | Tailscale 远程访问开关与自检、可信主机增删、运维令牌 |
| **[dsh-desktop](https://github.com/wendyltan/dsh-desktop)** | macOS 本机打开 Harness、运行状态与故障诊断、余额、引擎更新和服务恢复 |

dsh-ops 可以独立安装和使用。它不安装、更新、重启或恢复 dsh 引擎，也不读取、控制或依赖 Guardian；运行状态、故障诊断、余额与日志不属于 dsh-ops，由 dsh-desktop 负责。即使没有桌面端，远程访问的开启、关闭与可信主机编辑仍可工作。

## 使用

打开 dsh web，在 **设置 → 远程访问** 中进入。

### 远程访问

如已安装并登录 Tailscale，可在这里准备访问地址。点「设置远程访问」会开启 Tailscale Serve，并自动把本机 tailnet 域名加入可信主机（重启服务后生效）。开启后点「自检」，dsh-ops 会从本机实际访问该地址，告诉你手机现在能否打开、还差哪一步。

远程设备更改设置时需要运维令牌：

- 首次从本机页面打开时，令牌会自动准备。
- 仅将令牌粘贴到你信任的设备。
- 令牌默认在界面中隐藏，只保存在本机文件（权限 0600）和该浏览器的本地存储中。

“可信访问地址”里会列出你 tailnet 中的设备（在线/离线），点「信任」加入、点「移除」取消，也可手动增删。“管理令牌”属于高级选项。关闭远程访问、移除可信地址采用两步内联确认（先点一次，再点「确认」），不弹系统对话框；保存可信地址后，请回到 dsh-desktop 的“当前状态”重新检查。dsh-ops 不会替你重启服务。

## 安装

前置条件：已安装 DeepSeek Harness（Node 18 或更高）。

    dsh plugin --profile web add dsh-ops-console

也可从 GitHub 或本地目录安装：

    dsh plugin --profile web add github:wendyltan/dsh-ops-console
    dsh plugin --profile web add /path/to/dsh-ops-console

安装后按你的现有方式重新打开 dsh web。

## 隐私与安全

- 所有写入操作要求同源请求和运维令牌。
- 远程地址校验只接受 `host` 或 `host:port`，避免写入无效配置。
- 不读取密钥、令牌、提示词或会话正文；余额、日志与诊断不在此项目内。
- 通过 `dsh.guardian` 声明被动健康契约（`/dsh-ops/status`），供 Guardian 在启动预检时校验插件健康，不引入运行时依赖。

## 开发与验证

    node scripts/verify.mjs

验证会检查语法、浏览器模块加载、HTTP 路由及临时 dsh web 烟雾启动。通过后可执行：

    node scripts/deploy.mjs

部署脚本只负责将经过验证的插件快照原子替换到本机部署目录；它不要求或调用 Guardian。正式服务何时重新打开由现有运行方式决定。

仓库只保留源码、验证脚本和部署脚本；本地部署快照、烟雾测试目录和构建临时文件不属于仓库内容。

## 许可

[MIT](LICENSE)。
