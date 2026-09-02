# dsh-ops-console

> Mac 留在桌边，手机或另一台电脑也能安全打开 DeepSeek Harness。

dsh-ops-console 是一个可选的 dsh Web 插件。它帮你准备 Tailscale 远程入口、看懂当前是否就绪，并在本机生成可以直接扫描的访问二维码。

[在 npm 查看 dsh-ops-console](https://www.npmjs.com/package/dsh-ops-console)

## 它解决什么问题

远程打开 Harness，真正麻烦的往往不是得到一个网址，而是回答下面几件事：Tailscale 到底有没有连上？这个地址是否已经被 Harness 接受？关掉入口会不会误伤其他服务？

dsh-ops 把这些判断整理成一个页面和几个明确动作：

- **准备入口**：只为 Harness 创建 Tailscale Serve，不覆盖同一台 Mac 上的其他服务。
- **看懂状态**：分别显示 Tailscale、远程入口和访问地址是否就绪，并给出下一步。
- **扫码打开**：入口就绪后直接显示本地生成的二维码，用手机扫一扫即可打开 Harness。
- **清楚边界**：明确告诉你访问权限由 Tailscale 账号、设备和 ACL 管理，不额外制造一套容易误解的确认码。
- **守住本机权限**：开启入口、修改地址和关闭入口，只能在 Mac 本机完成。

dsh-ops 有意不做引擎管理：它不会安装、更新、重启或恢复 Harness，也不读取余额、日志、API Key、提示词或会话正文。这些本机能力由 [dsh-desktop](https://github.com/wendyltan/dsh-desktop) 负责。

## 3 分钟开始使用

开始前，请确认这台 Mac 已经有可正常使用的 dsh Web profile、Node.js 18 或更高版本，并已安装和登录 Tailscale。

### 1. 安装插件

推荐从 npm 安装：

```bash
dsh plugin --profile web add dsh-ops-console
```

也可以安装 GitHub 版本：

```bash
dsh plugin --profile web add github:wendyltan/dsh-ops-console
```

本地开发时，也可以直接安装源码目录：

```bash
dsh plugin --profile web add /path/to/dsh-ops-console
```

安装后重新打开 dsh Web，进入“设置 → 远程访问”。

### 2. 在 Mac 上准备远程入口

点击“设置远程访问”。dsh-ops 会为 Harness 创建 Tailscale Serve 入口，并把当前 tailnet 域名加入 Harness 接受的访问地址。

如果 HTTPS 根地址已经被其他服务使用，操作会停止并说明冲突，不会直接覆盖。页面提示“地址等待生效”时，重新打开 Harness 即可；下次加载后，dsh-ops 会再次确认地址是否已经生效。

### 3. 扫码打开

入口就绪后，页面会直接显示二维码和 HTTPS 地址。在已经登录获准 Tailscale 账号的手机或电脑上扫码，或者复制地址打开即可。

实际哪些用户和设备可以访问，由 Tailscale ACL 决定；dsh-ops 不会绕过或替代这层权限。二维码由插件在这台 Mac 上本地生成，只包含远程 HTTPS 地址，也不会把地址发送给第三方二维码服务。

## 谁能做什么

| 能力 | Mac 本机 | Tailscale 远程设备 |
| --- | --- | --- |
| 查看入口状态和复制地址 | 可以 | 可以 |
| 开启或关闭远程入口 | 可以 | 不可以 |
| 增删 Harness 接受的地址 | 可以 | 不可以 |
| 更新、重启、恢复引擎 | 不属于 dsh-ops | 不属于 dsh-ops |

关闭远程访问时，dsh-ops 只移除 Harness 自己的 Serve 入口，不执行全局 `tailscale serve reset`，因此不会删除其他 Tailscale Serve 配置。

如果设备丢失，应在 Tailscale 中撤销该设备或调整 ACL。若要关闭 Harness 的远程入口，可以在 Mac 本机展开“更多访问设置”操作；它不会修改 Tailscale ACL，也不会影响其他应用的 Serve 入口。

## 页面上的状态是什么意思

| 页面状态 | 发生了什么 | 你可以怎么做 |
| --- | --- | --- |
| Tailscale 未连接 | 应用未运行、未登录或当前离线 | 在 Mac 上打开并登录 Tailscale |
| 入口未创建 | 还没有为 Harness 配置 Serve | 在 Mac 本机点击“设置远程访问” |
| 地址等待生效 | 配置已保存，Harness 仍在使用启动时的地址 | 重新打开 Harness |
| 远程入口已开启 | Mac 端的三项配置已经就绪 | 扫码或复制地址，在另一台设备打开 |

“检测连接”会从 Mac 本机访问远程 HTTPS 地址。它可以证明本机端配置完成，但不能代替你在手机或另一台电脑上的真实打开测试。

## 安全和隐私

- 入口和可信地址的写入操作同时要求同源请求、Mac 本机访问和本机管理令牌。
- 访问资格由 Tailscale 账号、设备和 ACL 管理；插件不提供一套含义重叠的二次确认码。
- 访问二维码由本机的 MIT 许可编码器生成，不调用外部二维码接口，只编码远程 HTTPS 地址。
- 公共健康接口只返回插件可用性和版本，不公开 PID、端口、引擎版本或本机路径。
- 可信地址写入前最多保留五份配置备份，并采用同步落盘和原子替换。
- 关闭入口同时要求同源请求、本机访问和本机管理令牌，远程设备不能触发。

## 开发与发布

运行完整验证：

```bash
npm test
```

验证会覆盖语法、权限边界、路由契约、客户端交互文本，以及一次临时 dsh Web 启动。

仓库维护者或本机开发者验证通过后，可以部署到受保护的本机开发环境：

```bash
node scripts/deploy.mjs
```

普通用户不需要运行部署脚本，直接从 npm 安装即可。发布新版本前，可用 `npm pack --dry-run` 检查实际入包文件；仓库也提供 GitHub Trusted Publishing 工作流，需先在 npm 包设置中配置可信发布者。

## 许可

[MIT](LICENSE)
