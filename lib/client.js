window.__ModuleLoader__.load({ id: "dsh-ops-console", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  const React = require("react");
  const { useState, useEffect, useCallback } = React;
  const name = "dsh-ops-console";
  const inject = ["slots"];
  const CLIENT_CONTRACT = 3;

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
    .dshops-btn:focus-visible { outline: 2px solid #4c9aff; outline-offset: 2px; }
    .dshops-btn.primary { background: #1a73e8; color: #fff; border-color: transparent; }
    .dshops-btn.primary:hover:not(:disabled) { background: #1769d2; }
    .dshops-btn.danger { color: color-mix(in srgb, #ff4d4f 72%, currentColor); border-color: color-mix(in srgb, #ff4d4f 42%, transparent); }
    .dshops-btn:disabled { opacity: .48; cursor: not-allowed; }
    .dshops-field { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: var(--dshops-muted); font-size: 13px; }
    .dshops-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .dshops-advanced { border-top: 1px solid var(--dshops-border-soft); padding-top: 11px; }
    .dshops-advanced summary { cursor: pointer; font-weight: 600; }
    .dshops-advanced-body { display: flex; flex-direction: column; gap: 12px; padding-top: 13px; }
    .dshops-connect { display: grid; grid-template-columns: 188px minmax(0, 1fr); align-items: center; gap: 18px; padding-top: 4px; }
    .dshops-connect-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-width: 0; }
    .dshops-qr { width: 188px; height: 188px; padding: 10px; border: 1px solid var(--dshops-border-soft); border-radius: 13px; background: #fff; box-sizing: border-box; }
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
      .dshops-connect { grid-template-columns: 1fr; justify-items: center; text-align: center; }
      .dshops-connect-copy { align-items: stretch; width: 100%; }
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
  function ConfirmBtn({ children, confirmLabel, onConfirm, primary, danger, disabled }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
      if (!armed) return;
      const timer = setTimeout(() => setArmed(false), 3000);
      return () => clearTimeout(timer);
    }, [armed]);
    return el(Btn, { primary, danger, disabled, onClick: () => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); } }, armed ? confirmLabel : children);
  }

  const ADMIN_TOKEN_KEY = "dshops-admin-token";
  function adminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY) || ""; }
  function saveAdminToken(value) { localStorage.setItem(ADMIN_TOKEN_KEY, value.trim()); }
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
    const [message, setMessage] = useState(null);
    const [selfTest, setSelfTest] = useState(null);
    const [selfTesting, setSelfTesting] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      if (typeof auth.data?.token === "string" && auth.data.token !== adminToken()) {
        saveAdminToken(auth.data.token);
        auth.reload();
        // The first /tailscale request may have run before the local admin
        // token was stored, so it came back without a login invitation.
        access.reload();
      }
    }, [auth.data?.token, access.reload]);
    useEffect(() => {
      document.body.classList.add("dshops-active");
      return () => document.body.classList.remove("dshops-active");
    }, []);
    useEffect(() => {
      const timer = setInterval(() => {
        access.reload(); trust.reload(); auth.reload();
      }, 15000);
      return () => clearInterval(timer);
    }, []);
    const run = (path, body) => {
      if (busy) return;
      setBusy(true); setMessage(null);
      post(path, body).then((r) => { setMessage(r); access.reload(); trust.reload(); })
        .catch((e) => setMessage({ ok: false, error: String(e) })).finally(() => setBusy(false));
    };
    const runSelfTest = () => {
      setSelfTesting(true);
      api("/dsh-ops/tailscale/selftest").then(setSelfTest).catch((e) => setSelfTest({ ok: false, error: String(e) })).finally(() => setSelfTesting(false));
    };
    const canManage = auth.data?.local === true;
    const testTone = selfTest?.verdict === "host-ready" || selfTest?.verdict === "not-configured" ? "dshops-muted" : "dshops-error";
    const remoteUrl = access.data?.invitation?.url || (access.data?.dnsName ? "https://" + access.data.dnsName + "/" : null);
    const qrSvg = access.data?.invitation?.qrSvg || null;
    const exposure = access.error ? 'unknown' : access.data?.exposure?.state || 'unknown';
    const settingsMissing = trust.data?.ok === true && trust.data?.tailnetTrusted === false;
    const needsSetup = access.data?.serveActive === false || (access.data?.serveActive === true && settingsMissing);
    const accessReady = !access.error && !trust.error && access.data?.ok === true && exposure === 'not-detected' && access.data?.tailscaleRunning === true && access.data?.serveActive === true && !!remoteUrl && trust.data?.tailnetTrusted === true && trust.data?.pendingRestart !== true;
    const versionMismatch = !!auth.data && auth.data.contractVersion !== CLIENT_CONTRACT;
    const statusLoading = access.loading && !access.data;
    const accessTitle = statusLoading ? "正在读取远程状态…" : exposure === 'detected' ? "请检查公网访问配置" : access.error || trust.error || access.data?.ok === false ? "暂时无法确认远程状态" : accessReady ? "远程入口已开启" : access.data?.tailscaleRunning === false ? "Tailscale 尚未就绪" : access.data?.serveActive ? "远程入口等待完成" : "远程入口尚未开启";
    return el("div", { className: "dshops-root" },
      el("style", { dangerouslySetInnerHTML: { __html: CSS } }),
      el(Card, null,
        el("div", { className: "dshops-row" },
          el("h2", null, "远程访问"),
          el("span", { className: "dshops-muted" }, "dsh-ops v" + (auth.data?.opsVersion || "—")),
        ),
        el("p", { className: "dshops-muted" }, canManage ? "从手机或另一台电脑打开 Harness。正常使用 Serve 时，哪些账号和设备能够访问，由 Tailscale 管理。" : "远程入口只能在 Mac 本机管理。扫码或打开地址不代表额外授权。"),
        versionMismatch ? el("div", { className: "dshops-notice", role: "status" }, "界面与服务版本不一致，请重新打开 Harness 后再继续。") : null,
        el("div", { className: "dshops-status", role: "status" },
          el("span", { className: "dshops-status-dot " + (accessReady ? "ok" : access.data?.tailscaleRunning === false ? "off" : "") }),
          el("span", null, accessTitle),
        ),
        !statusLoading ? el("div", { className: "dshops-pills", "aria-label": "远程访问状态" },
          el("span", { className: "dshops-badge " + (access.data?.tailscaleRunning ? "ok" : "warn") }, "Tailscale " + (access.data?.tailscaleRunning ? "已连接" : "未连接")),
          el("span", { className: "dshops-badge " + (access.data?.serveActive ? "ok" : "warn") }, "入口 " + (access.data?.serveActive ? "已创建" : "未创建")),
          el("span", { className: "dshops-badge " + (trust.data?.tailnetTrusted && !trust.data?.pendingRestart ? "ok" : "warn") }, "Harness " + (settingsMissing ? "设置未完成" : trust.data?.pendingRestart ? "等待重启" : trust.data?.tailnetTrusted ? "已就绪" : "未就绪")),
        ) : null,
        exposure === 'detected' ? el("div", { className: "dshops-notice dshops-error", role: "alert" },
          el("strong", null, "检测到指向 Harness 的公网 Funnel 配置"),
          el("p", null, "这个入口允许来自互联网的连接，不能再按“只有 Tailscale 内的设备能访问”理解。请在这台 Mac 上关闭对应入口的 Funnel；插件不会自动修改它或其他服务。"),
          el("p", { className: "dshops-url" }, (access.data?.exposure?.endpoints || []).join("、")),
        ) : !statusLoading && exposure === 'unknown' ? el("div", { className: "dshops-notice", role: "status" }, "暂时无法确认 Harness 的 Funnel 配置。请检查本机 Tailscale 状态；此时不能确认入口的访问范围。") : null,
        access.data?.serveActive && settingsMissing ? el("div", { className: "dshops-notice", role: "status" }, canManage ? "入口已创建，Harness 设置尚未完成。点击“继续完成设置”即可重试，不需要先关闭入口。" : "入口设置尚未完成，请在 Mac 本机继续设置。") : null,
        trust.data?.pendingRestart && !settingsMissing ? el("div", { className: "dshops-notice", role: "status" }, "远程设置已保存，但 Harness 还没有载入。请重新启动 Harness 服务（仅刷新网页无效）；完成后这里会自动恢复为“已就绪”。") : null,
        Error({ children: access.error }),
        Error({ children: trust.error }),
        access.data?.tailscaleRunning === false ? el("p", { className: "dshops-error" }, access.data.guidance || "请先在这台 Mac 上打开并登录 Tailscale。") : null,
        accessReady && remoteUrl ? el("div", { className: "dshops-connect" },
          qrSvg ? el("img", { className: "dshops-qr", src: svgDataUrl(qrSvg), alt: "DeepSeek Harness 远程访问地址二维码", width: 188, height: 188 }) : null,
          el("div", { className: "dshops-connect-copy" },
            el("div", { className: "dshops-url" }, el("a", { href: remoteUrl, target: "_blank", rel: "noreferrer" }, remoteUrl)),
            el("p", { className: "dshops-muted" }, qrSvg
              ? "用已登录获准 Tailscale 账号的设备扫码打开。二维码包含本次启动的登录令牌，只在 Mac 本机页面生成，并会随服务重启轮换。"
              : "用已登录获准 Tailscale 账号的设备打开此地址。登录二维码只在 Mac 本机页面生成。"),
            el(Btn, { primary: true, onClick: () => copyText(remoteUrl).then(() => setMessage({ ok: true, message: "登录地址已复制。" })).catch(() => setMessage({ ok: false, error: "无法复制，请长按上方地址复制。" })) }, "复制地址"),
          ),
        ) : remoteUrl ? el("div", { className: "dshops-url" }, el("a", { href: remoteUrl, target: "_blank", rel: "noreferrer" }, remoteUrl)) : null,
        needsSetup && canManage ? el("div", { className: "dshops-actions" },
          el(Btn, { primary: true, disabled: busy || access.loading || trust.loading || !!access.error || !!trust.error || access.data?.ok !== true || access.data?.tailscaleRunning !== true || !access.data?.dnsName || exposure !== 'not-detected' || versionMismatch, onClick: () => run("/dsh-ops/tailscale/enable") }, busy ? "正在完成设置…" : access.data?.serveActive ? "继续完成设置" : "设置远程访问"),
        ) : null,
        message?.link ? el("a", { href: message.link, target: "_blank", rel: "noreferrer" }, "先在 Tailscale 中允许此设备") : null,
        message ? el("p", { className: message.ok ? "dshops-muted" : "dshops-error", role: "status", "aria-live": "polite" }, message.message || message.error) : null,
        access.updatedAt ? el("p", { className: "dshops-muted" }, "每 15 秒自动更新 · 最近 " + new Date(access.updatedAt).toLocaleTimeString()) : null,
      ),
      canManage ? el(Card, null,
        el("details", { className: "dshops-advanced" },
          el("summary", null, "更多访问设置"),
          el("div", { className: "dshops-advanced-body" },
            el("div", null,
              el("h3", null, "连接检测"),
              el("p", { className: "dshops-muted" }, "从这台 Mac 检查远程 HTTPS 地址是否可达。最终仍建议用另一台 Tailscale 设备实际打开一次。"),
              el("div", { className: "dshops-actions" }, el(Btn, { onClick: runSelfTest, disabled: selfTesting }, selfTesting ? "检测中…" : "检测连接")),
              selfTest ? el("p", { className: testTone }, selfTest.message || selfTest.error) : null,
            ),
            el("div", null,
              el("h3", null, "关闭远程入口"),
              el("p", { className: "dshops-muted" }, "只移除 Harness 自己的 Tailscale Serve 入口，不影响其他 Serve 服务。"),
              el("div", { className: "dshops-actions" }, el(ConfirmBtn, { danger: true, disabled: busy || versionMismatch, confirmLabel: "确认关闭入口", onConfirm: () => run("/dsh-ops/tailscale/disable") }, "关闭远程访问")),
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
