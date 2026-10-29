# dsh-ops-console 协作入口

实质工作前读取 `/Volumes/ExtSSD/AGENTS.md`；外接盘不可用时读取 `/Users/wuwendi/.config/agent-workstyle/AGENTS.md`。无法访问时说明，不假装已经加载。项目规则补充全局约定；当前用户要求及适用的平台规则优先。

按任务读取 `README.md`、相关代码和项目文档，先核对 Git 状态并保留已有修改。涉及远程访问时先核对实际配置和服务状态；保留现有访问与授权边界，不擅自公开入口、修改 Tailscale 配置或重启服务。区分本地验证、真实连接与用户验收。
