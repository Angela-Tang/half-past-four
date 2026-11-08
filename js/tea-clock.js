/*
 * The tea clock: how long until half past four, in the visitor's own time zone.
 */
(function () {
  "use strict";

  const timeEl = document.getElementById("clock-time");
  const messageEl = document.getElementById("clock-message");
  if (!timeEl || !messageEl) {
    return;
  }

  const TEA_HOUR = 16;
  const TEA_MINUTE = 30;
  const TEA_ENDS_HOUR = 18;

  const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

  function describeWait(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const parts = [];
    if (hours) {
      parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    }
    if (mins || !hours) {
      parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
    }
    return parts.join(" and ");
  }

  function messageFor(now) {
    const teaTime = new Date(now);
    teaTime.setHours(TEA_HOUR, TEA_MINUTE, 0, 0);
    const minutesLeft = Math.ceil((teaTime - now) / 60000);
    const hour = now.getHours();

    if (minutesLeft > 0 && hour < 12) {
      return `Good morning. Tea is served in ${describeWait(minutesLeft)}, so there's plenty of time to choose.`;
    }
    if (minutesLeft > 60) {
      return `Tea is served in ${describeWait(minutesLeft)}. The kettle's warming up.`;
    }
    if (minutesLeft > 0) {
      return `Only ${describeWait(minutesLeft)} to go. Start choosing your treats.`;
    }
    if (hour < TEA_ENDS_HOUR) {
      return "It's tea time. The kettle's on and the scones are warm.";
    }
    return "Tea was served at half past four, but we never really close.";
  }

  function tick() {
    const now = new Date();
    timeEl.textContent = timeFormat.format(now);
    timeEl.dateTime = now.toISOString();
    messageEl.textContent = messageFor(now);
  }

  tick();
  setInterval(tick, 15000);
})();
