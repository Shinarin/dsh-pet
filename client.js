window.__ModuleLoader__.load({
  id: "dsh-pet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const inject = ["slots"];

    // ── 配置 ──
    const API_BASE = "/pet";
    const STATES = ["thinking", "answering", "approval", "idle"];
    const DEFAULT_SCALE = 1.0;
    const POS_KEY = "dsh-pet:position";
    const CONFIG_KEY = "dsh-pet:config";

    // ── 工具 ──
    async function fetchJson(path, opts) {
      const r = await fetch(API_BASE + path, opts);
      return r.json();
    }

    function loadLocalConfig() {
      try {
        const raw = localStorage.getItem(CONFIG_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }

    function saveLocalConfig(cfg) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    }

    function loadPosition() {
      try {
        const raw = localStorage.getItem(POS_KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
      return null;
    }

    function savePosition(pos) {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    }

    // ── 宠物浮动层 ──
    const VISIBILITY_KEY = "dsh-pet:visible";

    function createPetOverlay() {
      const existing = document.getElementById("dsh-pet-overlay");
      if (existing) existing.remove();

      const visible = localStorage.getItem(VISIBILITY_KEY) !== "false";

      const container = document.createElement("div");
      container.id = "dsh-pet-overlay";
      container.style.cssText = `
        position: fixed;
        z-index: 99999;
        width: 220px;
        height: 220px;
        bottom: 120px;
        right: 220px;
        user-select: none;
        -webkit-user-select: none;
        cursor: grab;
        display: ${visible ? "flex" : "none"};
        align-items: center;
        justify-content: center;
        transition: opacity 0.3s ease;
      `;

      const img = document.createElement("img");
      img.id = "dsh-pet-img";
      img.draggable = false;
      img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        pointer-events: none;
        transition: transform 0.18s ease;
      `;
      container.appendChild(img);

      // 小心心容器
      const heartsContainer = document.createElement("div");
      heartsContainer.id = "dsh-pet-hearts";
      heartsContainer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:10;";
      container.appendChild(heartsContainer);

      // 状态指示点
      const dot = document.createElement("div");
      dot.id = "dsh-pet-dot";
      dot.style.cssText = `
        position: absolute;
        top: 4px; right: 4px;
        width: 10px; height: 10px;
        border-radius: 50%;
        background: #888;
        border: 2px solid rgba(255,255,255,0.8);
        transition: background 0.3s ease;
      `;
      container.appendChild(dot);

      // CSS fallback 角色（当 GIF 无法加载时显示）
      const fallback = document.createElement("div");
      fallback.id = "dsh-pet-fallback";
      fallback.style.cssText = `
        display: none;
        width: 120px;
        height: 120px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        position: relative;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        animation: dsh-pet-fallback-breathe 2s ease-in-out infinite;
      `;
      // 眼睛
      const eyeL = document.createElement("div");
      eyeL.style.cssText = `position:absolute;top:38px;left:32px;width:14px;height:14px;background:#fff;border-radius:50%;`;
      const eyeR = document.createElement("div");
      eyeR.style.cssText = `position:absolute;top:38px;right:32px;width:14px;height:14px;background:#fff;border-radius:50%;`;
      // 瞳孔
      const pupilL = document.createElement("div");
      pupilL.style.cssText = `position:absolute;top:3px;left:3px;width:8px;height:8px;background:#333;border-radius:50%;`;
      const pupilR = document.createElement("div");
      pupilR.style.cssText = `position:absolute;top:3px;left:3px;width:8px;height:8px;background:#333;border-radius:50%;`;
      eyeL.appendChild(pupilL);
      eyeR.appendChild(pupilR);
      // 嘴巴
      const mouth = document.createElement("div");
      mouth.style.cssText = `position:absolute;bottom:28px;left:50%;transform:translateX(-50%);width:30px;height:10px;border-bottom:3px solid #fff;border-radius:0 0 15px 15px;`;
      fallback.appendChild(eyeL);
      fallback.appendChild(eyeR);
      fallback.appendChild(mouth);
      container.appendChild(fallback);

      document.body.appendChild(container);
      return { container, img, heartsContainer, dot };
    }

    // ── DSH 状态检测器（基于 DOM 观察） ──
    function safeClassName(el) {
      if (!el) return "";
      if (typeof el.className === "string") return el.className;
      if (el.getAttribute) return el.getAttribute("class") || "";
      return "";
    }

    class DshStateDetector {
      constructor(onStateChange) {
        this.onStateChange = onStateChange;
        this.currentState = "idle";
        this.observer = null;
        this.pollTimer = null;
        this.diagnosed = false;
        this.approvalSince = 0; // 记录最近一次检测到 approval 的时间
        this.knownSelectors = {
          stopBtn: null,
          loading: null,
          messageList: null,
          inputArea: null,
        };
        this.init();
      }

      init() {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => this.start());
        } else {
          this.start();
        }
      }

      start() {
        try {
          console.error("[DSH-PET] DOM StateDetector starting...");
          this.runDiagnostics();
          if (document.body) {
            this.observer = new MutationObserver(() => this.detectState());
            this.observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          }
          this.pollTimer = setInterval(() => this.detectState(), 500);
          this.detectState();
        } catch (err) {
          console.error("[DSH-PET] StateDetector start failed:", err);
        }
      }

      // 自动诊断：探测 DSH 的 DOM 特征（安全版）
      runDiagnostics() {
        if (this.diagnosed) return;
        this.diagnosed = true;
        try {
          console.error("[DSH-PET] ====== DOM DIAGNOSTICS ======");

          // 1. 探测所有 button 的文本
          const allBtns = Array.from(document.querySelectorAll("button, [role='button']"));
          const btnTexts = allBtns
            .map((b) => (b.innerText || b.textContent || "").trim())
            .filter((t) => t.length > 0 && t.length < 50);
          console.error("[DSH-PET] Buttons found:", btnTexts.slice(0, 20));

          // 2. 探测可能的消息列表容器
          const msgSelectors = [
            '[data-testid*="message"]',
            '[data-testid*="chat"]',
            '[class*="message"]',
            '[class*="chat"]',
            '[class*="conversation"]',
            '[class*="bubble"]',
            "main > div",
            "main",
          ];
          for (const sel of msgSelectors) {
            try {
              const el = document.querySelector(sel);
              if (el) {
                console.error("[DSH-PET] Container candidate:", sel, "children=", el.children.length);
                this.knownSelectors.messageList = sel;
                break;
              }
            } catch {}
          }

          // 3. 探测输入区域
          const inputs = document.querySelectorAll("textarea, input[type='text']");
          console.error("[DSH-PET] Input elements:", inputs.length);
          for (const inp of inputs) {
            try {
              const placeholder = (inp.placeholder || "").slice(0, 30);
              console.error("  -", inp.tagName, "placeholder=", placeholder, "disabled=", inp.disabled, "class=", safeClassName(inp).slice(0, 50));
            } catch {}
          }

          // 4. 探测 loading / spinner
          const spinners = document.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="progress"], svg[class*="spin"]');
          console.error("[DSH-PET] Loading/spinner elements:", spinners.length);
          for (const s of spinners.slice(0, 5)) {
            try {
              console.error("  -", s.tagName, "class=", safeClassName(s).slice(0, 80));
            } catch {}
          }

          // 5. 探测带有特定文本的元素（可能的状态指示器）——限制范围避免性能问题
          const keywords = ["thinking", "generating", "typing", "停止", "stop", "发送", "send", "处理中"];
          const limitedScope = document.querySelector("main") || document.querySelector("[class*='chat']") || document.body;
          const allTextEls = limitedScope.querySelectorAll("div, span, button, p");
          const matches = [];
          let checked = 0;
          for (const el of allTextEls) {
            if (checked++ > 500) break; // 限制数量
            try {
              const text = (el.innerText || "").toLowerCase().trim();
              if (text.length > 0 && text.length < 40 && keywords.some((k) => text.includes(k))) {
                matches.push({ text: el.innerText.trim().slice(0, 40), tag: el.tagName, class: safeClassName(el).slice(0, 60) });
              }
            } catch {}
          }
          if (matches.length > 0) {
            console.error("[DSH-PET] Keyword matches:", matches.slice(0, 15));
          }

          console.error("[DSH-PET] ====== END DIAGNOSTICS ======");
        } catch (err) {
          console.error("[DSH-PET] Diagnostics error:", err);
        }
      }

      detectState() {
        try {
          const prevState = this.currentState;
          let newState = "idle";

          // 策略 1：检测"停止生成"按钮（最可靠的 answering 指示器）
          const hasStopBtn = this.checkStopButton();

          // 策略 2：检测 loading / spinner
          const hasLoading = this.checkLoading();

          // 策略 3：检测输入框是否被禁用（发送后通常禁用直到回复完成）
          const inputDisabled = this.checkInputDisabled();

          // 策略 4：检测是否有待审批的 approval 面板
          const hasApproval = this.checkApproval();
          const now = Date.now();
          if (hasApproval) {
            this.approvalSince = now;
          }
          // approval 状态有 2 秒粘性：一旦检测到，即使短暂消失也保持
          const stickyApproval = this.approvalSince > 0 && now - this.approvalSince < 2000;

          // 策略 5：检测是否正在回答（无停止按钮时备用）
          const isAnswering = hasStopBtn || this.checkAnswering();

          // 状态推断（优先级：approval > answering > thinking > idle）
          if (hasApproval || stickyApproval) {
            newState = "approval"; // 有待审批请求，最高优先级
          } else if (isAnswering) {
            newState = "answering"; // AI 正在输出
          } else if (hasLoading) {
            newState = "thinking"; // 有 loading = 思考中
          } else if (inputDisabled) {
            newState = "thinking"; // 输入禁用且无 answering 特征 = 思考中
          }

          if (newState !== prevState) {
            console.error(
              "[DSH-PET] DOM State:", prevState, "->", newState,
              "{approval:", hasApproval, ", sticky:", stickyApproval, ", answering:", isAnswering, ", loading:", hasLoading, ", inputDisabled:", inputDisabled, "}"
            );
            this.currentState = newState;
            this.onStateChange(newState);
          }
        } catch (err) {
          console.error("[DSH-PET] detectState error:", err);
        }
      }

      checkStopButton() {
        try {
          // 只查找包含 "stop" 或 "停止" 的按钮，忽略 "cancel"（太容易误匹配）
          const stopKeywords = ["停止生成", "停止", "stop generating", "stop"];
          const btns = document.querySelectorAll("button, [role='button']");
          for (const btn of btns) {
            const text = (btn.innerText || btn.textContent || "").toLowerCase().trim();
            if (stopKeywords.some((k) => text === k || text.startsWith(k + " "))) {
              const style = window.getComputedStyle(btn);
              if (style.display !== "none" && style.visibility !== "hidden") {
                return true;
              }
            }
          }
        } catch {}
        return false;
      }

      checkLoading() {
        try {
          // 限制在 main/chat 区域搜索，避免匹配到全局 loading
          const scope = document.querySelector("main") || document.querySelector("[class*='chat']") || document.body;
          const selectors = [
            '[class*="loading"]',
            '[class*="spinner"]',
            '[class*="progress"]',
            '[class*="typing"]',
            '[class*="skeleton"]',
            'svg[class*="spin"]',
            'svg[class*="animate-spin"]',
            '[class*="animate-pulse"]',
          ];
          for (const sel of selectors) {
            try {
              const el = scope.querySelector(sel);
              if (el) {
                const style = window.getComputedStyle(el);
                if (style.display !== "none" && style.visibility !== "hidden") {
                  return true;
                }
              }
            } catch {}
          }
        } catch {}
        return false;
      }

      checkInputDisabled() {
        try {
          // 只检测 DSH 的 composer 输入框（通常是 textarea 或 contenteditable）
          const inputs = document.querySelectorAll("textarea, [contenteditable='true']");
          for (const inp of inputs) {
            // 排除设置面板等非 chat 区域的输入框
            const inChat = inp.closest("[class*='chat'], [class*='composer'], main") !== null;
            if (!inChat) continue;
            if (inp.disabled || inp.readOnly) return true;
            const style = window.getComputedStyle(inp);
            if (style.pointerEvents === "none" || parseFloat(style.opacity) < 0.5) return true;
          }
        } catch {}
        return false;
      }

      checkAnswering() {
        try {
          // 备用 answering 检测：只在输入框被禁用时运行
          if (!this.checkInputDisabled()) return false;

          // 检测消息列表末尾是否有明确的流式输出指示器
          const msgSelectors = [
            '[data-testid*="message"]',
            '[class*="message-list"] > div',
            '[class*="chat-list"] > div',
          ];
          let lastMsg = null;
          for (const sel of msgSelectors) {
            try {
              const msgs = document.querySelectorAll(sel);
              if (msgs.length > 0) {
                lastMsg = msgs[msgs.length - 1];
                break;
              }
            } catch {}
          }
          if (!lastMsg) return false;

          // 严格检测：必须是包含闪烁光标或 "▌" 字符的元素
          // 注意：[class*="cursor"] 太宽泛，改用精确匹配
          const hasTypingIndicator = lastMsg.querySelector('[class*="typing-indicator"], [class*="cursor-blink"], [class*="stream-cursor"]') !== null;
          if (hasTypingIndicator) return true;

          const text = lastMsg.innerText || "";
          if (text.includes("▌")) return true;
        } catch {}
        return false;
      }

      checkApproval() {
        try {
          const approvalEl = document.querySelector('[data-approval-key]');
          if (approvalEl) {
            const style = window.getComputedStyle(approvalEl);
            if (style.display !== "none" && style.visibility !== "hidden") {
              return true;
            }
          }
          const btns = document.querySelectorAll("button, [role='button']");
          let hasReject = false;
          let hasAllow = false;
          for (const btn of btns) {
            const text = (btn.innerText || btn.textContent || "").trim();
            if (text === "拒绝" || text === "Reject") hasReject = true;
            if (text === "允许一次" || text === "Allow once") hasAllow = true;
          }
          return hasReject && hasAllow;
        } catch {}
        return false;
      }

      destroy() {
        if (this.observer) this.observer.disconnect();
        if (this.pollTimer) clearInterval(this.pollTimer);
      }
    }

    // ── 状态管理 ──
    class PetController {
      constructor(overlay) {
        console.error('[DSH-PET] PetController constructor');
        this.overlay = overlay;
        this.currentState = "idle";
        this.scale = DEFAULT_SCALE;
        this.customGifs = {};
        this.config = loadLocalConfig();
        this.dragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.defaultGifUrls = {}; // state -> blob URL
        this.setupDrag();
        this.setupClick();
        this.setupImgError();
        this.dshStateDetector = new DshStateDetector((state) => {
          this.setState(state);
        });
        this.loadConfig();
        this.preloadDefaultGifs();
        // 应用初始显示状态（createPetOverlay 已读取 localStorage，这里再确认一次）
        const shouldShow = localStorage.getItem(VISIBILITY_KEY) !== "false";
        if (!shouldShow) {
          this.hide();
        }
      }

      async preloadDefaultGifs() {
        console.error('[DSH-PET] preloadDefaultGifs start');
        for (const s of STATES) {
          try {
            const url = `${API_BASE}/default-gif/${s}`;
            console.error('[DSH-PET] fetching', url);
            const r = await fetch(url);
            console.error('[DSH-PET] fetch', s, 'status=', r.status);
            if (r.ok) {
              const blob = await r.blob();
              this.defaultGifUrls[s] = URL.createObjectURL(blob);
              console.error('[DSH-PET] blob URL created for', s, 'size=', blob.size);
            } else {
              console.error('[DSH-PET] fetch failed for', s, 'status=', r.status);
            }
          } catch (e) {
            console.error(`[DSH-PET] 预加载默认GIF ${s} 失败:`, e);
          }
        }
        console.error('[DSH-PET] preloadDefaultGifs done, urls=', Object.keys(this.defaultGifUrls));
        // 预加载完成后重新渲染
        this.render();
      }

      setupImgError() {
        this.overlay.img.addEventListener("error", () => {
          this.overlay.img.style.display = "none";
          const fallback = document.getElementById("dsh-pet-fallback");
          if (fallback) {
            fallback.style.display = "flex";
            fallback.className = "";
            fallback.classList.add(this.currentState || "idle");
          }
        });
        this.overlay.img.addEventListener("load", () => {
          this.overlay.img.style.display = "";
          const fallback = document.getElementById("dsh-pet-fallback");
          if (fallback) fallback.style.display = "none";
        });
      }

      async loadConfig() {
        try {
          const r = await fetchJson("/config");
          if (r.ok) {
            Object.assign(this.config, r.config);
            saveLocalConfig(this.config);
            this.applyScale(this.config.scale ?? DEFAULT_SCALE);
          }
        } catch {}
        // 加载自定义 GIF（base64 存 localStorage）
        for (const state of STATES) {
          const key = `dsh-pet:gif:${state}`;
          const data = localStorage.getItem(key);
          if (data) this.customGifs[state] = data;
        }
        this.render();
        // 恢复位置
        const pos = loadPosition();
        if (pos) {
          this.overlay.container.style.left = pos.x + "px";
          this.overlay.container.style.top = pos.y + "px";
          this.overlay.container.style.right = "auto";
          this.overlay.container.style.bottom = "auto";
        }
      }

      applyScale(scale) {
        this.scale = Math.max(0.5, Math.min(2.5, scale || DEFAULT_SCALE));
        const size = 220 * this.scale;
        this.overlay.container.style.width = size + "px";
        this.overlay.container.style.height = size + "px";
      }

      setState(state) {
        if (state === "turn-done") return;
        if (this.currentState === state) return;

        const wasApproval = this.currentState === "approval";
        this.currentState = state;
        this.render();
        this.updateDot(state);
        if (state === "approval" && !wasApproval && this.config.alertApproval) {
          this.alertHop();
          if (this.config.alertSound) this.chime();
        }
        // 离开 approval 状态时停止弹跳动画
        if (wasApproval && state !== "approval") {
          this.overlay.container.classList.remove("dsh-pet-alert-hop");
        }
      }

      onTurnDone() {
        if (this.config.alertDone) {
          this.doneHop();
          if (this.config.alertDoneSound) this.doneChime();
        }
      }

      updateDot(state) {
        const colors = {
          thinking: "#f39c12",
          answering: "#3498db",
          approval: "#e74c3c",
          idle: "#2ecc71",
        };
        this.overlay.dot.style.background = colors[state] || "#888";
      }

      render() {
        const state = this.currentState;
        let url = this.customGifs[state] || this.customGifs.idle;
        if (!url) {
          url = this.defaultGifUrls[state];
        }
        if (!url) {
          url = `${API_BASE}/default-gif/${state}`;
          console.error('[DSH-PET] render fallback URL=', url);
        }
        console.error('[DSH-PET] render state=', state, 'url=', url);
        const fallback = document.getElementById("dsh-pet-fallback");
        if (fallback) fallback.style.display = "none";
        this.overlay.img.style.display = "";
        if (this.overlay.img.src !== url) {
          this.overlay.img.src = url;
        }
        this.overlay.img.style.filter = "";
      }

      setupDrag() {
        const el = this.overlay.container;
        el.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          this.dragging = true;
          this.dragOffset.x = e.clientX - el.offsetLeft;
          this.dragOffset.y = e.clientY - el.offsetTop;
          el.style.cursor = "grabbing";
        });
        window.addEventListener("mousemove", (e) => {
          if (!this.dragging) return;
          e.preventDefault();
          let x = e.clientX - this.dragOffset.x;
          let y = e.clientY - this.dragOffset.y;
          const maxX = window.innerWidth - el.offsetWidth;
          const maxY = window.innerHeight - el.offsetHeight;
          x = Math.max(0, Math.min(x, maxX));
          y = Math.max(0, Math.min(y, maxY));
          el.style.left = x + "px";
          el.style.top = y + "px";
          el.style.right = "auto";
          el.style.bottom = "auto";
        });
        window.addEventListener("mouseup", () => {
          if (!this.dragging) return;
          this.dragging = false;
          el.style.cursor = "grab";
          savePosition({ x: el.offsetLeft, y: el.offsetTop });
        });
        window.addEventListener("resize", () => {
          const rect = el.getBoundingClientRect();
          const maxX = window.innerWidth - el.offsetWidth;
          const maxY = window.innerHeight - el.offsetHeight;
          let x = Math.max(0, Math.min(rect.left, maxX));
          let y = Math.max(0, Math.min(rect.top, maxY));
          if (x !== rect.left || y !== rect.top) {
            el.style.left = x + "px";
            el.style.top = y + "px";
            el.style.right = "auto";
            el.style.bottom = "auto";
            savePosition({ x, y });
          }
        });
      }

      show() {
        this.overlay.container.style.display = "flex";
        localStorage.setItem(VISIBILITY_KEY, "true");
      }

      hide() {
        this.overlay.container.style.display = "none";
        localStorage.setItem(VISIBILITY_KEY, "false");
      }

      setupClick() {
        const el = this.overlay.container;
        let patDown = null;
        let lastClick = 0;
        el.addEventListener("mousedown", (e) => {
          if (e.button === 0) patDown = { x: e.screenX, y: e.screenY, time: Date.now() };
        });
        el.addEventListener("mouseup", (e) => {
          if (e.button !== 0 || !patDown) return;
          const moved = Math.hypot(e.screenX - patDown.x, e.screenY - patDown.y);
          const dt = Date.now() - patDown.time;
          patDown = null;
          // 移动距离过大或按压时间过长视为拖动，不触发点击
          if (moved > 6 || dt > 400) return;
          const now = Date.now();
          if (now - lastClick < 300) {
            // 双击
            lastClick = 0;
            this.onDblClick(e);
          } else {
            lastClick = now;
            setTimeout(() => {
              if (lastClick) {
                lastClick = 0;
                this.pat(e);
              }
            }, 300);
          }
        });
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this.openSettings();
        });
      }

      async onDblClick(e) {
        const action = this.config.dblclickAction || "pat";
        if (action === "pat") {
          this.pat(e);
        }
      }

      pat(e) {
        const img = this.overlay.img;
        img.classList.remove("dsh-pet-pat");
        void img.offsetWidth;
        img.classList.add("dsh-pet-pat");
        setTimeout(() => img.classList.remove("dsh-pet-pat"), 450);
        this.spawnHearts(e.clientX, e.clientY);
      }

      spawnHearts(x, y) {
        const container = this.overlay.heartsContainer;
        if (!container) {
          console.error("[DSH-PET] spawnHearts: heartsContainer is null!");
          return;
        }
        const rect = this.overlay.container.getBoundingClientRect();
        const colors = ["#ff6b8a", "#ff8fa3", "#e0453a", "#ffb3c1"];
        const count = 3 + Math.floor(Math.random() * 3);
        console.error("[DSH-PET] spawnHearts:", count, "hearts at", x, y, "container rect:", rect.left, rect.top);
        for (let i = 0; i < count; i++) {
          const h = document.createElement("span");
          h.textContent = "♥";
          const size = 44 + Math.random() * 36; // 大一倍：44-80px
          const color = colors[Math.floor(Math.random() * colors.length)];
          const dx = (Math.random() - 0.5) * 80;
          const rot = (Math.random() - 0.5) * 50;
          const localX = x - rect.left;
          const localY = y - rect.top;
          // 确保位置在容器范围内，不会被 overflow:hidden 裁剪
          const left = Math.max(0, Math.min(220 - size, localX - size / 2 + dx * 0.5));
          const top = Math.max(0, Math.min(220 - size, Math.max(localY, 20) - size / 2));
          h.style.cssText = "position:absolute;display:inline-block;z-index:11;pointer-events:none;line-height:1;font-size:" + size + "px;color:" + color + ";left:" + left + "px;top:" + top + "px;animation:dsh-pet-heart-float 0.9s ease-out forwards;";
          h.style.setProperty("--dx", dx + "px");
          h.style.setProperty("--rot", rot + "deg");
          h.addEventListener("animationend", () => h.remove());
          container.appendChild(h);
          console.error("[DSH-PET] heart appended:", i, "left:", left, "top:", top, "size:", size);
        }
      }

      alertHop() {
        const el = this.overlay.container;
        el.classList.remove("dsh-pet-alert-hop", "dsh-pet-done-hop");
        void el.offsetWidth;
        el.classList.add("dsh-pet-alert-hop");
      }

      doneHop() {
        const el = this.overlay.container;
        el.classList.remove("dsh-pet-alert-hop", "dsh-pet-done-hop");
        void el.offsetWidth;
        el.classList.add("dsh-pet-done-hop");
        setTimeout(() => el.classList.remove("dsh-pet-done-hop"), 3700);
      }

      chime() {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          for (const t of [0, 0.2]) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.08, ctx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.16);
          }
        } catch {}
      }

      doneChime() {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          [523, 659, 784].forEach((f, i) => {
            const t = i * 0.15;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0.08, ctx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.26);
          });
        } catch {}
      }

      openSettings() {
        // 通过事件通知设置面板打开
        window.dispatchEvent(new CustomEvent("dsh-pet:open-settings"));
      }

      saveUserConfig() {
        saveLocalConfig(this.config);
        fetchJson("/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: this.config }),
        }).catch(() => {});
      }

      setCustomGif(state, dataUrl) {
        const key = `dsh-pet:gif:${state}`;
        if (dataUrl) {
          localStorage.setItem(key, dataUrl);
          this.customGifs[state] = dataUrl;
        } else {
          localStorage.removeItem(key);
          delete this.customGifs[state];
        }
        this.render();
      }
    }

    // ── 设置面板 React 组件 ──
    function SettingsSection() {
      const React = require("react");
      const h = React.createElement;
      const { useState, useEffect, useCallback } = React;

      const [state, setState] = useState({
        visible: true,
        scale: 100,
        hideMode: "off",
        alertApproval: true,
        alertSound: false,
        alertDone: true,
        alertDoneSound: true,
        dblclickAction: "pat",
      });
      const [previews, setPreviews] = useState({});
      const [defaultPreviews, setDefaultPreviews] = useState({});
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState("");

      const load = useCallback(() => {
        const cfg = loadLocalConfig();
        setState({
          visible: localStorage.getItem(VISIBILITY_KEY) !== "false",
          scale: Math.round((cfg.scale ?? 1.0) * 100),
          hideMode: cfg.hideMode ?? "off",
          alertApproval: cfg.alertApproval ?? true,
          alertSound: cfg.alertSound ?? false,
          alertDone: cfg.alertDone ?? true,
          alertDoneSound: cfg.alertDoneSound ?? true,
          dblclickAction: cfg.dblclickAction ?? "pat",
        });
        const prevs = {};
        for (const s of STATES) {
          const key = `dsh-pet:gif:${s}`;
          const data = localStorage.getItem(key);
          prevs[s] = data || null;
        }
        setPreviews(prevs);
      }, []);

      // 预加载默认GIF为blob URL，用于设置面板预览
      useEffect(() => {
        async function preloadDefaults() {
          const blobs = {};
          for (const s of STATES) {
            try {
              const r = await fetch(`${API_BASE}/default-gif/${s}`);
              if (r.ok) {
                const blob = await r.blob();
                blobs[s] = URL.createObjectURL(blob);
              }
            } catch {}
          }
          setDefaultPreviews(blobs);
        }
        preloadDefaults();
        return () => {
          for (const url of Object.values(defaultPreviews)) {
            try { URL.revokeObjectURL(url); } catch {}
          }
        };
      }, []);

      useEffect(() => { load(); }, [load]);

      const save = useCallback(async (updates) => {
        const next = { ...state, ...updates };
        setState(next);
        if (updates.visible !== undefined) {
          localStorage.setItem(VISIBILITY_KEY, next.visible ? "true" : "false");
          // 双重保险：直接调用控制器 + 派发事件
          const ctrl = window.__DSH_PET_CONTROLLER__;
          if (ctrl) {
            if (next.visible) ctrl.show();
            else ctrl.hide();
          }
          window.dispatchEvent(new CustomEvent("dsh-pet:visible-changed", { detail: next.visible }));
        }
        const cfg = {
          scale: next.scale / 100,
          hideMode: next.hideMode,
          alertApproval: next.alertApproval,
          alertSound: next.alertSound,
          alertDone: next.alertDone,
          alertDoneSound: next.alertDoneSound,
          dblclickAction: next.dblclickAction,
        };
        saveLocalConfig(cfg);
        try {
          await fetchJson("/config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ config: cfg }),
          });
          // 通知宠物控制器更新
          window.dispatchEvent(new CustomEvent("dsh-pet:config-changed", { detail: cfg }));
        } catch {}
      }, [state]);

      const pickGif = (s) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".gif,image/gif";
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            localStorage.setItem(`dsh-pet:gif:${s}`, dataUrl);
            setPreviews((p) => ({ ...p, [s]: dataUrl }));
            window.dispatchEvent(new CustomEvent("dsh-pet:set-gif", { detail: { state: s, dataUrl } }));
          };
          reader.readAsDataURL(file);
        };
        input.click();
      };

      const clearGif = (s) => {
        localStorage.removeItem(`dsh-pet:gif:${s}`);
        setPreviews((p) => ({ ...p, [s]: null }));
        window.dispatchEvent(new CustomEvent("dsh-pet:set-gif", { detail: { state: s, dataUrl: null } }));
      };

      const labels = {
        thinking: "思考中",
        answering: "编辑中",
        approval: "待审核",
        idle: "空闲中",
      };

      const rowStyle = { display: "flex", alignItems: "center", gap: "12px", background: "var(--theme-card-bg,#fff)", border: "1px solid var(--theme-border,#e5e6ea)", borderRadius: "10px", padding: "12px", marginBottom: "10px" };
      const labelStyle = { width: "64px", fontWeight: 600, flexShrink: 0 };
      const previewStyle = {
        width: "64px", height: "64px", flexShrink: 0, borderRadius: "8px",
        background: "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 16px 16px",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: "24px",
      };
      const btnStyle = {
        border: "1px solid var(--theme-border,#d0d3d9)", background: "var(--theme-card-bg,#fff)",
        borderRadius: "8px", padding: "6px 12px", fontSize: "13px", cursor: "pointer",
      };

      return h("div", { style: { maxWidth: "760px", display: "flex", flexDirection: "column", gap: "10px" } },
        h("p", { style: { marginTop: 0, opacity: 0.75, fontSize: "13px" } }, "DSH 桌宠设置"),

        // 显示开关
        h("div", { style: rowStyle },
          h("div", { style: labelStyle }, "显示"),
          h("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" } },
            h("input", { type: "checkbox", checked: state.visible, onChange: (e) => save({ visible: e.target.checked }) }),
            state.visible ? "已显示" : "已隐藏",
          ),
        ),

        // 大小
        h("div", { style: rowStyle },
          h("div", { style: labelStyle }, "大小"),
          h("input", {
            type: "range", min: 50, max: 250, step: 5,
            value: state.scale,
            style: { flex: 1 },
            onChange: (e) => save({ scale: Number(e.target.value) }),
          }),
          h("span", { style: { width: "44px", textAlign: "right" } }, state.scale + "%"),
        ),

        // 双击动作
        h("div", { style: rowStyle },
          h("div", { style: labelStyle }, "双击"),
          h("select", {
            value: state.dblclickAction,
            style: { flex: 1, padding: "6px", fontSize: "13px" },
            onChange: (e) => save({ dblclickAction: e.target.value }),
          },
            h("option", { value: "pat" }, "摸头冒爱心"),
          ),
        ),

        // 提醒
        h("div", { style: rowStyle },
          h("div", { style: labelStyle }, "提醒"),
          h("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" } },
            h("input", { type: "checkbox", checked: state.alertApproval, onChange: (e) => save({ alertApproval: e.target.checked }) }),
            "审批时弹跳",
          ),
          h("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" } },
            h("input", { type: "checkbox", checked: state.alertSound, onChange: (e) => save({ alertSound: e.target.checked }) }),
            "提示音",
          ),
        ),

        // 完成提醒
        h("div", { style: rowStyle },
          h("div", { style: labelStyle }, "完成"),
          h("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" } },
            h("input", { type: "checkbox", checked: state.alertDone, onChange: (e) => save({ alertDone: e.target.checked }) }),
            "完成时弹跳",
          ),
          h("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" } },
            h("input", { type: "checkbox", checked: state.alertDoneSound, onChange: (e) => save({ alertDoneSound: e.target.checked }) }),
            "提示音",
          ),
        ),

        h("p", { style: { fontSize: "12px", color: "var(--theme-text-secondary,#888)", marginBottom: "8px" } },
          "为每种状态选一张透明底 GIF；未设置的状态会沿用「空闲中」的 GIF。"),

        // GIF 选择行
        ...STATES.map((s) => {
          const previewUrl = previews[s] || defaultPreviews[s] || null;
          return h("div", { key: s, style: rowStyle },
            h("div", { style: labelStyle }, labels[s]),
            h("div", { style: previewStyle },
              previewUrl ? h("img", { src: previewUrl, style: { maxWidth: "100%", maxHeight: "100%" } }) : "🐾",
            ),
            h("div", { style: { marginLeft: "auto", display: "flex", gap: "8px" } },
              h("button", { style: btnStyle, onClick: () => pickGif(s) }, "选择 GIF"),
              previews[s] ? h("button", { style: btnStyle, onClick: () => clearGif(s) }, "清除") : null,
            ),
          );
        }),
      );
    }

    // ── 注入样式 ──
    function injectStyles() {
      if (document.getElementById("dsh-pet-styles")) return;
      const style = document.createElement("style");
      style.id = "dsh-pet-styles";
      style.textContent = `
        @keyframes dsh-pet-pat-squish {
          0%   { transform: scale(1, 1); }
          25%  { transform: scale(1.12, 0.85); }
          50%  { transform: scale(0.94, 1.0); }
          70%  { transform: scale(1.04, 0.96); }
          85%  { transform: scale(0.98, 1.0); }
          100% { transform: scale(1, 1); }
        }
        .dsh-pet-pat {
          animation: dsh-pet-pat-squish 0.45s ease-out;
          transform-origin: 50% 100%;
        }
        @keyframes dsh-pet-alert-hop {
          0%, 100% { transform: translateY(0); }
          8%  { transform: translateY(-14px); }
          16% { transform: translateY(0); }
          24% { transform: translateY(-8px); }
          32% { transform: translateY(0); }
        }
        .dsh-pet-alert-hop {
          animation: dsh-pet-alert-hop 1.8s ease-in-out infinite;
        }
        .dsh-pet-done-hop {
          animation: dsh-pet-alert-hop 1.8s ease-in-out 2;
        }
        @keyframes dsh-pet-heart-float {
          0%   { opacity: 0; transform: translate(0, 0) scale(0.4); }
          15%  { opacity: 1; }
          65%  { opacity: 0; }
          100% { opacity: 0; transform: translate(var(--dx), -80px) scale(1) rotate(var(--rot)); }
        }
        @keyframes dsh-pet-fallback-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        #dsh-pet-fallback.thinking { background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%) !important; }
        #dsh-pet-fallback.answering { background: linear-gradient(135deg, #3498db 0%, #2980b9 100%) !important; }
        #dsh-pet-fallback.approval { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%) !important; }
        #dsh-pet-fallback.idle { background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%) !important; }
        #dsh-pet-fallback.offline { background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%) !important; filter: grayscale(1) opacity(0.45); }
      `;
      document.head.appendChild(style);
    }

    // ── 插件 apply ──
    function apply(ctx) {
      console.error('[DSH-PET] ========== CLIENT APPLY START ==========');
      try {
        injectStyles();
        console.error('[DSH-PET] styles injected');
        const overlay = createPetOverlay();
        console.error('[DSH-PET] overlay created');
        const controller = new PetController(overlay);
        console.error('[DSH-PET] controller created, state=' + controller.currentState);

        // 将控制器挂载到全局，供设置面板直接调用（比 CustomEvent 更可靠）
        window.__DSH_PET_CONTROLLER__ = controller;

        // 监听配置变化
        window.addEventListener("dsh-pet:config-changed", (e) => {
          if (e.detail.scale !== undefined) controller.applyScale(e.detail.scale);
          Object.assign(controller.config, e.detail);
        });
        window.addEventListener("dsh-pet:set-gif", (e) => {
          controller.setCustomGif(e.detail.state, e.detail.dataUrl);
        });
        window.addEventListener("dsh-pet:visible-changed", (e) => {
          if (e.detail) controller.show();
          else controller.hide();
        });

        // 注册设置面板
        try {
          ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
            name: "settings.section",
            id: "dsh-pet",
            order: 45,
            label: () => "桌宠设置",
          }, () => require("react").createElement(SettingsSection, null))), "pet: settings");
          console.error('[DSH-PET] settings section registered');
        } catch (slotErr) {
          console.error('[DSH-PET] settings section registration failed:', slotErr);
        }
      } catch (err) {
        console.error('[DSH-PET] ========== CLIENT APPLY ERROR ==========', err);
      }
      console.error('[DSH-PET] ========== CLIENT APPLY END ==========');

      // 预加载 idle GIF（如果 blob URL 还未创建）
      setTimeout(async () => {
        try {
          if (!controller.defaultGifUrls.idle) {
            const gifRes = await fetch(API_BASE + "/default-gif/idle");
            if (gifRes.ok) {
              const blob = await gifRes.blob();
              controller.defaultGifUrls.idle = URL.createObjectURL(blob);
              controller.render();
            }
          }
        } catch {}
      }, 1500);
    }

    exports.name = "dsh-pet";
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
