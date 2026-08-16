window.__ModuleLoader__.load({ id: "dsh-ops-console", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  const React = require("react");
  const { useState, useEffect, useCallback, useRef } = React;

  const name = "dsh-ops-console";
  const inject = ["slots"];

  // ------------------------------------------------------------- styles

  const CSS = `
    .dshops-root { display: flex; flex-direction: column; gap: 16px; }
    .dshops-tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--dsw-color-border, rgba(0,0,0,0.12)); padding-bottom: 8px; }
    .dshops-tab { border: none; background: transparent; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; color: var(--dsw-color-text-muted, #666); }
    .dshops-tab.active { background: var(--dsw-color-primary, #1a73e8); color: #fff; }
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

  // ------------------------------------------------------------- tabs

  function OverviewTab() {
    const balance = useApi("/dsh-ops/balance");
    const version = useApi("/dsh-ops/version");

    const b = balance.data;
    const v = version.data;

    return el("div", { className: "dshops-grid" },
      el(Card, {
        title: "钱包 · 余额",
        right: el(Btn, { onClick: balance.reload, disabled: balance.loading }, balance.loading ? "刷新中…" : "刷新"),
      },
        balance.loading && !b ? el("div", { className: "dshops-muted" }, "加载中…") : null,
        Error({ children: b?.error }),
        b?.ok ? el(React.Fragment, null,
          el("div", { className: "dshops-big" }, "¥" + (Number(b.total) || 0).toFixed(2)),
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, "已用（赠金+充值-余额）"),
            el("span", null, "¥" + (Number(b.used) || 0).toFixed(2)),
          ),
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, "赠金 / 充值"),
            el("span", null, "¥" + (Number(b.granted) || 0).toFixed(2) + " / ¥" + (Number(b.topped) || 0).toFixed(2)),
          ),
          el("div", { className: "dshops-row" },
            el("a", { className: "dshops-link", href: "https://platform.deepseek.com/top_up", target: "_blank", rel: "noreferrer" }, "充值"),
            el("a", { className: "dshops-link", href: "https://platform.deepseek.com/usage", target: "_blank", rel: "noreferrer" }, "用量明细"),
          ),
        ) : null,
      ),
      el(Card, {
        title: "引擎版本",
        right: el(Btn, { onClick: version.reload, disabled: version.loading }, "检查"),
      },
        version.loading && !v ? el("div", { className: "dshops-muted" }, "加载中…") : null,
        Error({ children: v?.error }),
        v ? el(React.Fragment, null,
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, "当前"),
            el("span", null, v.current),
          ),
          el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, "最新"),
            el("span", null, v.latest ?? "—"),
          ),
          v.updateAvailable
            ? el(Badge, { tone: "warn" }, "有新版本 " + v.latest)
            : (v.latest ? el(Badge, { tone: "ok" }, "已是最新") : null),
        ) : null,
      ),
    );
  }

  function ServerTab() {
    const status = useApi("/dsh-ops/status");
    const logs = useApi("/dsh-ops/logs?tail=100");
    const [restarting, setRestarting] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const logRef = useRef(null);

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
        title: "服务器状态",
        right: s?.up ? el(Badge, { tone: "ok" }, "运行中") : null,
      },
        status.loading && !s ? el("div", { className: "dshops-muted" }, "加载中…") : null,
        Error({ children: status.error }),
        s ? el(React.Fragment, null,
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, "地址"), el("span", null, s.url)),
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, "PID"), el("span", null, String(s.pid))),
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, "已运行"), el("span", null, fmtUptime(s.uptime))),
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, "引擎"), el("span", null, s.engine)),
        ) : null,
      ),
      el(Card, {
        title: "重启服务",
      },
        el("div", { className: "dshops-muted" }, "重启会结束当前会话，浏览器将自动重连。"),
        !confirm
          ? el(Btn, { danger: true, onClick: () => setConfirm(true) }, "一键重启")
          : el("div", { className: "dshops-row" },
              el("span", null, "确认重启？"),
              el(Btn, { danger: true, disabled: restarting, onClick: doRestart }, restarting ? "重启中…" : "确认重启"),
              el(Btn, { onClick: () => setConfirm(false) }, "取消"),
            ),
      ),
      el(Card, {
        title: "最近日志",
        right: el(Btn, { onClick: logs.reload, disabled: logs.loading }, "刷新"),
      },
        logs.loading && !logs.data ? el("div", { className: "dshops-muted" }, "加载中…") : null,
        Error({ children: logs.error }),
        el("div", { className: "dshops-log", ref: logRef },
          (logs.data?.lines && logs.data.lines.length > 0)
            ? logs.data.lines.join("\n")
            : "（暂无日志）",
        ),
      ),
    );
  }

  function fmtUptime(sec) {
    const s = Number(sec) || 0;
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + "天" + h + "小时";
    if (h > 0) return h + "小时" + m + "分";
    return m + "分" + (s % 60) + "秒";
  }

  function RemoteTab() {
    const ts = useApi("/dsh-ops/tailscale");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const d = ts.data;

    const act = (path) => {
      setBusy(true);
      setMsg(null);
      post(path)
        .then((r) => setMsg(r))
        .catch((e) => setMsg({ ok: false, message: String(e) }))
        .finally(() => { setBusy(false); ts.reload(); });
    };

    return el("div", { className: "dshops-grid" },
      el(Card, {
        title: "Tailscale 远程访问",
        right: d?.serveActive ? el(Badge, { tone: "ok" }, "已开启") : el(Badge, { tone: "bad" }, "未开启"),
      },
        ts.loading && !d ? el("div", { className: "dshops-muted" }, "加载中…") : null,
        Error({ children: ts.error }),
        d ? el(React.Fragment, null,
          el("div", { className: "dshops-row" }, el("span", { className: "dshops-muted" }, "tailnet 域名"), el("span", null, d.dnsName || "—")),
          d.dnsName ? el("div", { className: "dshops-row" },
            el("span", { className: "dshops-muted" }, "访问地址"),
            el("a", { className: "dshops-link", href: "https://" + d.dnsName + "/", target: "_blank", rel: "noreferrer" }, "https://" + d.dnsName + "/"),
          ) : null,
          d.serveActive
            ? el(Btn, { danger: true, disabled: busy, onClick: () => act("/dsh-ops/tailscale/disable") }, busy ? "处理中…" : "关闭远程访问")
            : el(Btn, { primary: true, disabled: busy, onClick: () => act("/dsh-ops/tailscale/enable") }, busy ? "处理中…" : "开启远程访问"),
          msg ? el("div", { className: msg.ok ? "dshops-muted" : "dshops-error" }, msg.message) : null,
          msg?.link ? el("a", { className: "dshops-link", href: msg.link, target: "_blank", rel: "noreferrer" }, msg.link) : null,
        ) : null,
      ),
      el(Card, {
        title: "可信主机（connection.trustedHosts）",
        right: el(Btn, { onClick: ts.reload, disabled: ts.loading }, "刷新"),
      },
        el("div", { className: "dshops-muted" }, "这些域名被放行通过 /api 浏览器信任围栏（来自 profile 的 cordis.patch.yml）。"),
        d?.trustedHosts && d.trustedHosts.length > 0
          ? d.trustedHosts.map((h) => el("div", { key: h, className: "dshops-row" },
              el("span", null, h),
              el(Badge, { tone: "ok" }, "已信任"),
            ))
          : el("div", { className: "dshops-muted" }, "（未配置可信主机）"),
      ),
    );
  }

  function ConsoleSection() {
    const [tab, setTab] = useState("overview");
    const tabs = [
      { id: "overview", label: "概览" },
      { id: "server", label: "服务器" },
      { id: "remote", label: "远程访问" },
    ];
    return el("div", { className: "dshops-root" },
      el("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      el("div", { className: "dshops-tabs" },
        tabs.map((t) => el("button", {
          key: t.id,
          type: "button",
          className: "dshops-tab" + (tab === t.id ? " active" : ""),
          onClick: () => setTab(t.id),
        }, t.label)),
      ),
      tab === "overview" ? el(OverviewTab) : null,
      tab === "server" ? el(ServerTab) : null,
      tab === "remote" ? el(RemoteTab) : null,
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
