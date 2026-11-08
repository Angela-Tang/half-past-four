/*
 * Title letters that turn into dessert stickers on hover.
 * Interaction adapted from the boknows text-image template (MIT):
 * https://github.com/boknowsworld/boknows-text-image-template
 * Use the site's matching pastel illustrations for a consistent cover.
 */
(function (HPF) {
  "use strict";

  const container = document.querySelector("[data-title-letters]");
  if (!container) {
    return;
  }

  const hasGsap = typeof window.gsap !== "undefined";
  const reduceMotion = HPF.prefersReducedMotion();
  const MAX_ACTIVE = 4;
  const ANGLES = [-9, 7, -5, 8, -6, 5, -4];
  const TOUCH_HOLD_MS = 1200;
  const IDLE_HOLD_MS = 1100;

  const letters = [];
  let activeQueue = [];
  let idleTimer = null;
  let pointerInside = false;
  let paused = false;

  document.getElementById("toggle-title-motion")?.addEventListener("click", (event) => {
    paused = !paused;
    event.currentTarget.setAttribute("aria-pressed", String(paused));
    event.currentTarget.textContent = paused ? "Resume playful letters" : "Pause playful letters";
    clearTimeout(idleTimer);
    if (paused) letters.forEach((letter) => hide(letter));
    else scheduleIdle();
  });

  buildLetters(container.textContent.trim());
  loadStickers();

  /* ---------- Markup ---------- */

  function buildLetters(text) {
    container.textContent = "";

    text.split(/\s+/).forEach((word) => {
      const wordEl = document.createElement("span");
      wordEl.className = "title-word";

      for (const character of word) {
        const letterEl = document.createElement("span");
        letterEl.className = "letter";

        const charEl = document.createElement("span");
        charEl.className = "letter-char";
        charEl.textContent = character;
        letterEl.append(charEl);
        wordEl.append(letterEl);

        const letter = {
          el: letterEl,
          index: letters.length,
          images: [],
          lastImage: null,
          active: false,
          hideTimer: null,
        };
        letters.push(letter);

        letterEl.addEventListener("pointerenter", (event) => {
          show(letter, { holdFor: event.pointerType === "mouse" ? 0 : TOUCH_HOLD_MS });
        });
        letterEl.addEventListener("pointerleave", (event) => {
          if (event.pointerType === "mouse") {
            hide(letter);
          }
        });
      }

      container.append(wordEl);
    });

    container.addEventListener("pointerenter", () => {
      pointerInside = true;
      clearTimeout(idleTimer);
    });
    container.addEventListener("pointerleave", () => {
      pointerInside = false;
      scheduleIdle();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearTimeout(idleTimer);
      } else {
        scheduleIdle();
      }
    });
  }

  /* ---------- Images ---------- */

  async function loadStickers() {
    const coverFood = new Set([
      "scone",
      "victoria-sponge",
      "lemon-drizzle",
      "strawberry-tart",
      "chocolate-eclair",
      "battenberg",
    ]);
    const sources = HPF.shuffle(HPF.menu.filter((item) => coverFood.has(item.id))).map(
      (asset) => `assets/art/${asset.id}-200.webp`,
    );
    if (!sources.length) {
      return;
    }

    const loaded = await preload(sources);
    if (!loaded.length) {
      return;
    }

    letters.forEach((letter, i) => {
      letter.images = [loaded[(i * 2) % loaded.length], loaded[(i * 2 + 1) % loaded.length]];
    });

    container.classList.add("is-ready");
    playIntro();
  }

  async function preload(sources) {
    const results = await Promise.allSettled(
      sources.map((src) => {
        const image = new Image();
        image.src = src;
        return image.decode().then(() => src);
      }),
    );
    return results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  }

  function pickImage(letter) {
    const fresh = letter.images.filter((src) => src !== letter.lastImage);
    const pool = fresh.length ? fresh : letter.images;
    const src = pool[Math.floor(Math.random() * pool.length)];
    letter.lastImage = src;
    return src;
  }

  /* ---------- Show / hide ---------- */

  function show(letter, { holdFor = 0 } = {}) {
    if (paused || !letter.images.length) {
      return;
    }

    clearTimeout(letter.hideTimer);
    removeSticker(letter.el.querySelector(".sticker"));

    const angle = ANGLES[letter.index % ANGLES.length];
    const sticker = document.createElement("span");
    sticker.className = "sticker";
    sticker.style.setProperty("--angle", `${angle}deg`);

    const image = document.createElement("img");
    image.src = pickImage(letter);
    image.width = 200;
    image.height = image.src.includes("chocolate-eclair")
      ? 133
      : image.src.includes("battenberg")
        ? 183
        : 200;
    image.alt = "";
    image.draggable = false;
    sticker.append(image);

    letter.el.append(sticker);
    letter.el.classList.add("is-active");
    letter.active = true;

    if (hasGsap && !reduceMotion) {
      gsap.fromTo(
        sticker,
        { xPercent: -50, yPercent: -50, scale: 0.3, rotation: angle - 14, autoAlpha: 0 },
        { scale: 1, rotation: angle, autoAlpha: 1, duration: 0.65, ease: "elastic.out(1, 0.55)" },
      );
      // Make room so the round sticker doesn't cover its neighbours.
      gsap.to(letter.el, {
        paddingLeft: "0.2em",
        paddingRight: "0.2em",
        duration: 0.45,
        ease: "power3.out",
      });
    }

    activeQueue = activeQueue.filter((item) => item !== letter);
    activeQueue.push(letter);
    while (activeQueue.length > MAX_ACTIVE) {
      hide(activeQueue.shift());
    }

    if (holdFor) {
      letter.hideTimer = setTimeout(() => hide(letter), holdFor);
    }
  }

  function hide(letter) {
    clearTimeout(letter.hideTimer);
    if (!letter.active) {
      return;
    }

    letter.active = false;
    letter.el.classList.remove("is-active");
    activeQueue = activeQueue.filter((item) => item !== letter);

    const sticker = letter.el.querySelector(".sticker");
    if (hasGsap && !reduceMotion) {
      gsap.to(letter.el, { paddingLeft: 0, paddingRight: 0, duration: 0.5, ease: "power3.out" });
      if (sticker) {
        sticker.classList.add("is-leaving");
        gsap.to(sticker, {
          scale: 0.35,
          autoAlpha: 0,
          duration: 0.45,
          ease: "power3.in",
          onComplete: () => sticker.remove(),
        });
      }
    } else {
      removeSticker(sticker);
    }
  }

  function removeSticker(sticker) {
    if (!sticker) {
      return;
    }
    if (hasGsap) {
      gsap.killTweensOf(sticker);
    }
    sticker.remove();
  }

  /* ---------- Intro and idle play ---------- */

  function playIntro() {
    if (reduceMotion) {
      return;
    }

    letters.forEach((letter, i) => {
      setTimeout(() => show(letter), i * 70);
    });

    const revealTime = letters.length * 70 + 700;
    HPF.shuffle(letters).forEach((letter, i) => {
      setTimeout(() => hide(letter), revealTime + i * 55);
    });

    setTimeout(scheduleIdle, revealTime + letters.length * 55 + 800);
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (
      paused ||
      reduceMotion ||
      pointerInside ||
      document.hidden ||
      !container.classList.contains("is-ready")
    ) {
      return;
    }

    idleTimer = setTimeout(
      () => {
        const resting = letters.filter((letter) => !letter.active && letter.images.length);
        if (resting.length) {
          const letter = resting[Math.floor(Math.random() * resting.length)];
          show(letter, { holdFor: IDLE_HOLD_MS });
        }
        scheduleIdle();
      },
      1600 + Math.random() * 1600,
    );
  }
})(window.HPF);
