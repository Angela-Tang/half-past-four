/*
 * Shared helpers for Half Past Four.
 * Every other script reads and writes through the HPF namespace.
 */
window.HPF = window.HPF || {};

(function (HPF) {
  "use strict";

  const MEALDB_BASE = "https://www.themealdb.com/api/json/v1/1";

  /**
   * Fetch JSON with a timeout. Throws on network errors, timeouts and non-2xx responses,
   * so callers can show one friendly message for every kind of failure.
   */
  async function fetchJSON(url, { timeout = 8000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  let britishDessertsRequest = null;

  /**
   * TheMealDB can filter by cuisine or by category, but not both at once,
   * so we ask for both lists and keep the meals that appear in each.
   * The result is cached so several features can share one request.
   */
  function getBritishDesserts() {
    if (!britishDessertsRequest) {
      britishDessertsRequest = Promise.all([
        fetchJSON(`${MEALDB_BASE}/filter.php?a=British`),
        fetchJSON(`${MEALDB_BASE}/filter.php?c=Dessert`),
      ])
        .then(([british, desserts]) => {
          const britishIds = new Set((british.meals || []).map((meal) => meal.idMeal));

          return (desserts.meals || [])
            .filter((meal) => britishIds.has(meal.idMeal))
            .map((meal) => ({
              id: meal.idMeal,
              name: meal.strMeal,
              image: meal.strMealThumb,
            }));
        })
        .catch((error) => {
          britishDessertsRequest = null; // Allow a retry later.
          throw error;
        });
    }
    return britishDessertsRequest;
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* localStorage can throw (private mode, blocked storage), so every access is guarded. */
  const storage = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* Storage unavailable: the app still works, it just won't remember. */
      }
    },
  };

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  HPF.fetchJSON = fetchJSON;
  HPF.getBritishDesserts = getBritishDesserts;
  HPF.prefersReducedMotion = prefersReducedMotion;
  HPF.storage = storage;
  HPF.shuffle = shuffle;
})(window.HPF);
