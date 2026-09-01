window.__ModuleLoader__.load({ id: "dsh-ops-console", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  const React = require("react");
  const { useState, useEffect, useCallback } = React;
  const name = "dsh-ops-console";
  const inject = ["slots"];

  const CSS = `
    .dshops-root {
      --dshops-border: color-mix(in srgb, currentColor 16%, transparent);
      --dshops-border-soft: color-mix(in srgb, currentColor 9%, transparent);
      --dshops-muted: color-mix(in srgb, currentColor 68%, transparent);
      --dshops-surface: color-mix(in srgb, currentColor 4%, transparent);
      display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 980px; min-width: 0; box-sizing: border-box;
    }
    .dshops-card { border: 1px solid var(--dshops-border-soft); background: var(--dshops-surface); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; }
    .dshops-card h2, .dshops-card h3, .dshops-card p { margin: 0; }
    .dshops-card h2 { font-size: 20px; line-height: 1.3; } .dshops-card h3 { font-size: 16px; line-height: 1.4; }
    .dshops-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; min-width: 0; }
    .dshops-muted { color: var(--dshops-muted); font-size: 13px; line-height: 1.6; }
    .dshops-error { color: color-mix(in srgb, #ff4d4f 76%, currentColor); font-size: 13px; line-height: 1.55; }
    .dshops-notice { border: 1px solid rgba(251,188,4,.5); background: rgba(251,188,4,.12); border-radius: 11px; padding: 11px 13px; font-size: 13px; line-height: 1.55; }
    .dshops-status { display: flex; align-items: center; gap: 9px; font-weight: 650; }
    .dshops-status-dot { width: 9px; height: 9px; border-radius: 999px; flex: 0 0 auto; background: #fbbc04; box-shadow: 0 0 0 4px rgba(251,188,4,.13); }
    .dshops-status-dot.ok { background: #34a853; box-shadow: 0 0 0 4px rgba(52,168,83,.13); }
    .dshops-status-dot.off { background: #9aa0a6; box-shadow: 0 0 0 4px rgba(154,160,166,.13); }
    .dshops-pills { display: flex; flex-wrap: wrap; gap: 7px; }
    .dshops-badge { display: inline-flex; align-items: center; padding: 4px 9px; border: 1px solid var(--dshops-border-soft); border-radius: 999px; font-size: 12px; color: var(--dshops-muted); }
    .dshops-badge.ok { background: rgba(52,168,83,.12); color: color-mix(in srgb, #34a853 68%, currentColor); }
    .dshops-badge.warn { background: rgba(251,188,4,.13); color: color-mix(in srgb, #fbbc04 68%, currentColor); }
    .dshops-url { border: 1px solid var(--dshops-border-soft); border-radius: 11px; padding: 10px 12px; overflow-wrap: anywhere; background: color-mix(in srgb, currentColor 2.5%, transparent); }
    .dshops-btn { min-height: 38px; border: 1px solid var(--dshops-border); background: transparent; color: inherit; padding: 8px 13px; border-radius: 9px; cursor: pointer; font-size: 13px; transition: background .15s ease, border-color .15s ease, transform .15s ease; }
    .dshops-btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 7%, transparent); }
    .dshops-btn:focus-visible, .dshops-input:focus-visible, .dshops-select:focus-visible { outline: 2px solid #4c9aff; outline-offset: 2px; }
    .dshops-btn.primary { background: #1a73e8; color: #fff; border-color: transparent; }
    .dshops-btn.primary:hover:not(:disabled) { background: #1769d2; }
    .dshops-btn.danger { color: color-mix(in srgb, #ff4d4f 72%, currentColor); border-color: color-mix(in srgb, #ff4d4f 42%, transparent); }
    .dshops-btn:disabled { opacity: .48; cursor: not-allowed; }
    .dshops-input { min-height: 38px; border: 1px solid var(--dshops-border); border-radius: 9px; background: transparent; color: inherit; padding: 8px 10px; min-width: 0; flex: 1; box-sizing: border-box; }
    .dshops-input::placeholder { color: var(--dshops-muted); }
    .dshops-field { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: var(--dshops-muted); font-size: 13px; }
    .dshops-select { min-height: 38px; border: 1px solid var(--dshops-border); border-radius: 9px; background: transparent; color: inherit; padding: 7px 28px 7px 10px; }
    .dshops-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .dshops-advanced { border-top: 1px solid var(--dshops-border-soft); padding-top: 11px; }
    .dshops-advanced summary { cursor: pointer; font-weight: 600; }
    .dshops-advanced-body { display: flex; flex-direction: column; gap: 12px; padding-top: 13px; }
    .dshops-steps { margin: 0; padding-left: 20px; color: var(--dshops-muted); font-size: 13px; line-height: 1.75; }
    .dshops-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 30px; letter-spacing: .18em; font-weight: 700; }
    .dshops-qr-wrap { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .dshops-qr { width: 188px; height: 188px; padding: 10px; border: 1px solid var(--dshops-border-soft); border-radius: 13px; background: #fff; box-sizing: border-box; }
    .dshops-session { padding: 10px 0; border-bottom: 1px solid var(--dshops-border-soft); }
    @media (max-width: 720px) {
      body.dshops-active [role="dialog"] { width: calc(100vw - 24px) !important; max-width: calc(100vw - 24px) !important; }
      body.dshops-active [role="dialog"] > nav { width: 104px !important; flex: 0 0 104px !important; padding-inline: 8px !important; }
      body.dshops-active [role="dialog"] > nav + div { width: auto !important; min-width: 0 !important; flex: 1 1 auto !important; }
      .dshops-root { max-width: none; width: calc(100% + 28px); margin-inline: -14px; gap: 12px; }
      .dshops-card { padding: 14px; border-radius: 13px; }
      .dshops-row { align-items: flex-start; flex-wrap: wrap; }
      .dshops-row > * { min-width: 0; }
      .dshops-actions { width: 100%; }
      .dshops-actions .dshops-btn { min-height: 42px; flex: 1 1 100%; }
      .dshops-actions.compact .dshops-btn { flex: 1 1 calc(50% - 4px); }
      .dshops-input { min-height: 42px; flex: 1 1 100%; width: 100%; }
      .dshops-select { min-height: 42px; flex: 1 1 auto; }
      .dshops-code { font-size: 27px; letter-spacing: .14em; }
      .dshops-qr { width: 172px; height: 172px; }
    }
  `;

  function el(type, props, ...children) { return React.createElement(type, props, ...children); }
  function Card({ children, className }) { return el("section", { className: "dshops-card" + (className ? " " + className : "") }, children); }
  function Btn({ children, onClick, primary, danger, disabled }) {
    return el("button", { type: "button", disabled, onClick, className: "dshops-btn" + (primary ? " primary" : "") + (danger ? " danger" : "") }, children);
  }
  function Error({ children }) { return children ? el("div", { className: "dshops-error" }, String(children)) : null; }
  // Two-step inline confirm: replaces window.confirm (suppressed in webviews).
  function ConfirmBtn({ children, confirmLabel, onConfirm, primary, danger }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
      if (!armed) return;
      const timer = setTimeout(() => setArmed(false), 3000);
      return () => clearTimeout(timer);
    }, [armed]);
    return el(Btn, { primary, danger, onClick: () => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); } }, armed ? confirmLabel : children);
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
  function svgDataUrl(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
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
    const [sessionDays, setSessionDays] = useState("7");
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
    const refreshAll = () => { access.reload(); trust.reload(); auth.reload(); if (auth.data?.local) sessions.reload(); };
    const createPairing = () => {
      post("/dsh-ops/pairing/create", { sessionDays: Number(sessionDays) }).then((result) => { setPairing(result); if (!result.ok) setMessage(result); });
    };
    const cancelPairing = () => {
      post("/dsh-ops/pairing/cancel").then((result) => { setPairing(null); setMessage(result); });
    };
    const redeemPairing = () => {
      post("/dsh-ops/pairing/redeem", { code: pairingCode.trim(), label: deviceLabel.trim() || "远程浏览器" }).then((result) => {
        if (result.ok && result.token) { saveAdminToken(result.token); setPairingCode(""); setMessage({ ok: true, message: "确认成功，Mac 本机已记录这次远程连接。" }); auth.reload(); }
        else setMessage(result);
      });
    };
    const revokeSession = (id) => post("/dsh-ops/sessions/revoke", { id }).then((result) => { setMessage(result.ok ? { ok: true, message: "已忘记该设备的确认记录。" } : result); sessions.reload(); });
    const revokeAll = () => post("/dsh-ops/sessions/revoke-all").then((result) => { setMessage(result.ok ? { ok: true, message: `已清除 ${result.removed || 0} 条远程设备确认记录。` } : result); sessions.reload(); });
    const inviteText = () => [
      "请先确认这台设备已登录获准访问的 Tailscale 账号，然后打开 DeepSeek Harness：",
      remoteUrl,
      "",
      "设备确认码：" + pairing.code,
      "确认码 5 分钟内有效；确认后，这台设备的记录保留 " + pairing.sessionDays + " 天。",
      "注意：确认码不会授予 Tailnet 权限，实际访问权限仍由 Tailscale 管理。",
    ].join("\n");
    const copyInvite = () => copyText(inviteText()).then(() => setMessage({ ok: true, message: "连接说明已复制，可以发到另一台设备。" })).catch(() => setMessage({ ok: false, error: "无法复制连接说明。" }));
    const shareInvite = () => navigator.share({ title: "打开 DeepSeek Harness", text: inviteText() }).catch(() => {});
    const tightenAccess = () => post("/dsh-ops/security/tighten", { confirm: "tighten-remote-access" }).then((result) => {
      setPairing(null); setMessage(result); access.reload(); auth.reload(); sessions.reload();
    }).catch((error) => setMessage({ ok: false, error: String(error) }));
    const rotateMaster = () => post("/dsh-ops/auth/rotate-master").then((result) => {
      if (result.ok && result.token) { saveAdminToken(result.token); setMessage({ ok: true, message: "旧的共享管理令牌已停用；已配对设备不受影响。" }); auth.reload(); }
      else setMessage(result);
    });
    const hosts = Array.isArray(trust.data?.hosts) ? trust.data.hosts : [];
    const canManage = auth.data?.local === true;
    const testTone = selfTest?.verdict === "host-ready" || selfTest?.verdict === "not-configured" ? "dshops-muted" : "dshops-error";
    const remoteUrl = access.data?.dnsName ? "https://" + access.data.dnsName + "/" : null;
    const accessReady = access.data?.tailscaleRunning === true && access.data?.serveActive === true && !!remoteUrl && trust.data?.tailnetTrusted === true && trust.data?.pendingRestart !== true;
    const statusLoading = access.loading && !access.data;
    const accessTitle = statusLoading ? "正在读取远程状态…" : accessReady ? "远程入口已开启" : access.data?.tailscaleRunning === false ? "Tailscale 尚未就绪" : access.data?.serveActive ? "远程入口等待完成" : "远程入口尚未开启";
    const pairingSeconds = pairing?.expiresAt ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - now) / 1000)) : 0;
    const pairingActive = pairing?.ok && pairingSeconds > 0;
    return el("div", { className: "dshops-root" },
      el("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      el(Card, null,
        el("div", { className: "dshops-row" },
          el("h2", null, "远程访问"),
          el("span", { className: "dshops-muted" }, "dsh-ops v" + (auth.data?.opsVersion || "—")),
        ),
        el("p", { className: "dshops-muted" }, canManage ? "从手机或另一台电脑安全打开 Harness。这里只管理远程入口，不会更新、重启或恢复引擎。" : "这台设备通过 Tailscale 访问 Harness；远程入口只能在 Mac 本机管理。"),
        el("div", { className: "dshops-status", role: "status" },
          el("span", { className: "dshops-status-dot " + (accessReady ? "ok" : access.data?.tailscaleRunning === false ? "off" : "") }),
          el("span", null, accessTitle),
        ),
        !statusLoading ? el("div", { className: "dshops-pills", "aria-label": "远程访问状态" },
          el("span", { className: "dshops-badge " + (access.data?.tailscaleRunning ? "ok" : "warn") }, "Tailscale " + (access.data?.tailscaleRunning ? "已连接" : "未连接")),
          el("span", { className: "dshops-badge " + (access.data?.serveActive ? "ok" : "warn") }, "入口 " + (access.data?.serveActive ? "已创建" : "未创建")),
          el("span", { className: "dshops-badge " + (trust.data?.tailnetTrusted && !trust.data?.pendingRestart ? "ok" : "warn") }, "地址 " + (trust.data?.pendingRestart ? "等待生效" : trust.data?.tailnetTrusted ? "已生效" : "未加入")),
        ) : null,
        trust.data?.pendingRestart ? el("div", { className: "dshops-notice", role: "status" }, "访问地址已保存，但尚未生效。请重新打开 Harness；完成后这里会自动恢复为“已生效”。") : null,
        Error({ children: access.error }),
        access.data?.tailscaleRunning === false ? el("p", { className: "dshops-error" }, access.data.guidance || "请先在这台 Mac 上打开并登录 Tailscale。") : null,
        remoteUrl ? el("div", { className: "dshops-url" }, el("a", { href: remoteUrl, target: "_blank", rel: "noreferrer" }, remoteUrl)) : null,
        remoteUrl ? el("div", { className: "dshops-actions compact" },
          el(Btn, { onClick: () => copyText(remoteUrl).then(() => setMessage({ ok: true, message: "访问地址已复制。" })).catch(() => setMessage({ ok: false, error: "无法复制，请长按上方地址复制。" })) }, "复制地址"),
          typeof navigator.share === "function" ? el(Btn, { onClick: () => navigator.share({ title: "DeepSeek Harness", url: remoteUrl }).catch(() => {}) }, "分享地址") : null,
        ) : null,
        el("div", { className: "dshops-actions" },
          !access.data?.serveActive && canManage ? el(Btn, { primary: true, disabled: access.data?.tailscaleRunning !== true, onClick: () => run("/dsh-ops/tailscale/enable") }, "设置远程访问") : null,
          access.data?.serveActive ? el(Btn, { primary: accessReady, onClick: runSelfTest, disabled: selfTesting }, selfTesting ? "确认中…" : "确认远程可用") : null,
          el(Btn, { onClick: refreshAll, disabled: access.loading }, "立即刷新"),
        ),
        selfTest ? el("p", { className: testTone }, selfTest.message || selfTest.error) : null,
        message?.link ? el("a", { href: message.link, target: "_blank", rel: "noreferrer" }, "先在 Tailscale 中允许此设备") : null,
        message ? el("p", { className: message.ok ? "dshops-muted" : "dshops-error", role: "status", "aria-live": "polite" }, message.message || message.error) : null,
        access.updatedAt ? el("p", { className: "dshops-muted" }, "每 15 秒自动更新 · 最近 " + new Date(access.updatedAt).toLocaleTimeString()) : null,
      ),
      auth.data && !auth.data.local && !auth.data.paired ? el(Card, null,
        el("h3", null, "确认这台远程设备"),
        el("p", { className: "dshops-muted" }, "请先在 Mac 本机生成一个 5 分钟有效的确认码。这一步用于记录本次真实连接；访问权限仍由 Tailscale 管理。"),
        el("input", { className: "dshops-input", value: deviceLabel, placeholder: "设备名称，例如：我的 iPhone", onChange: (e) => setDeviceLabel(e.target.value) }),
        el("input", { className: "dshops-input", inputMode: "numeric", maxLength: 6, value: pairingCode, placeholder: "6 位确认码", onChange: (e) => setPairingCode(e.target.value.replace(/\D/g, "").slice(0, 6)) }),
        el("div", { className: "dshops-actions" }, el(Btn, { primary: true, disabled: pairingCode.length !== 6, onClick: redeemPairing }, "完成确认")),
      ) : null,
      auth.data?.local ? el(Card, null,
        el("h3", null, "确认远程设备"),
        el("p", { className: "dshops-muted" }, "确认码用于验证另一台设备确实打开了当前远程地址，并在这台 Mac 上留下可识别的连接记录。Tailscale ACL 仍是实际访问权限来源。"),
        el("ol", { className: "dshops-steps" },
          el("li", null, "生成一次性确认码"),
          el("li", null, "在另一台设备打开上方访问地址"),
          el("li", null, "输入设备名称和确认码"),
        ),
        el("label", { className: "dshops-field" },
          el("span", null, "这台设备的确认记录保留"),
          el("select", { className: "dshops-select", value: sessionDays, disabled: pairingActive, onChange: (event) => setSessionDays(event.target.value) },
            [1, 7, 30, 90].map((days) => el("option", { key: days, value: String(days) }, days + " 天")),
          ),
        ),
        pairingActive && pairing.invitation?.qrSvg ? el("div", { className: "dshops-qr-wrap" },
          el("img", { className: "dshops-qr", src: svgDataUrl(pairing.invitation.qrSvg), alt: "DeepSeek Harness 远程访问地址二维码", width: 188, height: 188 }),
          el("p", { className: "dshops-muted" }, "用另一台设备扫描二维码打开 Harness，再输入下方确认码。二维码只包含访问地址，不包含确认码。"),
        ) : null,
        pairingActive ? el("div", { className: "dshops-code", "aria-label": "配对码 " + pairing.code }, pairing.code) : null,
        pairingActive ? el("p", { className: "dshops-muted", role: "timer" }, "确认码剩余 " + Math.floor(pairingSeconds / 60) + " 分 " + String(pairingSeconds % 60).padStart(2, "0") + " 秒 · 设备记录保留 " + pairing.sessionDays + " 天") : null,
        pairing?.ok && !pairingActive ? el("p", { className: "dshops-error" }, "配对码已过期，请重新生成。") : null,
        el("div", { className: "dshops-actions" },
          el(Btn, { primary: true, disabled: !accessReady, onClick: createPairing }, pairingActive ? "重新生成" : "生成确认码"),
          pairingActive && remoteUrl ? el(Btn, { onClick: copyInvite }, "复制连接说明") : null,
          pairingActive && remoteUrl && typeof navigator.share === "function" ? el(Btn, { onClick: shareInvite }, "发送连接说明") : null,
          pairingActive ? el(Btn, { onClick: cancelPairing }, "取消确认码") : null,
        ),
        !accessReady ? el("p", { className: "dshops-muted" }, "请先让上方三项状态全部就绪，再确认另一台设备。") : null,
        auth.data?.lastRemoteVerifiedAt ? el("p", { className: "dshops-muted" }, "最近一次远程设备验证：" + new Date(auth.data.lastRemoteVerifiedAt).toLocaleString()) : null,
        Array.isArray(sessions.data?.sessions) && sessions.data.sessions.length ? el("div", null,
          sessions.data.sessions.map((session) => el("div", { className: "dshops-row dshops-session", key: session.id },
            el("span", null, session.label + " · 最近确认 " + relativeTime(session.lastSeenAt) + " · 记录保留至 " + new Date(session.expiresAt).toLocaleDateString()),
            el(ConfirmBtn, { confirmLabel: "确认忘记", onConfirm: () => revokeSession(session.id) }, "忘记记录"),
          )),
          el(ConfirmBtn, { confirmLabel: "确认全部忘记", onConfirm: revokeAll }, "忘记全部记录"),
        ) : el("p", { className: "dshops-muted" }, "尚无已确认设备。生成确认码后，在另一台设备打开访问地址即可完成确认。"),
      ) : auth.data?.paired ? el(Card, null,
        el("h3", null, "这台设备已确认"),
        el("p", { className: "dshops-muted" }, "Mac 本机已记录这次远程连接。远程入口设置仍只能在 Mac 本机修改；实际访问权限由 Tailscale 管理。"),
        auth.data.session?.expiresAt ? el("p", { className: "dshops-muted" }, "确认记录预计保留至 " + new Date(auth.data.session.expiresAt).toLocaleDateString() + "。") : null,
      ) : null,
      canManage ? el(Card, null,
        el("details", { className: "dshops-advanced" },
          el("summary", null, "更多访问设置"),
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
            el("div", null,
              el("h3", null, "关闭远程入口"),
              el("p", { className: "dshops-muted" }, "只移除 Harness 自己的 Tailscale Serve 入口，不影响其他 Serve 服务。"),
              el("div", { className: "dshops-actions" }, el(ConfirmBtn, { danger: true, confirmLabel: "确认关闭入口", onConfirm: () => run("/dsh-ops/tailscale/disable") }, "关闭远程访问")),
            ),
            el("div", null,
              el("h3", null, "立即收紧访问"),
              el("p", { className: "dshops-muted" }, "如果设备丢失或连接信息发错了，可同时关闭 Harness 远程入口、取消当前确认码，并撤销所有远程确认记录。其他 Tailscale Serve 服务不会受影响。"),
              el("div", { className: "dshops-actions" }, el(ConfirmBtn, { danger: true, confirmLabel: "确认关闭并全部撤销", onConfirm: tightenAccess }, "立即收紧访问")),
            ),
            el("div", null,
              el("h3", null, "旧版本兼容"),
              el("p", { className: "dshops-muted" }, "仅当你曾在 0.5.x 中复制过共享管理令牌时使用。停用旧令牌不会删除当前设备确认记录。"),
              el("div", { className: "dshops-actions" }, el(ConfirmBtn, { danger: true, confirmLabel: "确认停用旧令牌", onConfirm: rotateMaster }, "停用旧共享令牌")),
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
