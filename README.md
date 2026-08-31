# dsh-ops-console

> DeepSeek Harness 的可选远程访问插件：通过 Tailscale 安全准备访问入口，并从 Mac 本机确认远程设备是否真正连通。

公开发布版本：[npm 上的 dsh-ops-console](https://www.npmjs.com/package/dsh-ops-console)

## 它能做什么

当你想从手机或另一台电脑打开 DeepSeek Harness 时，dsh-ops 把远程入口整理成几个清楚的动作：

1. **准备远程入口**：只管理 Harness 自己的 Tailscale Serve，不覆盖其他服务。
2. **显示真实状态**：分别显示 Tailscale、远程入口和访问地址是否就绪。
3. **确认远程连接**：Mac 生成一次性六位确认码，另一台设备输入后留下可识别的连接记录。
4. **安全修改地址**：可信地址只允许在 Mac 本机增删，保存后明确提示是否需要重新打开 Harness。

dsh-ops 不安装、更新、重启或恢复 dsh 引擎，也不提供余额、日志或故障诊断。这些本机能力由 [dsh-desktop](https://github.com/wendyltan/dsh-desktop) 负责。

## 3 分钟开始使用

### 1. 安装插件

前置条件：已安装并配置可以正常使用的 dsh Web profile、Node.js 18 或更高版本，并已安装和登录 Tailscale。

推荐从 npm 安装：

    dsh plugin --profile web add dsh-ops-console

也可以直接从 GitHub 安装：

    dsh plugin --profile web add github:wendyltan/dsh-ops-console

也可以安装本地源码目录：

    dsh plugin --profile web add /path/to/dsh-ops-console

安装后重新打开 dsh web，然后进入 **设置 → 远程访问**。

### 2. 设置远程访问

在 Mac 本机点击“设置远程访问”。dsh-ops 会：

- 创建指向 Harness 的 Tailscale Serve 入口；
- 把本机 tailnet 域名加入 Harness 接受的访问地址；
- 遇到 HTTPS 根地址冲突时停止操作，不覆盖已有服务。

如果页面提示“地址等待生效”，请重新打开 Harness。dsh-ops 会在下一次加载时自动确认地址是否已经生效。

### 3. 在另一台设备打开

复制页面显示的 HTTPS 地址，在已登录同一 Tailnet 的手机或电脑上打开。Tailscale ACL 决定哪些用户和设备可以访问；dsh-ops 不会绕过或替代 Tailscale 权限。

### 4. 确认远程设备

1. 在 Mac 本机生成一次性确认码。
2. 在另一台设备输入设备名称和六位确认码。
3. Mac 会显示该设备最近一次确认时间和记录保留期限。

确认码只可使用一次，5 分钟后失效。忘记确认记录不会修改 Tailscale ACL，也不会代替在 Tailscale 中撤销设备权限。

## 权限与产品边界

| 能力 | Mac 本机 | 已确认的远程设备 |
| --- | --- | --- |
| 查看入口状态和复制地址 | 可以 | 可以 |
| 确认当前设备连接 | 无需 | 可以 |
| 开启或关闭远程入口 | 可以 | 不可以 |
| 增删 Harness 接受的地址 | 可以 | 不可以 |
| 查看或清除设备确认记录 | 可以 | 不可以 |
| 更新、重启、恢复引擎 | 不属于 dsh-ops | 不属于 dsh-ops |

关闭远程访问只移除 Harness 自己的 Serve 入口，不执行全局 `tailscale serve reset`，也不会删除其他 Tailscale Serve 配置。

## 常见状态

| 页面状态 | 含义 | 下一步 |
| --- | --- | --- |
| Tailscale 未连接 | 应用未运行、未登录或当前离线 | 在 Mac 上打开并登录 Tailscale |
| 入口未创建 | 尚未为 Harness 配置 Serve | 在 Mac 本机点击“设置远程访问” |
| 地址等待生效 | 配置已保存，但 Harness 仍在使用启动时配置 | 重新打开 Harness |
| 远程入口已开启 | 本机三项配置已经就绪 | 在另一台设备打开地址并完成确认 |

“确认远程可用”会从 Mac 本机访问远程 HTTPS 地址。它证明本机配置已经完成，但最终仍应在另一台设备上实际打开一次。

## 隐私与安全设计

- 所有入口和可信地址写入操作同时要求同源请求、Mac 本机访问和本机管理令牌。
- 远程确认使用独立、可忘记、最长保留 90 天的会话记录；服务端只保存令牌哈希。
- 配对失败按 Tailscale 身份或请求来源分别限流，不会让一台输错设备阻止其他设备确认。
- 不读取 API 密钥、提示词、会话正文、余额或日志。
- 公共健康接口只返回插件可用性和版本，不公开 PID、端口、引擎版本或本机路径。
- 可信地址写入前最多保留五份配置备份，并使用同步落盘和原子替换。

## 开发与验证

运行完整验证：

    npm test

验证包括语法、权限边界、路由契约、客户端交互文本和一次临时 dsh web 启动。仓库维护者或本机开发者验证通过后，可部署到受 Guardian 管理的本机开发环境：

    node scripts/deploy.mjs

发布新版本前可使用 `npm pack --dry-run` 检查实际入包文件。仓库提供 GitHub Trusted Publishing 工作流；在 npm 包设置中将该仓库和 workflow 配置为可信发布者后，才可用于后续版本的自动发布。普通用户无需运行部署脚本，直接从 npm 安装即可。

## 许可

[MIT](LICENSE)
