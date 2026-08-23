window.__ModuleLoader__.load({ id: "dsh-ops-console", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  const React = require("react");
  const { useState, useEffect, useCallback } = React;
  const name = "dsh-ops-console";
  const inject = ["slots"];

  const CSS = `
    .dshops-root { display: flex; flex-direction: column; gap: 18px; width: 100%; max-width: 980px; min-width: 0; box-sizing: border-box; }
    .dshops-tabs { display: flex; flex-wrap: nowrap; gap: 6px; align-items: center; overflow-x: auto; border-bottom: 1px solid var(--dsw-color-border, rgba(0,0,0,.12)); padding-bottom: 10px; scrollbar-width: thin; }
    .dshops-tab { flex: 0 0 auto; white-space: nowrap; border: 0; border-radius: 9px; background: transparent; color: var(--dsw-color-text-muted, #666); padding: 8px 11px; cursor: pointer; font-size: 14px; }
    .dshops-tab.active { background: var(--dsw-color-primary, #1a73e8); color: #fff; }
    .dshops-version { margin-left: auto; color: var(--dsw-color-text-muted, #666); font-size: 12px; }
    .dshops-card { border: 1px solid var(--dsw-color-border, rgba(0,0,0,.12)); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 11px; }
    .dshops-card h2, .dshops-card h3, .dshops-card p { margin: 0; }
    .dshops-card h2 { font-size: 19px; } .dshops-card h3 { font-size: 15px; }
    .dshops-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; min-width: 0; }
    .dshops-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; min-width: 0; }
    .dshops-muted { color: var(--dsw-color-text-muted, #666); font-size: 13px; line-height: 1.55; }
    .dshops-error { color: #d93025; font-size: 13px; line-height: 1.5; }
    .dshops-badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 12px; }
    .dshops-badge.ok { background: rgba(52,168,83,.15); color: #24873d; }
    .dshops-badge.warn { background: rgba(251,188,4,.18); color: #9a6f00; }
    .dshops-btn { border: 1px solid var(--dsw-color-border, rgba(0,0,0,.2)); background: transparent; color: inherit; padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; }
    .dshops-btn.primary { background: var(--dsw-color-primary, #1a73e8); color: #fff; border-color: transparent; }
    .dshops-btn:disabled { opacity: .5; cursor: not-allowed; }
    .dshops-choice { text-align: left; padding: 12px; border: 1px solid var(--dsw-color-border, rgba(0,0,0,.15)); background: transparent; border-radius: 10px; color: inherit; cursor: pointer; }
    .dshops-choice:hover { border-color: var(--dsw-color-primary, #1a73e8); }
    .dshops-choice strong { display: block; margin-bottom: 4px; }
    .dshops-event { border-left: 3px solid #9aa0a6; padding: 2px 0 2px 12px; display: flex; flex-direction: column; gap: 3px; }
    .dshops-event.attention { border-left-color: #d93025; } .dshops-event.check { border-left-color: #1a73e8; }
    .dshops-input { border: 1px solid var(--dsw-color-border, rgba(0,0,0,.2)); border-radius: 8px; background: transparent; color: inherit; padding: 7px 9px; min-width: 0; flex: 1; box-sizing: border-box; }
    .dshops-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .dshops-details { font-size: 13px; } .dshops-details summary { cursor: pointer; color: var(--dsw-color-text-muted, #666); }
    .dshops-advanced { border-top: 1px solid var(--dsw-color-border, rgba(0,0,0,.12)); padding-top: 10px; }
    .dshops-advanced summary { cursor: pointer; font-weight: 600; }
    .dshops-advanced-body { display: flex; flex-direction: column; gap: 11px; padding-top: 12px; }
    .dshops-token-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .dshops-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 720px) {
      body.dshops-active [role="dialog"] { width: calc(100vw - 24px) !important; max-width: calc(100vw - 24px) !important; }
      body.dshops-active [role="dialog"] > nav { width: 128px !important; flex: 0 0 128px !important; }
      body.dshops-active [role="dialog"] > nav + div { width: auto !important; min-width: 0 !important; flex: 1 1 auto !important; }
      .dshops-root { max-width: none; }
      .dshops-grid { grid-template-columns: minmax(0, 1fr); }
      .dshops-row { align-items: flex-start; flex-wrap: wrap; }
      .dshops-row > * { min-width: 0; }
      .dshops-actions { width: 100%; }
      .dshops-actions .dshops-btn { flex: 1 1 auto; }
      .dshops-input { flex: 1 1 100%; width: 100%; }
      .dshops-version { margin-left: 8px; flex: 0 0 auto; }
      .dshops-token-row { align-items: stretch; flex-wrap: wrap; }
      .dshops-token-row .dshops-input { flex: 1 1 100%; }
    }
  `;

  function el(type, props, ...children) { return React.createElement(type, props, ...children); }
  function Card({ children, className }) { return el("section", { className: "dshops-card" + (className ? " " + className : "") }, children); }
  function Btn({ children, onClick, primary, disabled }) {
    return el("button", { type: "button", disabled, onClick, className: "dshops-btn" + (primary ? " primary" : "") }, children);
  }
  function Error({ children }) { return children ? el("div", { className: "dshops-error" }, String(children)) : null; }
  function Badge({ tone = "ok", children }) { return el("span", { className: "dshops-badge " + tone }, children); }
  function Details({ children, label = "技术详情" }) { return el("details", { className: "dshops-details" }, el("summary", null, label), children); }
  function formatTime(value) {
    try { return new Date(value).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }); }
    catch { return "刚刚"; }
  }

  const ADMIN_TOKEN_KEY = "dshops-admin-token";
  function adminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY) || ""; }
  function saveAdminToken(value) { localStorage.setItem(ADMIN_TOKEN_KEY, value.trim()); }
  async function api(path, opts = {}) {
    const response = await fetch(path, { cache: "no-store", ...opts });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: text.slice(0, 200) }; }
    if (!response.ok) data.error = data.error || ("HTTP " + response.status);
    return data;
  }
  function post(path, body) {
    return api(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dsh-ops-token": adminToken() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  function useApi(path, deps = []) {
    const [state, setState] = useState({ loading: true, data: null, error: null });
    const reload = useCallback(() => {
      let active = true;
      setState((old) => ({ ...old, loading: true, error: null }));
      api(path).then((data) => active && setState({ loading: false, data, error: data?.error || null }))
        .catch((error) => active && setState({ loading: false, data: null, error: String(error) }));
      return () => { active = false; };
    }, [path]);
    useEffect(() => { const stop = reload(); return stop; }, [reload, ...deps]);
    return { ...state, reload };
  }

  function HomeTab({ go }) {
    const summary = useApi("/dsh-ops/summary");
    const data = summary.data;
    return el("div", { className: "dshops-grid" },
      el(Card, { className: "dshops-primary" },
        el("div", { className: "dshops-row" }, el("h2", null, data?.title || "正在确认当前状态"), data?.state === "normal" ? el(Badge, null, "正常") : null),
        el("p", { className: "dshops-muted" }, data?.detail || "请稍候，正在确认是否可以正常使用。"),
        Error({ children: summary.error }),
        el("div", { className: "dshops-actions" },
          el(Btn, { primary: true, onClick: () => go("diagnose") }, data?.action?.label || "开始诊断"),
          el(Btn, { onClick: summary.reload, disabled: summary.loading }, "重新检查"),
        ),
      ),
      el(Card, null,
        el("h3", null, data?.remote?.title || "远程访问"),
        el("p", { className: "dshops-muted" }, data?.remote?.detail || "正在确认。"),
        el(Btn, { onClick: () => go("remote") }, "查看远程访问"),
      ),
      el(Card, null,
        el("h3", null, "近期动态"),
        el("p", { className: "dshops-muted" }, "按时间查看服务检查和访问变化；原始信息只在需要时展开。"),
        el(Btn, { onClick: () => go("timeline") }, "查看动态"),
      ),
    );
  }

  const symptoms = [
    ["web", "页面无法打开", "检查当前页面能否连接到服务。"],
    ["history", "历史记录异常", "确认服务可连接，并生成不含会话内容的报告。"],
    ["remote", "远程访问失败", "检查是否已设置远程访问。"],
    ["slow", "响应缓慢或断开", "确认服务是否可连接，并整理后续排查所需信息。"],
    ["other", "其他运行问题", "先进行一轮基础检查。"],
  ];
  function DiagnoseTab({ go }) {
    const [selected, setSelected] = useState(null);
    const result = useApi("/dsh-ops/diagnose?symptom=" + (selected || "other"), [selected]);
    const run = (id) => { setSelected(id); };
    const data = selected ? result.data : null;
    const next = () => {
      if (data?.next?.id === "remote") go("remote");
      else if (data?.next?.id === "report") go("timeline");
    };
    return el("div", { className: "dshops-root" },
      el(Card, null,
        el("h2", null, "故障诊断"),
        el("p", { className: "dshops-muted" }, "选择最接近的现象，我们会给出当前判断、影响和下一步。"),
        el("div", { className: "dshops-grid" }, symptoms.map(([id, title, hint]) =>
          el("button", { type: "button", key: id, className: "dshops-choice", onClick: () => run(id) },
            el("strong", null, title), el("span", { className: "dshops-muted" }, hint),
          ),
        )),
      ),
      selected ? el(Card, null,
        el("div", { className: "dshops-row" }, el("h2", null, data?.title || "正在检查…"), data?.ok ? el(Badge, null, "检查完成") : null),
        el("p", null, data?.detail || "正在收集必要信息。"),
        el("p", { className: "dshops-muted" }, data?.impact),
        Error({ children: result.error }),
        el("div", { className: "dshops-actions" },
          el(Btn, { primary: true, onClick: next, disabled: !data }, data?.next?.label || "查看下一步"),
          el(Btn, { onClick: result.reload, disabled: result.loading }, "再次检查"),
        ),
        el(Details, { label: "检查范围" }, el("p", { className: "dshops-muted" }, "检查不会读取你的密钥、提示词或会话正文。诊断报告仅在你主动生成时提供。")),
      ) : null,
    );
  }

  function TimelineTab() {
    const timeline = useApi("/dsh-ops/timeline");
    const [report, setReport] = useState(null);
    const makeReport = () => api("/dsh-ops/report").then(setReport).catch((error) => setReport({ ok: false, error: String(error) }));
    const download = () => {
      if (!report?.ok) return;
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "dsh-diagnostic-report.json"; link.click();
      URL.revokeObjectURL(url);
    };
    return el("div", { className: "dshops-root" },
      el(Card, null,
        el("div", { className: "dshops-row" }, el("div", null, el("h2", null, "近期动态"), el("p", { className: "dshops-muted" }, "按时间查看服务检查和访问变化。")), el(Btn, { onClick: timeline.reload, disabled: timeline.loading }, "刷新")),
        Error({ children: timeline.error }),
        (timeline.data?.events || []).map((event, index) => el("div", { className: "dshops-event " + (event.kind || "info"), key: event.at + index },
          el("strong", null, event.title),
          el("span", { className: "dshops-muted" }, event.detail),
          el("span", { className: "dshops-muted" }, formatTime(event.at)),
        )),
      ),
      el(Card, null,
        el("h3", null, "生成诊断报告"),
        el("p", { className: "dshops-muted" }, "当问题持续存在时，生成一份可发送给技术支持的报告。它会自动隐藏密钥、令牌、提示词、会话正文、完整配置和远程地址。"),
        el("div", { className: "dshops-actions" },
          el(Btn, { primary: true, onClick: makeReport }, "生成报告"),
          report?.ok ? el(Btn, { onClick: download }, "下载报告") : null,
        ),
        Error({ children: report?.error }),
        report?.ok ? el(Details, { label: "查看报告内容" }, el("pre", { className: "dshops-code" }, JSON.stringify(report, null, 2))) : null,
      ),
    );
  }

  function RemoteTab() {
    const access = useApi("/dsh-ops/tailscale");
    const trust = useApi("/dsh-ops/trust");
    const auth = useApi("/dsh-ops/auth");
    const [message, setMessage] = useState(null);
    const [newHost, setNewHost] = useState("");
    const [token, setToken] = useState(() => adminToken());
    const [tokenVisible, setTokenVisible] = useState(false);
    useEffect(() => { if (typeof auth.data?.token === "string") { saveAdminToken(auth.data.token); setToken(auth.data.token); } }, [auth.data?.token]);
    const run = (path, body, confirmation) => {
      if (confirmation && !window.confirm(confirmation)) return;
      post(path, body).then((r) => { setMessage(r); access.reload(); trust.reload(); }).catch((e) => setMessage({ ok: false, error: String(e) }));
    };
    const hosts = Array.isArray(trust.data?.hosts) ? trust.data.hosts : [];
    return el("div", { className: "dshops-root" },
      el(Card, null,
        el("h2", null, "远程访问"),
        el("p", { className: "dshops-muted" }, "需要在手机或另一台电脑查看状态时，在这里准备访问地址。它不会影响这台 Mac 上的正常使用。"),
        access.data?.serveActive && access.data?.dnsName
          ? el(React.Fragment, null,
              el("p", null, "访问地址已准备好："),
              el("a", { href: "https://" + access.data.dnsName + "/", target: "_blank", rel: "noreferrer" }, "https://" + access.data.dnsName + "/"),
              el(Btn, { onClick: () => run("/dsh-ops/tailscale/disable", undefined, "关闭后，其他设备将不能访问这台 Mac。确认关闭吗？") }, "关闭远程访问"),
            )
          : el(Btn, { primary: true, onClick: () => run("/dsh-ops/tailscale/enable") }, "设置远程访问"),
        message?.link ? el("a", { href: message.link, target: "_blank", rel: "noreferrer" }, "先在 Tailscale 中允许此设备") : null,
        message ? el("p", { className: message.ok ? "dshops-muted" : "dshops-error" }, message.message || message.error) : null,
      ),
      el(Card, null,
        el("details", { className: "dshops-advanced" },
          el("summary", null, "高级访问设置"),
          el("div", { className: "dshops-advanced-body" },
            el("div", null,
              el("h3", null, "可信访问地址"),
              el("p", { className: "dshops-muted" }, "只在需要限制访问范围时修改。保存后请回到桌面客户端的“当前状态”重新检查；dsh-ops 不会直接重启服务。"),
              hosts.length ? hosts.map((host) => el("div", { className: "dshops-row", key: host }, el("span", null, host), el(Btn, { onClick: () => run("/dsh-ops/trust/remove", { host }, "移除后，该地址将不再被信任。确认移除吗？") }, "移除"))) : el("p", { className: "dshops-muted" }, "尚未添加额外地址。"),
              el("div", { className: "dshops-actions" },
                el("input", { className: "dshops-input", value: newHost, placeholder: "例如：mac-mini.tailnet.ts.net", onChange: (e) => setNewHost(e.target.value) }),
                el(Btn, { onClick: () => { if (newHost.trim()) { run("/dsh-ops/trust/add", { host: newHost.trim() }); setNewHost(""); } } }, "添加地址"),
              ),
            ),
            el("div", null,
              el("h3", null, "管理令牌"),
              el("p", { className: "dshops-muted" }, "令牌只用于保护本机的远程访问设置。默认隐藏，仅在你信任的设备上查看或保存。"),
              el("div", { className: "dshops-token-row" },
                el("input", { className: "dshops-input", type: tokenVisible ? "text" : "password", value: token, autoComplete: "off", "aria-label": "远程访问管理令牌", onChange: (e) => setToken(e.target.value) }),
                el(Btn, { onClick: () => setTokenVisible((old) => !old) }, tokenVisible ? "隐藏" : "显示"),
                el(Btn, { onClick: () => { saveAdminToken(token); setMessage({ ok: true, message: "令牌已保存在这台设备的浏览器中。" }); } }, "保存"),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function SettingsTab() {
    const settings = useApi("/dsh-ops/settings");
    const balance = useApi("/dsh-ops/balance");
    const [draft, setDraft] = useState(null);
    const [message, setMessage] = useState(null);
    useEffect(() => { if (settings.data?.settings && draft === null) setDraft({ ...settings.data.settings }); }, [settings.data?.settings]);
    const save = () => post("/dsh-ops/settings/save", { settings: draft }).then(setMessage).catch((e) => setMessage({ ok: false, error: String(e) }));
    return el("div", { className: "dshops-grid" },
      el(Card, null,
        el("h2", null, "运行偏好"),
        el("p", { className: "dshops-muted" }, "只保留会影响提醒和账户信息展示的选项。"),
        draft ? el(React.Fragment, null,
          el("label", { className: "dshops-row" }, el("span", null, "余额自动刷新（秒，0 表示关闭）"), el("input", { className: "dshops-input", type: "number", min: 0, value: String(draft.refreshSeconds || 0), onChange: (e) => setDraft({ ...draft, refreshSeconds: Math.max(0, Number(e.target.value) || 0) }) })),
          el("label", { className: "dshops-row" }, el("span", null, "余额提醒线（元）"), el("input", { className: "dshops-input", type: "number", min: 0, value: String(draft.warnThreshold || 0), onChange: (e) => setDraft({ ...draft, warnThreshold: Math.max(0, Number(e.target.value) || 0) }) })),
          el(Btn, { primary: true, onClick: save }, "保存设置"),
        ) : el("p", { className: "dshops-muted" }, "正在读取设置。"),
        message ? el("p", { className: message.ok ? "dshops-muted" : "dshops-error" }, message.message || message.error) : null,
      ),
      el(Card, null,
        el("h3", null, "账户与用量"),
        el("p", { className: "dshops-muted" }, "默认不在首页显示。只有你需要时才查看账户余额。"),
        balance.data?.ok ? el("p", null, "当前余额：¥" + Number(balance.data.total || 0).toFixed(2)) : el("p", { className: "dshops-muted" }, balance.data?.error || "点击刷新后查看。"),
        el(Btn, { onClick: balance.reload, disabled: balance.loading }, balance.loading ? "正在刷新…" : "查看余额"),
      ),
    );
  }

  function ConsoleSection() {
    const [tab, setTab] = useState("home");
    const auth = useApi("/dsh-ops/auth");
    useEffect(() => { if (typeof auth.data?.token === "string") saveAdminToken(auth.data.token); }, [auth.data?.token]);
    useEffect(() => {
      document.body.classList.add("dshops-active");
      return () => document.body.classList.remove("dshops-active");
    }, []);
    const tabs = [
      ["home", "运行概览"], ["diagnose", "故障诊断"], ["timeline", "近期动态"], ["remote", "远程访问"], ["settings", "运行偏好"],
    ];
    const go = (next) => setTab(next);
    return el("div", { className: "dshops-root" },
      el("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      el("nav", { className: "dshops-tabs", "aria-label": "dsh-ops 导航" },
        tabs.map(([id, label]) => el("button", { key: id, type: "button", className: "dshops-tab" + (tab === id ? " active" : ""), onClick: () => go(id) }, label)),
        el("span", { className: "dshops-version" }, "dsh-ops v" + (auth.data?.opsVersion || "—")),
      ),
      tab === "home" ? el(HomeTab, { go }) : null,
      tab === "diagnose" ? el(DiagnoseTab, { go }) : null,
      tab === "timeline" ? el(TimelineTab) : null,
      tab === "remote" ? el(RemoteTab) : null,
      tab === "settings" ? el(SettingsTab) : null,
    );
  }

  function apply(ctx) {
    ctx.slots.inject("settings.section", () => ctx.slots.register({
      name: "settings.section", id: "dsh-ops-console", order: 40, label: () => "运行与诊断",
    }, () => el(ConsoleSection)));
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
