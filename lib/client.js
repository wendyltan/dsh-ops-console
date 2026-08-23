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
    .dshops-card { border: 1px solid var(--dsw-color-border, rgba(0,0,0,.12)); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 11px; }
    .dshops-card h2, .dshops-card h3, .dshops-card p { margin: 0; }
    .dshops-card h2 { font-size: 19px; } .dshops-card h3 { font-size: 15px; }
    .dshops-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; min-width: 0; }
    .dshops-muted { color: var(--dsw-color-text-muted, #666); font-size: 13px; line-height: 1.55; }
    .dshops-error { color: #d93025; font-size: 13px; line-height: 1.5; }
    .dshops-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
    .dshops-badge.ok { background: rgba(52,168,83,.15); color: #24873d; }
    .dshops-badge.warn { background: rgba(251,188,4,.18); color: #9a6f00; }
    .dshops-btn { border: 1px solid var(--dsw-color-border, rgba(0,0,0,.2)); background: transparent; color: inherit; padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; }
    .dshops-btn.primary { background: var(--dsw-color-primary, #1a73e8); color: #fff; border-color: transparent; }
    .dshops-btn:disabled { opacity: .5; cursor: not-allowed; }
    .dshops-input { border: 1px solid var(--dsw-color-border, rgba(0,0,0,.2)); border-radius: 8px; background: transparent; color: inherit; padding: 7px 9px; min-width: 0; flex: 1; box-sizing: border-box; }
    .dshops-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .dshops-advanced { border-top: 1px solid var(--dsw-color-border, rgba(0,0,0,.12)); padding-top: 10px; }
    .dshops-advanced summary { cursor: pointer; font-weight: 600; }
    .dshops-advanced-body { display: flex; flex-direction: column; gap: 11px; padding-top: 12px; }
    .dshops-token-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .dshops-device { display: flex; align-items: center; gap: 10px; justify-content: space-between; font-size: 13px; min-width: 0; }
    .dshops-device .dshops-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-wrap: anywhere; min-width: 0; }
    @media (max-width: 720px) {
      body.dshops-active [role="dialog"] { width: calc(100vw - 24px) !important; max-width: calc(100vw - 24px) !important; }
      body.dshops-active [role="dialog"] > nav { width: 128px !important; flex: 0 0 128px !important; }
      body.dshops-active [role="dialog"] > nav + div { width: auto !important; min-width: 0 !important; flex: 1 1 auto !important; }
      .dshops-root { max-width: none; }
      .dshops-row { align-items: flex-start; flex-wrap: wrap; }
      .dshops-row > * { min-width: 0; }
      .dshops-actions { width: 100%; }
      .dshops-actions .dshops-btn { flex: 1 1 auto; }
      .dshops-input { flex: 1 1 100%; width: 100%; }
      .dshops-token-row { align-items: stretch; flex-wrap: wrap; }
      .dshops-token-row .dshops-input { flex: 1 1 100%; }
      .dshops-device { align-items: flex-start; flex-wrap: wrap; }
    }
  `;

  function el(type, props, ...children) { return React.createElement(type, props, ...children); }
  function Card({ children, className }) { return el("section", { className: "dshops-card" + (className ? " " + className : "") }, children); }
  function Btn({ children, onClick, primary, disabled }) {
    return el("button", { type: "button", disabled, onClick, className: "dshops-btn" + (primary ? " primary" : "") }, children);
  }
  function Error({ children }) { return children ? el("div", { className: "dshops-error" }, String(children)) : null; }
  // Two-step inline confirm: replaces window.confirm (suppressed in webviews).
  function ConfirmBtn({ children, confirmLabel, onConfirm, primary }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
      if (!armed) return;
      const timer = setTimeout(() => setArmed(false), 3000);
      return () => clearTimeout(timer);
    }, [armed]);
    return el(Btn, { primary, onClick: () => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); } }, armed ? confirmLabel : children);
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

  function RemotePanel() {
    const access = useApi("/dsh-ops/tailscale");
    const trust = useApi("/dsh-ops/trust");
    const auth = useApi("/dsh-ops/auth");
    const [message, setMessage] = useState(null);
    const [selfTest, setSelfTest] = useState(null);
    const [selfTesting, setSelfTesting] = useState(false);
    const [newHost, setNewHost] = useState("");
    const [token, setToken] = useState(() => adminToken());
    const [tokenVisible, setTokenVisible] = useState(false);
    useEffect(() => { if (typeof auth.data?.token === "string") { saveAdminToken(auth.data.token); setToken(auth.data.token); } }, [auth.data?.token]);
    useEffect(() => {
      document.body.classList.add("dshops-active");
      return () => document.body.classList.remove("dshops-active");
    }, []);
    const run = (path, body) => {
      post(path, body).then((r) => { setMessage(r); access.reload(); trust.reload(); }).catch((e) => setMessage({ ok: false, error: String(e) }));
    };
    const runSelfTest = () => {
      setSelfTesting(true);
      api("/dsh-ops/tailscale/selftest").then(setSelfTest).catch((e) => setSelfTest({ ok: false, error: String(e) })).finally(() => setSelfTesting(false));
    };
    const hosts = Array.isArray(trust.data?.hosts) ? trust.data.hosts : [];
    const devices = (Array.isArray(trust.data?.devices) ? trust.data.devices : []).filter((d) => d.dns);
    const testTone = selfTest?.verdict === "ready" || selfTest?.verdict === "not-configured" ? "dshops-muted" : "dshops-error";
    return el("div", { className: "dshops-root" },
      el("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      el(Card, null,
        el("div", { className: "dshops-row" },
          el("h2", null, "远程访问"),
          el("span", { className: "dshops-muted" }, "dsh-ops v" + (auth.data?.opsVersion || "—")),
        ),
        el("p", { className: "dshops-muted" }, "需要在手机或另一台电脑查看状态时，在这里准备访问地址。它不会影响这台 Mac 上的正常使用。"),
        Error({ children: access.error }),
        access.data?.serveActive && access.data?.dnsName
          ? el(React.Fragment, null,
              el("p", null, "访问地址已准备好："),
              el("a", { href: "https://" + access.data.dnsName + "/", target: "_blank", rel: "noreferrer" }, "https://" + access.data.dnsName + "/"),
              el("div", { className: "dshops-actions" },
                el(Btn, { primary: true, onClick: runSelfTest, disabled: selfTesting }, selfTesting ? "自检中…" : "自检"),
                el(ConfirmBtn, { confirmLabel: "确认关闭", onConfirm: () => run("/dsh-ops/tailscale/disable") }, "关闭远程访问"),
                el(Btn, { onClick: access.reload, disabled: access.loading }, "重新检查"),
              ),
            )
          : el("div", { className: "dshops-actions" },
              el(Btn, { primary: true, onClick: () => run("/dsh-ops/tailscale/enable") }, "设置远程访问"),
              el(Btn, { onClick: access.reload, disabled: access.loading }, "重新检查"),
            ),
        selfTest ? el("p", { className: testTone }, selfTest.message || selfTest.error) : null,
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
              hosts.length ? hosts.map((host) => el("div", { className: "dshops-row", key: host }, el("span", null, host), el(ConfirmBtn, { confirmLabel: "确认移除", onConfirm: () => run("/dsh-ops/trust/remove", { host }) }, "移除"))) : el("p", { className: "dshops-muted" }, "尚未添加额外地址。"),
              el("div", { className: "dshops-actions" },
                el("input", { className: "dshops-input", value: newHost, placeholder: "例如：mac-mini.tailnet.ts.net", onChange: (e) => setNewHost(e.target.value) }),
                el(Btn, { onClick: () => { if (newHost.trim()) { run("/dsh-ops/trust/add", { host: newHost.trim() }); setNewHost(""); } } }, "添加地址"),
              ),
              Error({ children: trust.error }),
            ),
            devices.length ? el("div", null,
              el("h3", null, "Tailnet 设备"),
              el("p", { className: "dshops-muted" }, "以下是你的 tailnet 中的设备，点「信任」可加入可信主机："),
              devices.map((d) => el("div", { className: "dshops-device", key: d.dns },
                el("span", { className: "dshops-name" }, d.dns),
                el("span", { className: "dshops-badge " + (d.online ? "ok" : "warn") }, d.online ? "在线" : "离线"),
                hosts.includes(d.dns)
                  ? el("span", { className: "dshops-actions" },
                      el("span", { className: "dshops-muted" }, "已信任"),
                      el(ConfirmBtn, { confirmLabel: "确认移除", onConfirm: () => run("/dsh-ops/trust/remove", { host: d.dns }) }, "移除"),
                    )
                  : el(Btn, { onClick: () => run("/dsh-ops/trust/add", { host: d.dns }) }, "信任"),
              )),
            ) : null,
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

  function apply(ctx) {
    ctx.slots.inject("settings.section", () => ctx.slots.register({
      name: "settings.section", id: "dsh-ops-console", order: 40, label: () => "远程访问",
    }, () => el(RemotePanel)));
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
