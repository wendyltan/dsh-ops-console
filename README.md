# dsh-ops-console

> DeepSeek Harness 的远程访问控制台：在浏览器或手机里安全开启/关闭 Tailscale 远程访问，并管理 Harness 接受的访问地址与运维令牌。

## 为什么需要它

当你想从手机或另一台电脑访问 DeepSeek Harness 时，不应该先理解端口、进程或守护进程。dsh-ops 把这些操作整理成简单动作：

1. **远程访问**：一键开启或关闭 Harness 自己的 Tailscale 远程入口，不覆盖或清空其他 Serve 服务。
2. **访问地址**：自动把本机 tailnet 域名加入 Harness 接受的访问地址，也可手动增删 `host` / `host:port`。
3. **本机端检查**：确认 Serve、访问地址和本机反向访问是否准备完成，并明确提醒仍需用远程设备实际确认。
4. **管理令牌**：保护远程访问设置，默认隐藏，只保存在本机文件和该浏览器。

默认界面不展示模块数、端口、进程号、原始日志、协议或其他实现细节。需要排障时再展开“高级访问设置”。

## 产品边界

| 项目 | 负责什么 |
| --- | --- |
| **dsh-ops-console** | Harness 专属 Tailscale 远程入口、本机端检查、访问地址与运维令牌 |
| **[dsh-desktop](https://github.com/wendyltan/dsh-desktop)** | macOS 本机打开 Harness、运行状态与故障诊断、余额、引擎更新和服务恢复 |

dsh-ops 可以独立安装和使用。它不安装、更新、重启或恢复 dsh 引擎，也不读取、控制或依赖 Guardian；运行状态、故障诊断、余额与日志不属于 dsh-ops，由 dsh-desktop 负责。即使没有桌面端，远程访问的开启、关闭与访问地址编辑仍可工作。

## 使用

打开 dsh web，在 **设置 → 远程访问** 中进入。

### 远程访问

如已安装并登录 Tailscale，可在这里准备访问地址。点「设置远程访问」会创建指向 Harness 的 Tailscale Serve 入口，并自动把本机 tailnet 域名加入 Harness 接受的访问地址（重启服务后生效）。如果 HTTPS 根地址已被其他服务使用，dsh-ops 会停止并说明冲突，不会覆盖原配置。

开启后点「检查本机配置」，dsh-ops 会从本机访问远程地址，检查 Serve 与访问地址是否准备完成。这个结果只证明本机端配置；最终仍需在已登录同一 Tailnet 的手机或电脑上实际打开链接确认。

远程设备更改设置时需要运维令牌：

- 首次从本机页面打开时，令牌会自动准备。
- 仅将令牌粘贴到你信任的设备。
- 令牌默认在界面中隐藏，只保存在本机文件（权限 0600）和该浏览器的本地存储中。

“Harness 接受的访问地址”管理浏览器地址栏中的服务器地址，不是获准访问的手机或电脑；设备和人员权限由 Tailscale ACL 管理。“管理令牌”属于高级选项。关闭远程访问、移除地址采用两步内联确认（先点一次，再点「确认」），不弹系统对话框；保存地址后，请回到 dsh-desktop 的“当前状态”重新检查。dsh-ops 不会替你重启服务。

关闭远程访问只移除 Harness 自己的 Serve 入口，不会执行全局 `tailscale serve reset`，也不会删除这台机器上的其他 Serve 配置。

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
