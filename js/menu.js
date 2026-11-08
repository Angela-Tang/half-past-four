/* The stand feeds both the tea-room order and a downloadable tasting plan. */
(function (HPF) {
  "use strict";

  const menu = HPF.menu;
  const byId = new Map(menu.map((item) => [item.id, item]));
  const limits = { savoury: 2, scones: 1, sweet: 2, tea: 1 };
  const labels = {
    savoury: "First course · Savouries",
    scones: "Second course · Scones & warm bakes",
    sweet: "Third course · Little bakes",
    tea: "A pot of tea",
  };
  const storageKey = "hpf.tasting-plan.v1";
  const grid = document.getElementById("menu-grid");
  const dialog = document.getElementById("recipe-dialog");
  const recipeBody = document.getElementById("recipe-body");
  const recipeCache = new Map();
  let selected = readPlan();
  let currentCourse = "savoury";
  let toastTimer;
  let detailRequest = 0;
  let detailItemId = null;
  let storageAvailable = true;
  const useFahrenheit = /-US$/i.test(navigator.language || "");

  HPF.getStand = () => selected.map((id) => ({ ...byId.get(id) }));
  HPF.money = (cents) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(cents / 100);

  document.querySelectorAll("[data-course]").forEach((button) => {
    button.addEventListener("click", () => setCourse(button.dataset.course));
  });
  document.querySelectorAll("[data-show-course]").forEach((button) => {
    button.addEventListener("click", () => {
      setCourse(button.dataset.showCourse);
      document
        .getElementById("menu")
        .scrollIntoView({ behavior: HPF.prefersReducedMotion() ? "instant" : "smooth" });
    });
  });
  document.getElementById("surprise-me").addEventListener("click", surpriseMe);
  document.getElementById("clear-stand").addEventListener("click", () => {
    selected = [];
    updatePlan();
    showToast("A fresh start. Your stand is ready for new favourites.");
  });
  document.getElementById("save-tea").addEventListener("click", saveTeaCard);
  document.getElementById("print-guide").addEventListener("click", () => window.print());
  document.getElementById("close-recipe").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    detailRequest += 1;
    grid
      .querySelector(`[data-menu-item="${detailItemId}"] .menu-image`)
      ?.focus({ preventScroll: true });
  });
  document.addEventListener("hpf:weather", updateWeatherNote);
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) {
      selected = readPlan();
      renderMenu();
      renderStand();
    }
  });
  renderMenu();
  renderStand();
  if (HPF.weather) updateWeatherNote();

  function picture(item, decorative = false) {
    const image = document.createElement("img");
    image.src = `assets/art/${item.id}.webp`;
    image.srcset = `assets/art/${item.id}-200.webp 200w, assets/art/${item.id}-320.webp 320w, assets/art/${item.id}.webp 480w`;
    image.sizes = decorative
      ? "90px"
      : "(max-width: 560px) calc((100vw - 70px) / 2), (max-width: 800px) calc(100vw - 380px), (max-width: 1100px) calc((100vw - 420px) / 2), 370px";
    image.alt = decorative ? "" : `Oil pastel illustration of ${item.name.toLowerCase()}`;
    image.width = 480;
    image.height = [
      "scone",
      "fruit-scone",
      "cheddar-chive-scone",
      "buttered-crumpet",
      "welsh-cakes",
      "victoria-sponge",
      "lemon-drizzle",
      "strawberry-tart",
    ].includes(item.id)
      ? 480
      : ["battenberg", "chelsea-bun"].includes(item.id)
        ? 439
        : 320;
    image.loading = "lazy";
    image.dataset.choice = item.id;
    return image;
  }

  function formatTemp(weather) {
    return useFahrenheit ? `${Math.round(weather.tempF)}°F` : `${Math.round(weather.tempC)}°C`;
  }

  function shortPlace(place) {
    return place.split(",")[0];
  }

  /* A small hint on each tea showing how we'd pour it for the guest's weather and hour. */
  function teaTag(item) {
    const evening = new Date().getHours() >= 17;
    if (item.id === "chamomile" && evening) return "Caffeine-free for this evening";
    const weather = HPF.weather;
    if (!weather) return "";
    const conditions = `${formatTemp(weather)} in ${shortPlace(weather.place)}`;
    if (weather.pour === "iced") return `Lovely iced · ${conditions}`;
    if (weather.pour === "hot") return `Best hot · ${conditions}`;
    return `Hot or iced · ${conditions}`;
  }

  function setCourse(course) {
    if (!(course in limits)) return;
    currentCourse = course;
    document
      .querySelectorAll("[data-course]")
      .forEach((button) =>
        button.setAttribute("aria-pressed", String(button.dataset.course === course)),
      );
    document.getElementById("course-heading").textContent = labels[course];
    renderMenu();
    HPF.motion?.menu?.();
  }

  function renderMenu() {
    grid.replaceChildren(
      ...menu
        .filter((item) => item.course === currentCourse)
        .map((item) => {
          const article = document.createElement("article");
          article.className = "menu-item";
          article.dataset.menuItem = item.id;
          const imageButton = document.createElement("button");
          imageButton.className = "menu-image";
          imageButton.type = "button";
          imageButton.setAttribute(
            "aria-label",
            `See ingredients and tea pairing for ${item.name}`,
          );
          imageButton.append(picture(item));
          imageButton.addEventListener("click", () => showDetails(item));
          const name = document.createElement("h4");
          name.textContent = item.name;
          const heading = document.createElement("div");
          heading.className = "menu-item-heading";
          const price = document.createElement("span");
          price.className = "menu-price";
          price.textContent = HPF.money(item.priceCents);
          heading.append(name, price);
          const note = document.createElement("p");
          note.className = "menu-item-note";
          note.textContent = item.note;
          const actions = document.createElement("div");
          actions.className = "menu-item-actions";
          const add = document.createElement("button");
          add.className = "add-button";
          add.type = "button";
          add.dataset.add = item.id;
          const isSelected = selected.includes(item.id);
          add.setAttribute("aria-pressed", String(isSelected));
          add.setAttribute(
            "aria-label",
            `${isSelected ? "Remove" : "Add"} ${item.name} ${isSelected ? "from" : "to"} your stand`,
          );
          add.textContent = isSelected ? "Added · remove −" : "Add to stand +";
          add.addEventListener("click", () => toggleItem(item));
          const details = document.createElement("button");
          details.className = "text-button";
          details.type = "button";
          if (item.recipeId) details.textContent = "Bake it at home ↗";
          else if (item.course === "tea") details.textContent = "Tea notes ↗";
          else details.textContent = "Ingredients ↗";
          details.setAttribute(
            "aria-label",
            `${details.textContent.replace(" ↗", "")} for ${item.name}`,
          );
          details.addEventListener("click", () => showDetails(item));
          actions.append(add, details);
          article.append(imageButton, heading);
          const tag = item.course === "tea" ? teaTag(item) : "";
          if (tag) {
            const badge = document.createElement("p");
            badge.className = "tea-weather-tag";
            badge.textContent = tag;
            article.append(badge);
          }
          article.append(note, actions);
          return article;
        }),
    );
  }

  function addChoice(item) {
    if (selected.includes(item.id)) return;
    const sameCourse = selected.filter((id) => byId.get(id).course === item.course);
    if (sameCourse.length >= limits[item.course])
      selected = selected.filter((id) => id !== sameCourse[0]);
    selected.push(item.id);
  }

  function toggleItem(item) {
    const removing = selected.includes(item.id);
    const sameCourse = selected.filter((id) => byId.get(id).course === item.course);
    const replaced =
      !removing && sameCourse.length >= limits[item.course] ? byId.get(sameCourse[0]) : null;
    if (removing) selected = selected.filter((id) => id !== item.id);
    else addChoice(item);
    updatePlan(item.id);
    showToast(
      removing
        ? `${item.name} removed.`
        : replaced
          ? `${item.name} replaces ${replaced.name} on your stand.`
          : `${item.name} added to your stand.`,
    );
    if (!removing && item.pair) {
      const tea = byId.get(item.pair);
      document.getElementById("pairing-note").textContent =
        `A pairing to try: ${item.name} + ${tea.name}. ${tea.pairNote}`;
    }
  }

  function updatePlan(focusId) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(selected));
    } catch {
      storageAvailable = false;
    }
    renderMenu();
    renderStand();
    HPF.motion?.stand?.(focusId);
    if (focusId) grid.querySelector(`[data-add="${focusId}"]`)?.focus({ preventScroll: true });
  }

  function renderStand() {
    const items = selected.map((id) => byId.get(id));
    document.getElementById("stand-count").textContent = String(items.length);
    document.getElementById("stand-empty").hidden = items.length > 0;
    document.getElementById("clear-stand").disabled = !items.length;
    document.getElementById("save-tea").disabled = !items.length;
    document.getElementById("checkout-stand").disabled = !items.length;
    document.getElementById("stand-total").textContent = HPF.money(
      items.reduce((sum, item) => sum + item.priceCents, 0),
    );
    document.querySelectorAll("[data-tray]").forEach((tier) => {
      tier.replaceChildren(
        ...items
          .filter((item) => item.course === tier.dataset.tray)
          .map((item) => picture(item, true)),
      );
    });
    const list = document.getElementById("stand-list");
    list.replaceChildren(
      ...Object.keys(limits)
        .flatMap((course) => items.filter((item) => item.course === course))
        .map((item) => {
          const li = document.createElement("li");
          const name = document.createElement("span");
          name.textContent = item.name;
          const remove = document.createElement("button");
          remove.className = "remove-item";
          remove.type = "button";
          remove.textContent = "×";
          remove.setAttribute("aria-label", `Remove ${item.name} from your stand`);
          remove.addEventListener("click", () => {
            const adjacent =
              li.nextElementSibling?.querySelector("button") ||
              li.previousElementSibling?.querySelector("button");
            const nextLabel = adjacent?.getAttribute("aria-label");
            selected = selected.filter((id) => id !== item.id);
            updatePlan();
            const target = [...list.querySelectorAll("button")].find(
              (button) => button.getAttribute("aria-label") === nextLabel,
            );
            (target || document.querySelector('[data-course="savoury"]')).focus({
              preventScroll: true,
            });
            showToast(`${item.name} removed.`);
          });
          const price = document.createElement("span");
          price.className = "stand-item-price";
          price.textContent = HPF.money(item.priceCents);
          li.append(name, price, remove);
          return li;
        }),
    );
    const missing = Object.keys(limits).filter(
      (course) => items.filter((item) => item.course === course).length < limits[course],
    );
    document.getElementById("stand-hint").textContent = standHint(items, missing);
    document.dispatchEvent(new CustomEvent("hpf:stand"));
  }

  function standHint(items, missingCourses) {
    if (!storageAvailable) {
      return "Your browser cannot save this plan. Download your tea card to keep a copy.";
    }
    if (!items.length) {
      return "Choose a savoury to begin.";
    }
    if (!missingCourses.length) {
      return "A complete little tea: two savouries, one warm bake, two sweets and a tea.";
    }
    const phrases = {
      savoury: "a sandwich",
      scones: "a warm bake",
      sweet: "something sweet",
      tea: "a pot of tea",
    };
    return `Still room for ${missingCourses.map((course) => phrases[course]).join(", ")}.`;
  }

  function readPlan() {
    const saved = HPF.storage.get(storageKey);
    if (!Array.isArray(saved)) return [];
    const valid = [];
    saved.forEach((id) => {
      const item = byId.get(id);
      if (
        item &&
        !valid.includes(id) &&
        valid.filter((existing) => byId.get(existing).course === item.course).length <
          limits[item.course]
      )
        valid.push(id);
    });
    return valid;
  }

  function afternoonSeason() {
    let month = new Date().getMonth();
    // Seasons are flipped in the southern hemisphere.
    if (HPF.weather?.latitude < 0) month = (month + 6) % 12;
    if (month >= 2 && month <= 4) return "spring";
    if (month >= 5 && month <= 7) return "summer";
    if (month >= 8 && month <= 10) return "autumn";
    return "winter";
  }

  function pickTea({ evening, lighter, sweets }) {
    if (evening) return "chamomile"; // Caffeine-free after 5 pm.
    if (lighter) return "darjeeling";
    if (sweets.includes("bakewell-tart") || sweets.includes("battenberg")) return "teacup"; // Earl Grey
    return "english-breakfast";
  }

  function pourAdvice(weather) {
    return weather.pour === "iced"
      ? "A chilled tea could be lovely; pour it over ice once brewed and cooled."
      : "A warm pot would be lovely with your tea stand.";
  }

  function surpriseMe() {
    const season = afternoonSeason();
    const lighter = HPF.weather ? HPF.weather.tempC >= 22 : ["spring", "summer"].includes(season);
    const savouries = HPF.shuffle(menu.filter((item) => item.course === "savoury"));
    const preferredSweets = lighter
      ? ["lemon-drizzle", "strawberry-tart", "victoria-sponge", "rose-macaron"]
      : ["bakewell-tart", "battenberg", "chocolate-eclair", "chelsea-bun"];
    const sweets = HPF.shuffle(preferredSweets).slice(0, 2);
    const evening = new Date().getHours() >= 17;
    const tea = pickTea({ evening, lighter, sweets });
    const warmBake = HPF.shuffle(
      lighter
        ? ["fruit-scone", "scone", "buttered-crumpet"]
        : ["cheddar-chive-scone", "welsh-cakes", "scone"],
    )[0];
    selected = [...savouries.slice(0, 2).map((item) => item.id), warmBake, ...sweets, tea];
    updatePlan();
    let reason = lighter
      ? "Lighter fruit and citrus bakes for a bright little tea."
      : "Almond, chocolate or warm spice for a cosy little tea.";
    if (HPF.weather) {
      const { place, pour } = HPF.weather;
      const advice =
        pour === "iced" ? "try your tea chilled over ice" : "a warm pot would be lovely";
      reason += ` ${formatTemp(HPF.weather)} in ${place}: ${advice}.`;
    } else {
      reason += " Add your city above for a weather-aware pour.";
    }
    if (evening) reason += " A caffeine-free chamomile because it is after 5 pm on your clock.";
    document.getElementById("pairing-note").textContent = reason;
    showToast("Your afternoon is on the stand. Swap anything you like.");
  }

  function updateWeatherNote() {
    const weather = HPF.weather;
    if (!weather) return;
    renderMenu();
    const conditions = `${weather.place} · ${formatTemp(weather)}.`;
    document.getElementById("pairing-note").textContent =
      `${conditions} ${pourAdvice(weather)} Let us pick a whole tea, or choose your own.`;
  }

  async function showDetails(item) {
    const request = ++detailRequest;
    detailItemId = item.id;
    document.getElementById("recipe-heading").textContent = item.name;
    recipeBody.replaceChildren();
    if (!dialog.open) dialog.showModal();
    if (!item.recipeId) {
      renderIngredients(
        item,
        item.ingredients,
        item.brew || "Illustrated tea-room recipe: this ingredient list is curated for our menu.",
      );
      return;
    }
    const loading = document.createElement("p");
    loading.textContent = "Opening the recipe book…";
    recipeBody.append(loading);
    try {
      let recipe = recipeCache.get(item.recipeId);
      if (!recipe) {
        const data = await HPF.fetchJSON(
          `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${item.recipeId}`,
        );
        recipe = data.meals?.[0];
        if (!recipe) throw new Error("No recipe available");
        recipeCache.set(item.recipeId, recipe);
      }
      if (request !== detailRequest || !dialog.open) return;
      const photo = document.createElement("img");
      photo.className = "recipe-photo";
      photo.src = `${recipe.strMealThumb}/medium`;
      photo.alt = `A home-baked ${recipe.strMeal.toLowerCase()}`;
      photo.width = 500;
      photo.height = 500;
      renderIngredients(item, uniqueIngredients(recipe), "Recipe from TheMealDB.", photo);
      if (recipe.strSource) {
        try {
          const url = new URL(recipe.strSource);
          if (!["https:", "http:"].includes(url.protocol)) return;
          const source = document.createElement("a");
          source.href = url.href;
          source.textContent = "Read the full recipe ↗";
          source.className = "text-button";
          recipeBody.append(source);
        } catch {
          /* A bad source URL should not spoil the ingredients. */
        }
      }
    } catch {
      if (request !== detailRequest || !dialog.open) return;
      const message = document.createElement("p");
      message.textContent =
        "The recipe book is out of reach just now. Your tea stand is safe. Try again when your connection returns.";
      const retry = document.createElement("button");
      retry.className = "btn btn-outline";
      retry.type = "button";
      retry.textContent = "Try the recipe again";
      retry.addEventListener("click", () => showDetails(item));
      recipeBody.replaceChildren(message, retry);
    }
  }

  /*
   * TheMealDB lists ingredients in strIngredient1…strIngredient20. Recipes with
   * two components (sponge + icing) repeat items such as butter, so keep the first
   * of each name, ignoring case.
   */
  function uniqueIngredients(recipe) {
    const seen = new Set();
    const ingredients = [];
    for (let i = 1; i <= 20; i += 1) {
      const name = recipe[`strIngredient${i}`]?.trim();
      const measure = recipe[`strMeasure${i}`]?.trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        ingredients.push(measure ? `${measure} ${name.toLowerCase()}` : name);
      }
    }
    return ingredients;
  }

  function renderIngredients(item, ingredients, sourceText, photo = null) {
    const note = document.createElement("p");
    note.textContent = item.note;
    const listLabel = document.createElement("p");
    listLabel.className = "recipe-label";
    listLabel.textContent = item.recipeId ? "You'll need" : "What's inside";
    const list = document.createElement("ul");
    ingredients.forEach((ingredient) => {
      const li = document.createElement("li");
      li.textContent = ingredient;
      list.append(li);
    });
    const source = document.createElement("p");
    source.className = "recipe-source";
    source.textContent = sourceText;
    const pair = document.createElement("p");
    pair.className = "pair-suggestion";
    const tea = item.pair ? byId.get(item.pair) : item;
    pair.textContent = item.pair ? `Try it with ${tea.name}. ${tea.pairNote}` : item.pairNote;
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-primary";
    add.textContent = item.pair ? `Add with ${tea.name}` : `Choose ${item.name}`;
    add.addEventListener("click", () => {
      [item, tea].forEach(addChoice);
      updatePlan();
      dialog.close();
      showToast("A lovely pairing, added to your stand.");
    });
    recipeBody.replaceChildren(
      ...[note, photo, listLabel, list, source, pair, add].filter(Boolean),
    );
  }

  function saveTeaCard() {
    const lines = [
      "HALF PAST FOUR",
      "Your little afternoon tea",
      "",
      "A tasting plan to make at home. No restaurant order has been placed.",
      "",
    ];
    Object.keys(limits).forEach((course) => {
      const items = selected.map((id) => byId.get(id)).filter((item) => item.course === course);
      lines.push(labels[course].toUpperCase());
      items.forEach((item) => {
        lines.push(`  • ${item.name}`, `    ${item.note}`);
        if (item.brew) lines.push(`    ${item.brew}`);
        if (item.recipeId)
          lines.push(`    Recipe: https://www.themealdb.com/meal/${item.recipeId}`);
      });
      if (!items.length) lines.push("  Still yours to choose.");
      lines.push("");
    });
    lines.push(
      "START AT THE BOTTOM",
      "Sandwiches first, then scones with clotted cream and jam, then sweets.",
      "Keep your favourite tea beside you. Brewing times are starting points.",
    );
    if (HPF.weather)
      lines.push("", `The sky over your table: ${HPF.weather.place}, ${formatTemp(HPF.weather)}.`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "half-past-four-my-tea-card.txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Your tea card is ready to keep.");
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 4200);
  }
})(window.HPF);
