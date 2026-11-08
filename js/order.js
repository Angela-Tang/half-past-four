/* The tea-room order: the browser brews, remembers and lets the guest know when tea is ready. */
(function (HPF) {
  "use strict";

  const get = (id) => document.getElementById(id);
  const orderKey = "hpf.order.v1";
  const guestKey = "hpf.guest.v1";
  const byId = new Map(HPF.menu.map((item) => [item.id, item]));
  const brewSeconds = { teacup: 180, "english-breakfast": 240, darjeeling: 180, chamomile: 240 };
  const canNotify = typeof window.Notification === "function" && window.isSecureContext;
  let order = readOrder();
  let timer = null;
  let lastPhase = null;

  const guest = HPF.storage.get(guestKey);
  if (typeof guest === "string" && guest.trim().length > 0 && guest.length <= 40) {
    get("guest-name").value = guest;
    get("returning-guest").hidden = false;
    get("returning-guest").textContent = `Welcome back, ${guest}. Your table is waiting.`;
  }

  document.addEventListener("hpf:stand", renderPreview);
  document.addEventListener("visibilitychange", tick);
  get("guest-name").addEventListener("input", () => {
    get("name-error").textContent = "";
    get("guest-name").setAttribute("aria-invalid", "false");
  });
  get("order-form").addEventListener("submit", placeOrder);
  get("checkout-stand").addEventListener("click", () => {
    get("tea-order").scrollIntoView({
      behavior: HPF.prefersReducedMotion() ? "instant" : "smooth",
    });
    (order ? get("order-status-heading") : get("guest-name")).focus({ preventScroll: true });
  });
  get("enable-notification").addEventListener("click", enableNotifications);
  get("cancel-order").addEventListener("click", resetOrder);
  get("another-tea").addEventListener("click", resetOrder);
  get("download-receipt").addEventListener("click", downloadReceipt);
  window.addEventListener("storage", (event) => {
    if (event.key === orderKey) {
      order = readOrder();
      lastPhase = null;
      renderOrder();
    }
  });
  renderPreview();
  renderOrder();

  function readOrder() {
    const saved = HPF.storage.get(orderKey);
    if (
      !saved ||
      saved.version !== 1 ||
      typeof saved.id !== "string" ||
      !/^[a-z0-9-]{1,80}$/.test(saved.id)
    )
      return null;
    if (typeof saved.guest !== "string" || !saved.guest.trim() || saved.guest.length > 40)
      return null;
    if (
      !Number.isFinite(saved.createdAt) ||
      !Number.isFinite(saved.readyAt) ||
      saved.createdAt <= 0 ||
      saved.readyAt <= saved.createdAt ||
      saved.readyAt - saved.createdAt > 600000
    )
      return null;
    if (!Array.isArray(saved.items) || !saved.items.length || saved.items.length > 6) return null;
    const seen = new Set();
    const courses = { savoury: 0, scones: 0, sweet: 0, tea: 0 };
    for (const item of saved.items) {
      const current = item && byId.get(item.id);
      if (
        !current ||
        seen.has(item.id) ||
        !Number.isInteger(item.priceCents) ||
        item.priceCents < 0 ||
        item.priceCents > 50000
      )
        return null;
      seen.add(item.id);
      courses[current.course] += 1;
    }
    if (courses.tea !== 1 || courses.savoury > 2 || courses.scones > 1 || courses.sweet > 2)
      return null;
    return {
      version: 1,
      id: saved.id,
      guest: saved.guest.trim(),
      createdAt: saved.createdAt,
      readyAt: saved.readyAt,
      items: saved.items.map((item) => ({ id: item.id, priceCents: item.priceCents })),
      quick: saved.quick === true,
      notify: saved.notify === true,
      completed: saved.completed === true,
    };
  }

  function persist() {
    try {
      if (order) {
        localStorage.setItem(orderKey, JSON.stringify(order));
        localStorage.setItem(guestKey, JSON.stringify(order.guest));
      } else localStorage.removeItem(orderKey);
    } catch {
      get("order-storage-note").hidden = false;
    }
  }

  function renderPreview() {
    const items = HPF.getStand();
    const total = items.reduce((sum, item) => sum + item.priceCents, 0);
    const summary = document.createElement("p");
    summary.className = "preview-summary";
    summary.textContent = items.length
      ? `${items.length} little choice${items.length === 1 ? "" : "s"} · ${HPF.money(total)}`
      : "Your stand is waiting for a little something.";
    const names = document.createElement("p");
    names.textContent = items.map((item) => item.name).join(" · ");
    get("order-preview").replaceChildren(summary, names);
    const hasTea = items.some((item) => item.course === "tea");
    get("place-order").disabled = !hasTea;
    get("order-empty-hint").textContent = hasTea
      ? "Your choices will be kept on a separate order receipt. No charge."
      : "Choose a pot of tea from the menu before placing your order.";
    if (!hasTea) {
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "text-button";
      choose.textContent = "Choose a tea ↗";
      choose.addEventListener("click", () => {
        document.querySelector('[data-course="tea"]').click();
        get("menu").scrollIntoView({ behavior: HPF.prefersReducedMotion() ? "instant" : "smooth" });
      });
      get("order-preview").append(choose);
    }
  }

  function placeOrder(event) {
    event.preventDefault();
    if (order) return;
    const name = get("guest-name").value.trim();
    if (!name || name.length > 40) {
      get("name-error").textContent =
        "A first name, please, so we can call you when your tea is ready.";
      get("guest-name").setAttribute("aria-invalid", "true");
      get("guest-name").focus();
      return;
    }
    const items = HPF.getStand();
    const tea = items.find((item) => item.course === "tea");
    if (!tea) {
      renderPreview();
      return;
    }
    const quick = get("quick-brew").checked;
    const duration = quick ? 20 : brewSeconds[tea.id];
    const now = Date.now();
    order = {
      version: 1,
      id: `tea-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      guest: name,
      createdAt: now,
      readyAt: now + duration * 1000,
      quick,
      notify: false,
      completed: false,
      items: items.map((item) => ({ id: item.id, priceCents: item.priceCents })),
    };
    persist();
    lastPhase = null;
    renderOrder();
    get("order-status-heading").focus({ preventScroll: true });
  }

  function renderOrder() {
    clearInterval(timer);
    timer = null;
    get("order-form").hidden = Boolean(order);
    get("order-progress").hidden = !order;
    if (!order) return;
    renderReceipt();
    tick();
    if (!order.completed) timer = setInterval(tick, 1000);
  }

  function tick() {
    if (!order) return;
    const remaining = Math.max(0, order.readyAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const duration = order.readyAt - order.createdAt;
    get("brew-time").textContent =
      `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    get("brew-progress").value = Math.min(100, Math.max(0, 100 * (1 - remaining / duration)));
    const newlyReady = !order.completed && remaining === 0;
    if (newlyReady) {
      order.completed = true;
      persist();
    }
    const phase = order.completed ? "ready" : "brewing";
    if (phase !== lastPhase) {
      lastPhase = phase;
      get("brew-clock").hidden = order.completed;
      get("order-reminders").hidden = order.completed;
      get("tea-receipt").hidden = !order.completed;
      get("receipt-actions").hidden = !order.completed;
      get("cancel-order").hidden = order.completed;
      get("order-stage").textContent = order.completed
        ? "YOUR LITTLE AFTERNOON IS READY"
        : "A MOMENT FOR THE TEA";
      get("order-status-heading").textContent = order.completed
        ? `Tea is ready, ${order.guest}.`
        : `A little patience, ${order.guest}.`;
      if (order.completed) {
        get("order-status").textContent =
          "Your stand is served. The receipt below is yours to keep.";
      } else {
        const teaItem = order.items.find((item) => byId.get(item.id).course === "tea");
        const teaName = byId.get(teaItem.id).name;
        const pace = order.quick ? "with our 20-second quick brew" : "at its usual pace";
        get("order-status").textContent =
          `${teaName} is brewing ${pace}. You can keep browsing; your confirmed choices are saved.`;
      }
      notificationState();
      if (order.completed) HPF.motion?.receipt?.();
    }
    if (order.completed) {
      clearInterval(timer);
      timer = null;
    }
    if (newlyReady) {
      if (order.notify) notifyReady();
    }
  }

  function notificationState() {
    const button = get("enable-notification");
    if (!canNotify) {
      button.disabled = true;
      button.textContent = "Your reminder will appear here";
      get("notification-help").textContent =
        "System notifications aren't available in this browser. Keep the tab open for the ready message.";
    } else if (window.Notification.permission === "denied") {
      button.disabled = true;
      button.textContent = "Page reminder is on";
      get("notification-help").textContent =
        "Notifications are blocked. No problem; we'll tell you right here when tea is ready.";
    } else {
      button.disabled = order?.notify === true;
      button.textContent = order?.notify
        ? "Your notification is on"
        : "Notify me when it's ready ↗";
      get("notification-help").textContent = order?.notify
        ? "Keep this tab open. Your browser will try a system notification; the page will also show the ready message."
        : "Optional. The page will show a ready message either way. Keep this tab open.";
    }
  }

  async function enableNotifications() {
    if (!order || order.completed || !canNotify) return;
    const activeId = order.id;
    const button = get("enable-notification");
    button.disabled = true;
    try {
      const permission =
        window.Notification.permission === "granted"
          ? "granted"
          : await window.Notification.requestPermission();
      if (!order || order.id !== activeId) return;
      order.notify = permission === "granted";
      persist();
      notificationState();
      if (permission === "default")
        get("notification-help").textContent =
          "No permission needed for the page reminder. We'll show it here when tea is ready.";
      if (order.completed && order.notify) notifyReady();
    } catch {
      if (!order || order.id !== activeId) return;
      order.notify = false;
      button.disabled = false;
      get("notification-help").textContent =
        "The browser couldn't enable notifications. Your ready message will still appear on this page.";
    }
  }

  function notifyReady() {
    if (!order || !canNotify || window.Notification.permission !== "granted") return;
    try {
      new window.Notification("Half Past Four · Tea is ready", {
        body: `${order.guest}, your afternoon tea is ready!`,
        icon: "assets/favicon.svg",
        tag: order.id,
      });
    } catch {
      get("order-status").textContent =
        "Your tea is ready. A system notification wasn't available, so we've saved your reminder right here.";
    }
  }

  function renderReceipt() {
    get("receipt-guest").textContent = `A table for ${order.guest}`;
    get("receipt-meta").textContent =
      `${order.id.toUpperCase()} · ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(order.createdAt)}`;
    get("receipt-items").replaceChildren(
      ...order.items.map((item) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = byId.get(item.id).name;
        const price = document.createElement("span");
        price.textContent = HPF.money(item.priceCents);
        li.append(name, price);
        return li;
      }),
    );
    get("receipt-total").textContent = HPF.money(
      order.items.reduce((sum, item) => sum + item.priceCents, 0),
    );
  }

  function resetOrder() {
    if (order) get("guest-name").value = order.guest;
    clearInterval(timer);
    order = null;
    lastPhase = null;
    persist();
    renderOrder();
    renderPreview();
    get("guest-name").focus({ preventScroll: true });
  }

  function downloadReceipt() {
    if (!order?.completed) return;
    const lines = [
      "HALF PAST FOUR",
      "Tea room receipt",
      order.id.toUpperCase(),
      `A table for ${order.guest}`,
      new Date(order.createdAt).toLocaleString(),
      "",
      ...order.items.map((item) => `${byId.get(item.id).name} — ${HPF.money(item.priceCents)}`),
      "",
      `Total: ${HPF.money(order.items.reduce((sum, item) => sum + item.priceCents, 0))}`,
      "No charge. No restaurant order or booking submitted.",
      "Thank you for spending a little afternoon with us.",
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `half-past-four-${order.id}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})(window.HPF);
