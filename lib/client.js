window.__ModuleLoader__.load({ id: "dsh-ops-console", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  const React = require("react");
  const { useState, useEffect, useCallback, useRef } = React;

  const name = "dsh-ops-console";
  const inject = ["slots"];

  // ------------------------------------------------------------- i18n

  const I18N = {
    zh: {
      "tab.overview": "概览", "tab.server": "服务器", "tab.remote": "远程访问", "tab.settings": "设置",
      "balance.title": "钱包 · 余额", "balance.used": "已用（赠金+充值-余额）", "balance.granted": "赠金 / 充值",
      "balance.topup": "充值", "balance.usage": "用量明细", "balance.warn": "低于预警阈值 ¥{threshold}",
      "version.title": "引擎版本", "version.current": "当前", "version.latest": "最新",
      "version.new": "有新版本 {v}", "version.upToDate": "已是最新",
      "server.title": "服务器状态", "server.running": "运行中", "server.addr": "地址", "server.pid": "PID",
      "server.uptime": "已运行", "server.engine": "引擎", "server.restartTitle": "重启服务",
      "server.restartHint": "重启会结束当前会话，浏览器将自动重连。", "server.restart": "一键重启",
      "server.confirm": "确认重启？", "server.confirmBtn": "确认重启", "server.cancel": "取消",
      "server.restarting": "重启中…", "server.logs": "最近日志", "server.liveTail": "实时跟尾",
      "server.noLogs": "（暂无日志）",
      "remote.title": "Tailscale 远程访问", "remote.on": "已开启", "remote.off": "未开启",
      "remote.dns": "tailnet 域名", "remote.url": "访问地址", "remote.enable": "开启远程访问",
      "remote.disable": "关闭远程访问", "remote.busy": "处理中…",
      "trust.title": "可信主机 · 暴露面", "trust.curDns": "当前 tailnet 域名", "trust.trusted": "已信任",
      "trust.notTrusted": "未信任 · /api 会拒绝", "trust.addCur": "把当前域名加入可信主机",
      "trust.cur": "当前域名", "trust.remove": "删除", "trust.add": "添加", "trust.empty": "（未配置可信主机 — 仅回环地址可访问 /api）",
      "trust.hint": "修改保存在 {file}，重启服务后生效。", "trust.restartHint": "重启后新配置才会加载到信任围栏。",
      "trust.restartNow": "立即重启", "trust.placeholder": "host 或 host:port，如 mac-mini.tail.ts.net",
      "settings.title": "设置", "settings.refresh": "余额自动刷新间隔（秒，0=关闭）",
      "settings.threshold": "余额预警阈值（元）", "settings.logLines": "日志条数", "settings.save": "保存", "settings.savedHint": "设置已保存到 {file}",
      "common.loading": "加载中…", "common.refresh": "刷新", "common.check": "检查",
      "msg.restart.triggered": "已触发重启，浏览器将在数秒后重连…",
      "msg.tailscale.disabled": "远程访问已关闭", "msg.tailscale.disableFailed": "关闭失败",
      "msg.tailscale.needsAdmin": "Tailscale 后台尚未启用 Serve（HTTPS）。请先用浏览器打开下方链接，在 Tailscale 控制台点击「启用」，再回来点一次「开启」。",
      "msg.tailscale.timeout": "tailscale serve 超时，请确认 Tailscale 已登录后重试。",
      "msg.tailscale.enableFailed": "tailscale serve 失败",
      "msg.tailscale.enabled": "远程访问已开启：https://{dns}/",
      "msg.tailscale.enabledUntrusted": "Serve 已开启，但 {dns} 尚未加入可信主机（可能无法通过 /api 访问）。",
      "msg.tailscale.enabledNoDns": "Serve 已开启（未取到 Tailscale 域名）。",
      "msg.trust.duplicate": "「{host}」已在可信主机列表中。", "msg.trust.added": "已添加「{host}」，重启服务后生效。",
      "msg.trust.absent": "「{host}」不在可信主机列表中。", "msg.trust.removed": "已移除「{host}」，重启服务后生效。",
      "msg.settings.saved": "设置已保存。",
    },
    en: {
      "tab.overview": "Overview", "tab.server": "Server", "tab.remote": "Remote", "tab.settings": "Settings",
      "balance.title": "Wallet · Balance", "balance.used": "Used (granted+topup-balance)", "balance.granted": "Granted / Top-up",
      "balance.topup": "Top up", "balance.usage": "Usage details", "balance.warn": "Below warn threshold ¥{threshold}",
      "version.title": "Engine version", "version.current": "Current", "version.latest": "Latest",
      "version.new": "New version {v}", "version.upToDate": "Up to date",
      "server.title": "Server status", "server.running": "Running", "server.addr": "Address", "server.pid": "PID",
      "server.uptime": "Uptime", "server.engine": "Engine", "server.restartTitle": "Restart server",
      "server.restartHint": "Restart ends the current session; the browser reconnects automatically.", "server.restart": "Restart",
      "server.confirm": "Confirm restart?", "server.confirmBtn": "Confirm", "server.cancel": "Cancel",
      "server.restarting": "Restarting…", "server.logs": "Recent logs", "server.liveTail": "Live tail",
      "server.noLogs": "(no logs)",
      "remote.title": "Tailscale remote access", "remote.on": "On", "remote.off": "Off",
      "remote.dns": "tailnet DNS", "remote.url": "Access URL", "remote.enable": "Enable remote access",
      "remote.disable": "Disable remote access", "remote.busy": "Working…",
      "trust.title": "Trusted hosts · exposure", "trust.curDns": "Current tailnet DNS", "trust.trusted": "Trusted",
      "trust.notTrusted": "Not trusted — /api will reject", "trust.addCur": "Trust current DNS",
      "trust.cur": "current DNS", "trust.remove": "Remove", "trust.add": "Add", "trust.empty": "(No trusted hosts — only loopback can reach /api)",
      "trust.hint": "Changes saved to {file}, effective after restart.", "trust.restartHint": "New config loads into the trust fence after restart.",
      "trust.restartNow": "Restart now", "trust.placeholder": "host or host:port, e.g. mac-mini.tail.ts.net",
      "settings.title": "Settings", "settings.refresh": "Balance auto-refresh interval (s, 0=off)",
      "settings.threshold": "Balance warn threshold (CNY)", "settings.logLines": "Log lines", "settings.save": "Save", "settings.savedHint": "Settings saved to {file}",
      "common.loading": "Loading…", "common.refresh": "Refresh", "common.check": "Check",
      "msg.restart.triggered": "Restart triggered; the browser will reconnect in a few seconds…",
      "msg.tailscale.disabled": "Remote access disabled", "msg.tailscale.disableFailed": "Failed to disable",
      "msg.tailscale.needsAdmin": "Tailscale serve (HTTPS) is not enabled yet. Open the link below, click Enable in the Tailscale console, then press Enable again.",
      "msg.tailscale.timeout": "tailscale serve timed out — make sure Tailscale is logged in and retry.",
      "msg.tailscale.enableFailed": "tailscale serve failed",
      "msg.tailscale.enabled": "Remote access enabled: https://{dns}/",
      "msg.tailscale.enabledUntrusted": "Serve is on, but {dns} is not yet a trusted host (may not reach /api).",
      "msg.tailscale.enabledNoDns": "Serve is on (could not resolve the Tailscale DNS name).",
      "msg.trust.duplicate": "“{host}” is already in the trusted-hosts list.", "msg.trust.added": "Added “{host}”; effective after restart.",
      "msg.trust.absent": "“{host}” is not in the trusted-hosts list.", "msg.trust.removed": "Removed “{host}”; effective after restart.",
      "msg.settings.saved": "Settings saved.",
    },
  };

  let currentLang = "zh";
  function t(key, params) {
    let s = I18N[currentLang]?.[key];
    if (s === undefined) s = I18N.zh[key];
    if (s === undefined) return undefined;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll("{" + k + "}", String(v));
    return s;
  }
  /** Translate a host message via its msgKey/msgParams, falling back to the raw message. */
  function msgText(r) {
    if (!r) return null;
    const translated = r.msgKey ? t("msg." + r.msgKey, r.msgParams) : undefined;
    return translated ?? r.message ?? r.error ?? null;
  }

  // ------------------------------------------------------------- styles

  const CSS = `
    .dshops-root { display: flex; flex-direction: column; gap: 16px; }
    .dshops-tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--dsw-color-border, rgba(0,0,0,0.12)); padding-bottom: 8px; align-items: center; }
    .dshops-tab { border: none; background: transparent; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; color: var(--dsw-color-text-muted, #666); }
    .dshops-tab.active { background: var(--dsw-color-primary, #1a73e8); color: #fff; }
    .dshops-tabs .dshops-lang { margin-left: auto; display: flex; gap: 4px; }
    .dshops-lang button { border: 1px solid var(--dsw-color-border, rgba(0,0,0,0.2)); background: transparent; padding: 2px 8px; border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--dsw-color-text-muted, #666); }
    .dshops-lang button.active { background: var(--dsw-color-primary, #1a73e8); color: #fff; border-color: transparent; }
    .dshops-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
    .dshops-card { border: 1px solid var(--dsw-color-border, rgba(0,0,0,0.12)); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .dshops-card h3 { margin: 0; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; }
    .dshops-big { font-size: 26px; font-weight: 700; }
    .dshops-muted { color: var(--dsw-color-text-muted, #666); font-size: 12px; }
    .dshops-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; }
    .dshops-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
    .dshops-badge.ok { background: rgba(52,168,83,0.15); color: #34a853; }
    .dshops-badge.warn { background: rgba(251,188,4,0.18); color: #b8860b; }
    .dshops-badge.bad { background: rgba(234,67,53,0.15); color: #ea4335; }
    .dshops-btn { border: 1px solid var(--dsw-color-border, rgba(0,0,0,0.2)); background: transparent; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; }
    .dshops-btn.primary { background: var(--dsw-color-primary, #1a73e8); color: #fff; border-color: transparent; }
    .dshops-btn.danger { color: #ea4335; border-color: rgba(234,67,53,0.5); }
    .dshops-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .dshops-input { border: 1px solid var(--dsw-color-border, rgba(0,0,0,0.2)); background: transparent; padding: 6px 10px; border-radius: 8px; font-size: 13px; flex: 1; min-width: 0; color: inherit; }
    .dshops-tiny { padding: 2px 8px; font-size: 12px; }
    .dshops-num { width: 90px; }
    .dshops-log { background: #0f1115; color: #d4d7dd; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; padding: 12px; border-radius: 10px; max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
    .dshops-error { color: #ea4335; font-size: 13px; }
    .dshops-link { color: var(--dsw-color-primary, #1a73e8); text-decoration: none; font-size: 13px; }
    .dshops-spin { opacity: 0.5; }
  `;

  // ------------------------------------------------------------- api

  async function api(path, opts = {}) {
    const res = await fetch(path, { cache: "no-store", ...opts });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: text.slice(0, 200) }; }
    if (!res.ok) data.error = data.error || ("HTTP " + res.status);
    return data;
  }

  function post(path) {
    return api(path, { method: "POST", headers: { "content-type": "application/json" } });
  }

  function postJson(path, body) {
    return api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  // ------------------------------------------------------------- hooks

  function useApi(path, deps = []) {
    const [state, setState] = useState({ loading: true, data: null, error: null });
    const reload = useCallback(() => {
      let alive = true;
      setState((s) => ({ ...s, loading: true, error: null }));
      api(path)
        .then((d) => alive && setState({ loading: false, data: d, error: d?.error || null }))
        .catch((e) => alive && setState({ loading: false, data: null, error: String(e) }));
      return () => { alive = false; };
    }, [path]);
    useEffect(() => {
      const off = reload();
      return off;
    }, [reload, ...deps]);
    return { ...state, reload };
  }

  /** Poll `reload` every `intervalMs` while enabled. */
  function useInterval(reload, intervalMs, enabled) {
    useEffect(() => {
      if (!enabled || !intervalMs || intervalMs <= 0) return undefined;
      const id = setInterval(() => reload(), intervalMs);
      return () => clearInterval(id);
    }, [reload, intervalMs, enabled]);
  }

  // ------------------------------------------------------------- primitives

  function el(type, props, ...children) {
    return React.createElement(type, props, ...children);
  }

  function Card({ title, right, children }) {
    return el("div", { className: "dshops-card" },
      el("h3", null, title, right),
      children,
    );
  }

  function Btn({ children, onClick, primary, danger, disabled, className }) {
    const cls = "dshops-btn" + (primary ? " primary" : "") + (danger ? " danger" : "") + (className ? " " + className : "");
    return el("button", { className: cls, onClick, disabled, type: "button" }, children);
  }

  function Badge({ tone, children }) {
    return el("span", { className: "dshops-badge " + tone }, children);
  }

  function Error({ children }) {
    return children ? el("div", { className: "dshops-error" }, String(children)) : null;
  }

  function Msg({ msg }) {
    if (!msg) return null;
    return el("div", { className: msg.ok ? "dshops-muted" : "dshops-error" }, msgText(msg));
  }

  // ------------------------------------------------------------- tabs

  function OverviewTab() {
    const balance = useApi("/dsh-ops/balance");
    const version = useApi("/dsh-ops/version");
    const settings = useApi("/dsh-ops/settings");

    const b = balance.data;
    const v = version.data;
    const s = settings.data?.settings;
    const refreshSeconds = Number(s?.refreshSeconds) || 0;
    const warnThreshold = Number(s?.warnThreshold) || 0;

    useInterval(balance.reload, refreshSeconds * 1000, refreshSeconds > 0);

    const low = b?.ok && warnThreshold > 0 && Number(b.total) < warnThreshold;

    return el("div", { className: "dshops-grid" },
      el(Card, {
        title: t("balance.title"),
        right: el(Btn, { onClick: balance.reload, disabled: balance.loading }, balance.loading ? t("common.loading") : t("common.refresh")),
      },
        balance.loading && !b ? el("div", { className: "dshops-muted" }, t("common.loading")) : null,
        Error({ children: b?.error }),
        b?.ok ? el(React.Fragment, null,
          el("div", { className: "dshops-big" }, "¥" + (Number(b.total) || 0).toFixed(2)),
          low ? el(Badge, { tone: "warn" }, t("balance.warn", { threshold: warnThreshold })) : null,
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("balance.used")),
            el("span", null, "¥" + (Number(b.used) || 0).toFixed(2)),
          ),
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("balance.granted")),
            el("span", null, "¥" + (Number(b.granted) || 0).toFixed(2) + " / ¥" + (Number(b.topped) || 0).toFixed(2)),
          ),
          el("div", { className: "dshops-row" },
            el("a", { className: "dshops-link", href: "https://platform.deepseek.com/top_up", target: "_blank", rel: "noreferrer" }, t("balance.topup")),
            el("a", { className: "dshops-link", href: "https://platform.deepseek.com/usage", target: "_blank", rel: "noreferrer" }, t("balance.usage")),
          ),
        ) : null,
      ),
      el(Card, {
        title: t("version.title"),
        right: el(Btn, { onClick: version.reload, disabled: version.loading }, t("common.check")),
      },
        version.loading && !v ? el("div", { className: "dshops-muted" }, t("common.loading")) : null,
        Error({ children: v?.error }),
        v ? el(React.Fragment, null,
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("version.current")),
            el("span", null, v.current),
          ),
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("version.latest")),
            el("span", null, v.latest ?? "—"),
          ),
          v.updateAvailable
            ? el(Badge, { tone: "warn" }, t("version.new", { v: v.latest }))
            : (v.latest ? el(Badge, { tone: "ok" }, t("version.upToDate")) : null),
        ) : null,
      ),
    );
  }

  function ServerTab() {
    const status = useApi("/dsh-ops/status");
    const settings = useApi("/dsh-ops/settings");
    const logLines = Math.max(10, Math.min(500, Number(settings.data?.settings?.logLines) || 100));
    const logs = useApi("/dsh-ops/logs?tail=" + logLines, [logLines]);
    const [restarting, setRestarting] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [live, setLive] = useState(true);
    const logRef = useRef(null);

    useInterval(logs.reload, 3000, live);

    useEffect(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logs.data]);

    const doRestart = () => {
      setRestarting(true);
      post("/dsh-ops/restart").catch(() => {}).finally(() => setTimeout(() => setRestarting(false), 8000));
    };

    const s = status.data;

    return el("div", { className: "dshops-grid" },
      el(Card, {
        title: t("server.title"),
        right: s?.up ? el(Badge, { tone: "ok" }, t("server.running")) : null,
      },
        status.loading && !s ? el("div", { className: "dshops-muted" }, t("common.loading")) : null,
        Error({ children: status.error }),
        s ? el(React.Fragment, null,
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, t("server.addr")), el("span", null, s.url)),
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, t("server.pid")), el("span", null, String(s.pid))),
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, t("server.uptime")), el("span", null, fmtUptime(s.uptime))),
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, t("server.engine")), el("span", null, s.engine)),
        ) : null,
      ),
      el(Card, {
        title: t("server.restartTitle"),
      },
        el("div", { className: "dshops-muted" }, t("server.restartHint")),
        !confirm
          ? el(Btn, { danger: true, onClick: () => setConfirm(true) }, t("server.restart"))
          : el("div", { className: "dshops-row" },
              el("span", null, t("server.confirm")),
              el(Btn, { danger: true, disabled: restarting, onClick: doRestart }, restarting ? t("server.restarting") : t("server.confirmBtn")),
              el(Btn, { onClick: () => setConfirm(false) }, t("server.cancel")),
            ),
      ),
      el(Card, {
        title: t("server.logs"),
        right: el("div", { className: "dshops-row" },
          el("label", { className: "dshops-muted", style: { display: "flex", alignItems: "center", gap: 4 } },
            el("input", { type: "checkbox", checked: live, onChange: (e) => setLive(e.target.checked) }),
            t("server.liveTail"),
          ),
          el(Btn, { onClick: logs.reload, disabled: logs.loading }, t("common.refresh")),
        ),
      },
        logs.loading && !logs.data ? el("div", { className: "dshops-muted" }, t("common.loading")) : null,
        Error({ children: logs.error }),
        el("div", { className: "dshops-log", ref: logRef },
          (logs.data?.lines && logs.data.lines.length > 0)
            ? logs.data.lines.join("\n")
            : t("server.noLogs"),
        ),
      ),
    );
  }

  function fmtUptime(sec) {
    const s = Number(sec) || 0;
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    return m + "m " + (s % 60) + "s";
  }

  function RemoteTab() {
    const ts = useApi("/dsh-ops/tailscale");
    const trust = useApi("/dsh-ops/trust");
    const [busy, setBusy] = useState(false);
    const [tsMsg, setTsMsg] = useState(null);
    const [msg, setMsg] = useState(null);
    const [newHost, setNewHost] = useState("");

    const d = ts.data;
    const td = trust.data;
    const hosts = Array.isArray(td?.hosts) ? td.hosts : [];

    const actTs = (path) => {
      setBusy(true);
      setTsMsg(null);
      post(path)
        .then((r) => setTsMsg(r))
        .catch((e) => setTsMsg({ ok: false, message: String(e) }))
        .finally(() => { setBusy(false); ts.reload(); trust.reload(); });
    };

    const actTrust = (path, body) => {
      setBusy(true);
      setMsg(null);
      postJson(path, body)
        .then((r) => setMsg(r))
        .catch((e) => setMsg({ ok: false, message: String(e) }))
        .finally(() => { setBusy(false); trust.reload(); ts.reload(); });
    };

    const addHost = () => {
      const h = newHost.trim();
      if (!h) return;
      setNewHost("");
      actTrust("/dsh-ops/trust/add", { host: h });
    };

    const removeHost = (h) => actTrust("/dsh-ops/trust/remove", { host: h });

    const restart = () => {
      setBusy(true);
      setMsg(null);
      post("/dsh-ops/restart")
        .then((r) => setMsg(r))
        .catch((e) => setMsg({ ok: false, message: String(e) }))
        .finally(() => setTimeout(() => { setBusy(false); }, 8000));
    };

    return el("div", { className: "dshops-grid" },
      el(Card, {
        title: t("remote.title"),
        right: d?.serveActive ? el(Badge, { tone: "ok" }, t("remote.on")) : el(Badge, { tone: "bad" }, t("remote.off")),
      },
        ts.loading && !d ? el("div", { className: "dshops-muted" }, t("common.loading")) : null,
        Error({ children: ts.error }),
        d ? el(React.Fragment, null,
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, t("remote.dns")), el("span", null, d.dnsName || "—")),
          d.dnsName ? el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("remote.url")),
            el("a", { className: "dshops-link", href: "https://" + d.dnsName + "/", target: "_blank", rel: "noreferrer" }, "https://" + d.dnsName + "/"),
          ) : null,
          d.serveActive
            ? el(Btn, { danger: true, disabled: busy, onClick: () => actTs("/dsh-ops/tailscale/disable") }, busy ? t("remote.busy") : t("remote.disable"))
            : el(Btn, { primary: true, disabled: busy, onClick: () => actTs("/dsh-ops/tailscale/enable") }, busy ? t("remote.busy") : t("remote.enable")),
          el(Msg, { msg: tsMsg }),
          tsMsg?.link ? el("a", { className: "dshops-link", href: tsMsg.link, target: "_blank", rel: "noreferrer" }, tsMsg.link) : null,
        ) : null,
      ),
      el(Card, {
        title: t("trust.title"),
        right: el(Btn, { onClick: trust.reload, disabled: trust.loading }, t("common.refresh")),
      },
        trust.loading && !td ? el("div", { className: "dshops-muted" }, t("common.loading")) : null,
        Error({ children: trust.error }),
        td ? el(React.Fragment, null,
          td.tailnetDns ? el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("trust.curDns")),
            el("span", null, td.tailnetDns, " ",
              td.tailnetTrusted
                ? el(Badge, { tone: "ok" }, t("trust.trusted"))
                : el(Badge, { tone: "warn" }, t("trust.notTrusted")),
            ),
          ) : null,
          td.tailnetDns && !td.tailnetTrusted && d?.serveActive
            ? el(Btn, { primary: true, disabled: busy, onClick: () => actTrust("/dsh-ops/trust/add", { host: td.tailnetDns }) }, busy ? t("remote.busy") : t("trust.addCur"))
            : null,
          hosts.length > 0
            ? hosts.map((h) => el("div", { key: h, className: "dshops-row" },
                el("span", null, h),
                el("span", null,
                  h === td.tailnetDns ? el(Badge, { tone: "ok" }, t("trust.cur")) : el(Badge, { tone: "ok" }, t("trust.trusted")),
                  " ",
                  el(Btn, { danger: true, className: "dshops-tiny", disabled: busy, onClick: () => removeHost(h) }, t("trust.remove")),
                ),
              ))
            : el("div", { className: "dshops-muted" }, t("trust.empty")),
          el("div", { className: "dshops-row" },
            el("input", {
              className: "dshops-input",
              placeholder: t("trust.placeholder"),
              value: newHost,
              disabled: busy,
              onChange: (e) => setNewHost(e.target.value),
              onKeyDown: (e) => { if (e.key === "Enter") addHost(); },
            }),
            el(Btn, { primary: true, disabled: busy || !newHost.trim(), onClick: addHost }, busy ? t("remote.busy") : t("trust.add")),
          ),
          el("div", { className: "dshops-muted" }, t("trust.hint", { file: td.patchFile || "cordis.patch.yml" })),
          el(Msg, { msg }),
          msg?.restartRequired ? el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("trust.restartHint")),
            el(Btn, { primary: true, disabled: busy, onClick: restart }, t("trust.restartNow")),
          ) : null,
        ) : null,
      ),
    );
  }

  function SettingsTab() {
    const settings = useApi("/dsh-ops/settings");
    const [draft, setDraft] = useState(null);
    const [saved, setSaved] = useState(null);
    const [busy, setBusy] = useState(false);

    const s = settings.data?.settings;
    const file = settings.data?.file || ".dsh-ops.json";

    useEffect(() => {
      if (s && draft === null) setDraft({ ...s });
    }, [s]);

    const set = (key, value) => setDraft((d) => (d ? { ...d, [key]: value } : d));

    const save = () => {
      if (!draft) return;
      setBusy(true);
      setSaved(null);
      postJson("/dsh-ops/settings", { settings: draft })
        .then((r) => {
          setSaved(r);
          if (r?.ok && r.settings) setDraft({ ...r.settings });
          settings.reload();
        })
        .catch((e) => setSaved({ ok: false, message: String(e) }))
        .finally(() => setBusy(false));
    };

    return el("div", { className: "dshops-grid" },
      el(Card, {
        title: t("settings.title"),
        right: el(Btn, { primary: true, disabled: busy || !draft, onClick: save }, busy ? t("remote.busy") : t("settings.save")),
      },
        settings.loading && !s ? el("div", { className: "dshops-muted" }, t("common.loading")) : null,
        Error({ children: settings.error }),
        draft ? el(React.Fragment, null,
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("settings.refresh")),
            el("input", {
              className: "dshops-input dshops-num", type: "number", min: 0, max: 3600, step: 5,
              value: String(draft.refreshSeconds ?? 0),
              onChange: (e) => set("refreshSeconds", Math.max(0, Number(e.target.value) || 0)),
            }),
          ),
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("settings.threshold")),
            el("input", {
              className: "dshops-input dshops-num", type: "number", min: 0, step: 0.5,
              value: String(draft.warnThreshold ?? 10),
              onChange: (e) => set("warnThreshold", Math.max(0, Number(e.target.value) || 0)),
            }),
          ),
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, t("settings.logLines")),
            el("input", {
              className: "dshops-input dshops-num", type: "number", min: 10, max: 500, step: 10,
              value: String(draft.logLines ?? 100),
              onChange: (e) => set("logLines", Math.max(10, Math.min(500, Number(e.target.value) || 100))),
            }),
          ),
          el("div", { className: "dshops-muted" }, t("settings.savedHint", { file })),
          el(Msg, { msg: saved }),
        ) : null,
      ),
    );
  }

  function ConsoleSection() {
    const [tab, setTab] = useState("overview");
    const [lang, setLang] = useState(() => {
      currentLang = localStorage.getItem("dshops-lang") || "zh";
      return currentLang;
    });
    const changeLang = (l) => {
      currentLang = l;
      localStorage.setItem("dshops-lang", l);
      setLang(l);
    };
    const tabs = [
      { id: "overview", label: t("tab.overview") },
      { id: "server", label: t("tab.server") },
      { id: "remote", label: t("tab.remote") },
      { id: "settings", label: t("tab.settings") },
    ];
    return el("div", { className: "dshops-root" },
      el("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      el("div", { className: "dshops-tabs" },
        tabs.map((tb) => el("button", {
          key: tb.id,
          type: "button",
          className: "dshops-tab" + (tab === tb.id ? " active" : ""),
          onClick: () => setTab(tb.id),
        }, tb.label)),
        el("div", { className: "dshops-lang" },
          el("button", { type: "button", className: lang === "zh" ? "active" : "", onClick: () => changeLang("zh") }, "中"),
          el("button", { type: "button", className: lang === "en" ? "active" : "", onClick: () => changeLang("en") }, "EN"),
        ),
      ),
      tab === "overview" ? el(OverviewTab) : null,
      tab === "server" ? el(ServerTab) : null,
      tab === "remote" ? el(RemoteTab) : null,
      tab === "settings" ? el(SettingsTab) : null,
    );
  }

  // ------------------------------------------------------------- apply

  function apply(ctx) {
    ctx.slots.inject("settings.section", () => ctx.slots.register({
      name: "settings.section",
      id: "dsh-ops-console",
      order: 40,
      label: () => "运维控制台",
    }, () => el(ConsoleSection)));
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
