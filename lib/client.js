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
    .dshops-notice { border: 1px solid rgba(251,188,4,.45); background: rgba(251,188,4,.10); border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.55; }
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
    .dshops-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 30px; letter-spacing: .18em; font-weight: 700; }
    .dshops-session { padding: 9px 0; border-bottom: 1px solid var(--dsw-color-border, rgba(0,0,0,.08)); }
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
  function relativeTime(value) {
    const diff = Date.now() - Date.parse(value || "");
    if (!Number.isFinite(diff)) return "未知";
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + " 小时前";
    return Math.floor(diff / 86400000) + " 天前";
  }
  async function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const node = document.createElement("textarea");
    node.value = value; document.body.appendChild(node); node.select(); document.execCommand("copy"); node.remove();
  }
  async function api(path, opts = {}) {
    const token = adminToken();
    const headers = { ...(opts.headers || {}), ...(token ? { "x-dsh-ops-token": token } : {}) };
    const response = await fetch(path, { cache: "no-store", ...opts, headers });
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
    const [state, setState] = useState({ loading: true, data: null, error: null, updatedAt: null });
    const reload = useCallback(() => {
      if (!path) { setState({ loading: false, data: null, error: null, updatedAt: null }); return () => {}; }
      let active = true;
      setState((old) => ({ ...old, loading: true, error: null }));
      api(path).then((data) => active && setState({ loading: false, data, error: data?.error || null, updatedAt: Date.now() }))
        .catch((error) => active && setState({ loading: false, data: null, error: String(error), updatedAt: Date.now() }));
      return () => { active = false; };
    }, [path]);
    useEffect(() => { const stop = reload(); return stop; }, [reload, ...deps]);
    return { ...state, reload };
  }

  function RemotePanel() {
    const access = useApi("/dsh-ops/tailscale");
    const trust = useApi("/dsh-ops/trust");
    const auth = useApi("/dsh-ops/auth");
    const sessions = useApi(auth.data?.local ? "/dsh-ops/sessions" : null, [auth.data?.local]);
    const [message, setMessage] = useState(null);
    const [selfTest, setSelfTest] = useState(null);
    const [selfTesting, setSelfTesting] = useState(false);
    const [newHost, setNewHost] = useState("");
    const [pairing, setPairing] = useState(null);
    const [pairingCode, setPairingCode] = useState("");
    const [deviceLabel, setDeviceLabel] = useState("");
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
      if (typeof auth.data?.token === "string" && auth.data.token !== adminToken()) {
        saveAdminToken(auth.data.token);
        auth.reload();
        sessions.reload();
      }
    }, [auth.data?.token]);
    useEffect(() => {
      if (auth.data?.local || !auth.data?.paired) return;
      post("/dsh-ops/remote/checkin").then((result) => { if (result?.authRequired) { saveAdminToken(""); auth.reload(); } });
    }, [auth.data?.local, auth.data?.paired]);
    useEffect(() => {
      document.body.classList.add("dshops-active");
      return () => document.body.classList.remove("dshops-active");
    }, []);
    useEffect(() => {
      const timer = setInterval(() => {
        setNow(Date.now()); access.reload(); trust.reload(); auth.reload();
        if (auth.data?.local) sessions.reload();
      }, 15000);
      return () => clearInterval(timer);
    }, [auth.data?.local]);
    useEffect(() => {
      if (!pairing?.expiresAt) return;
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }, [pairing?.expiresAt]);
    const run = (path, body) => {
      post(path, body).then((r) => { setMessage(r); access.reload(); trust.reload(); }).catch((e) => setMessage({ ok: false, error: String(e) }));
    };
    const runSelfTest = () => {
      setSelfTesting(true);
      api("/dsh-ops/tailscale/selftest").then(setSelfTest).catch((e) => setSelfTest({ ok: false, error: String(e) })).finally(() => setSelfTesting(false));
    };
    const createPairing = () => {
      post("/dsh-ops/pairing/create").then((result) => { setPairing(result); if (!result.ok) setMessage(result); });
    };
    const cancelPairing = () => {
      post("/dsh-ops/pairing/cancel").then((result) => { setPairing(null); setMessage(result); });
    };
    const redeemPairing = () => {
      post("/dsh-ops/pairing/redeem", { code: pairingCode.trim(), label: deviceLabel.trim() || "远程浏览器" }).then((result) => {
        if (result.ok && result.token) { saveAdminToken(result.token); setPairingCode(""); setMessage({ ok: true, message: "配对成功，这台设备已完成远程验证。" }); auth.reload(); }
        else setMessage(result);
      });
    };
    const revokeSession = (id) => post("/dsh-ops/sessions/revoke", { id }).then((result) => { setMessage(result.ok ? { ok: true, message: "已撤销该设备。" } : result); sessions.reload(); });
    const revokeAll = () => post("/dsh-ops/sessions/revoke-all").then((result) => { setMessage(result.ok ? { ok: true, message: `已撤销 ${result.removed || 0} 台远程设备。` } : result); sessions.reload(); });
    const rotateMaster = () => post("/dsh-ops/auth/rotate-master").then((result) => {
      if (result.ok && result.token) { saveAdminToken(result.token); setMessage({ ok: true, message: "旧的共享管理令牌已停用；已配对设备不受影响。" }); auth.reload(); }
      else setMessage(result);
    });
    const hosts = Array.isArray(trust.data?.hosts) ? trust.data.hosts : [];
    const canManage = auth.data?.paired === true;
    const testTone = selfTest?.verdict === "host-ready" || selfTest?.verdict === "not-configured" ? "dshops-muted" : "dshops-error";
    const remoteUrl = access.data?.dnsName ? "https://" + access.data.dnsName + "/" : null;
    const pairingSeconds = pairing?.expiresAt ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - now) / 1000)) : 0;
    const pairingActive = pairing?.ok && pairingSeconds > 0;
    return el("div", { className: "dshops-root" },
      el("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      el(Card, null,
        el("div", { className: "dshops-row" },
          el("h2", null, "远程访问"),
          el("span", { className: "dshops-muted" }, "dsh-ops v" + (auth.data?.opsVersion || "—")),
        ),
        el("p", { className: "dshops-muted" }, "需要在手机或另一台电脑使用 Harness 时，在这里准备访问地址。它不会影响这台 Mac 上的正常使用。"),
        trust.data?.pendingRestart ? el("div", { className: "dshops-notice", role: "status" }, "访问地址已保存，但尚未生效。请重新打开 Harness；完成后这里会自动恢复为“已生效”。") : null,
        Error({ children: access.error }),
        access.data && access.data.tailscaleRunning === false
          ? el(React.Fragment, null,
              el("p", { className: "dshops-error" }, access.data.guidance || (access.data.serveActive
                ? "远程入口配置仍在，但 Tailscale 当前未运行。请先在这台 Mac 上打开并登录 Tailscale。"
                : "Tailscale 当前未运行，远程访问不可用。请先在这台 Mac 上打开并登录 Tailscale。")),
              el("div", { className: "dshops-actions" }, el(Btn, { primary: true, onClick: access.reload, disabled: access.loading }, "重新检查")),
            )
          : access.data?.serveActive && access.data?.dnsName
          ? el(React.Fragment, null,
              el("p", null, "访问地址已准备好："),
              el("a", { href: remoteUrl, target: "_blank", rel: "noreferrer" }, remoteUrl),
              el("div", { className: "dshops-actions" },
                el(Btn, { onClick: () => copyText(remoteUrl).then(() => setMessage({ ok: true, message: "访问地址已复制。" })).catch(() => setMessage({ ok: false, error: "无法复制，请长按上方地址复制。" })) }, "复制地址"),
                typeof navigator.share === "function" ? el(Btn, { onClick: () => navigator.share({ title: "DeepSeek Harness", url: remoteUrl }).catch(() => {}) }, "分享" ) : null,
                el(Btn, { primary: true, onClick: runSelfTest, disabled: selfTesting }, selfTesting ? "检查中…" : "检查本机配置"),
                canManage ? el(ConfirmBtn, { confirmLabel: "确认关闭", onConfirm: () => run("/dsh-ops/tailscale/disable") }, "关闭远程访问") : null,
                el(Btn, { onClick: access.reload, disabled: access.loading }, "重新检查"),
              ),
            )
          : el("div", { className: "dshops-actions" },
              el(Btn, { primary: true, disabled: !canManage, onClick: () => run("/dsh-ops/tailscale/enable") }, "设置远程访问"),
              el(Btn, { onClick: access.reload, disabled: access.loading }, "重新检查"),
            ),
        selfTest ? el("p", { className: testTone }, selfTest.message || selfTest.error) : null,
        message?.link ? el("a", { href: message.link, target: "_blank", rel: "noreferrer" }, "先在 Tailscale 中允许此设备") : null,
        message ? el("p", { className: message.ok ? "dshops-muted" : "dshops-error", role: "status", "aria-live": "polite" }, message.message || message.error) : null,
        access.updatedAt ? el("p", { className: "dshops-muted" }, "状态自动更新 · " + new Date(access.updatedAt).toLocaleTimeString()) : null,
      ),
      auth.data && !auth.data.local && !auth.data.paired ? el(Card, null,
        el("h3", null, "配对这台设备"),
        el("p", { className: "dshops-muted" }, "请先在 Mac 本机的“远程访问”设置中生成一个 5 分钟有效的配对码。"),
        el("input", { className: "dshops-input", value: deviceLabel, placeholder: "设备名称，例如：我的 iPhone", onChange: (e) => setDeviceLabel(e.target.value) }),
        el("input", { className: "dshops-input", inputMode: "numeric", maxLength: 6, value: pairingCode, placeholder: "6 位配对码", onChange: (e) => setPairingCode(e.target.value.replace(/\D/g, "").slice(0, 6)) }),
        el("div", { className: "dshops-actions" }, el(Btn, { primary: true, disabled: pairingCode.length !== 6, onClick: redeemPairing }, "完成配对")),
      ) : null,
      auth.data?.local ? el(Card, null,
        el("h3", null, "远程设备配对"),
        el("p", { className: "dshops-muted" }, "配对码仅使用一次，5 分钟后自动失效。远程浏览器会获得自己的授权，可随时单独撤销。"),
        pairingActive ? el("div", { className: "dshops-code", "aria-label": "配对码 " + pairing.code }, pairing.code) : null,
        pairingActive ? el("p", { className: "dshops-muted", role: "timer" }, "剩余 " + Math.floor(pairingSeconds / 60) + " 分 " + String(pairingSeconds % 60).padStart(2, "0") + " 秒") : null,
        pairing?.ok && !pairingActive ? el("p", { className: "dshops-error" }, "配对码已过期，请重新生成。") : null,
        el("div", { className: "dshops-actions" },
          el(Btn, { primary: true, onClick: createPairing }, pairingActive ? "重新生成" : "生成配对码"),
          pairingActive ? el(Btn, { onClick: cancelPairing }, "取消配对码") : null,
        ),
        auth.data?.lastRemoteVerifiedAt ? el("p", { className: "dshops-muted" }, "最近一次远程设备验证：" + new Date(auth.data.lastRemoteVerifiedAt).toLocaleString()) : null,
        Array.isArray(sessions.data?.sessions) && sessions.data.sessions.length ? el("div", null,
          sessions.data.sessions.map((session) => el("div", { className: "dshops-row dshops-session", key: session.id },
            el("span", null, session.label + " · 最近使用 " + relativeTime(session.lastSeenAt) + " · 授权至 " + new Date(session.expiresAt).toLocaleDateString()),
            el(ConfirmBtn, { confirmLabel: "确认撤销", onConfirm: () => revokeSession(session.id) }, "撤销"),
          )),
          el(ConfirmBtn, { confirmLabel: "确认全部撤销", onConfirm: revokeAll }, "撤销全部远程设备"),
        ) : el("p", { className: "dshops-muted" }, "尚无已配对的远程设备。"),
        el("details", { className: "dshops-advanced" },
          el("summary", null, "旧版本令牌迁移"),
          el("div", { className: "dshops-advanced-body" },
            el("p", { className: "dshops-muted" }, "如果曾在 0.5.x 中把管理令牌复制到其他设备，可在完成新配对后停用旧令牌。此操作不会撤销当前独立配对会话。"),
            el(ConfirmBtn, { confirmLabel: "确认停用旧令牌", onConfirm: rotateMaster }, "停用旧共享令牌"),
          ),
        ),
      ) : auth.data?.paired ? el(Card, null,
        el("h3", null, "远程设备已验证"),
        el("p", { className: "dshops-muted" }, "这台设备已获得独立授权。" + (auth.data.session?.expiresAt ? "当前授权预计于 " + new Date(auth.data.session.expiresAt).toLocaleDateString() + " 到期。" : "最后验证时间会显示在 Mac 本机。")),
      ) : null,
      canManage ? el(Card, null,
        el("details", { className: "dshops-advanced" },
          el("summary", null, "高级访问设置"),
          el("div", { className: "dshops-advanced-body" },
            el("div", null,
              el("h3", null, "Harness 接受的访问地址"),
              el("p", { className: "dshops-muted" }, "这里管理浏览器地址栏中用于打开 Harness 的服务器地址，不代表获准访问的手机或电脑。设备与人员权限由 Tailscale ACL 管理。保存后请回到桌面客户端的“当前状态”重新检查；dsh-ops 不会直接重启服务。"),
              hosts.length ? hosts.map((host) => el("div", { className: "dshops-row", key: host }, el("span", null, host), el(ConfirmBtn, { confirmLabel: "确认移除", onConfirm: () => run("/dsh-ops/trust/remove", { host }) }, "移除"))) : el("p", { className: "dshops-muted" }, "尚未添加额外地址。"),
              el("div", { className: "dshops-actions" },
                el("input", { className: "dshops-input", value: newHost, placeholder: "例如：mac-mini.tailnet.ts.net", onChange: (e) => setNewHost(e.target.value) }),
                el(Btn, { onClick: () => { if (newHost.trim()) { run("/dsh-ops/trust/add", { host: newHost.trim() }); setNewHost(""); } } }, "添加地址"),
              ),
              Error({ children: trust.error }),
            ),
          ),
        ),
      ) : null,
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
