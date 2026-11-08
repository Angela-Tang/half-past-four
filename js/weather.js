/*
 * "The sky over your table"
 * Geolocation (browser API) -> BigDataCloud reverse geocoding (place name)
 * -> Open-Meteo forecast (current weather). If location is refused or
 * unavailable, the visitor types a city and Open-Meteo's geocoder finds it.
 * The reading is shared as HPF.weather so drink pairings can use it later.
 */
(function (HPF) {
  "use strict";

  const STORAGE_KEY = "hpf.location";
  const HOT_BELOW_C = 18;
  const ICED_ABOVE_C = 24;

  const card = document.getElementById("weather-card");
  if (!card) {
    return;
  }

  const body = document.getElementById("weather-body");
  const actions = document.getElementById("weather-actions");
  const locateButton = document.getElementById("locate-button");
  const cityToggle = document.getElementById("city-toggle");
  const cityForm = document.getElementById("city-form");
  const cityInput = document.getElementById("city-input");
  const cityError = document.getElementById("city-error");
  const headerWeather = document.getElementById("header-weather");

  const useFahrenheit = /-US$/i.test(navigator.language || "");

  /* WMO weather codes grouped into the moods we care about. */
  const CONDITIONS = [
    { codes: [0, 1], key: "clear", label: "Clear skies" },
    { codes: [2], key: "partly", label: "Partly cloudy" },
    { codes: [3], key: "cloud", label: "Overcast" },
    { codes: [45, 48], key: "fog", label: "Foggy" },
    { codes: [51, 53, 55, 56, 57], key: "rain", label: "Drizzle" },
    { codes: [61, 63, 65, 66, 67, 80, 81, 82], key: "rain", label: "Rain" },
    { codes: [71, 73, 75, 77, 85, 86], key: "snow", label: "Snow" },
    { codes: [95, 96, 99], key: "storm", label: "Thunderstorms" },
  ];

  const MOODS = {
    clearDay: "Clear skies. Practically a garden-party afternoon.",
    clearNight: "A clear, starry evening. Late tea is still tea.",
    partly: "The sun is popping in and out like a nervous guest.",
    cloud: "Grey skies. Nothing a warm scone can't fix.",
    fog: "Properly foggy out, a real London particular.",
    rain: "A pot-of-tea kind of afternoon.",
    snow: "Snow outside, so the kettle stays on.",
    storm: "Thunder about. Best stay in for another cup.",
  };

  /* ---------- Events ---------- */

  locateButton.addEventListener("click", useMyLocation);

  cityToggle.addEventListener("click", () => {
    const opening = cityForm.hidden;
    toggleCityForm(opening);
    if (opening) {
      cityInput.focus();
    }
  });

  cityForm.addEventListener("submit", handleCitySubmit);

  cityInput.addEventListener("input", () => setCityError(""));

  /* Returning visitors: reuse the last place without asking again. */
  const saved = HPF.storage.get(STORAGE_KEY);
  if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) {
    loadWeather(saved);
  }

  /* ---------- Location ---------- */

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      offerCityForm("Your browser can't share a location, so tell us your city instead.");
      return;
    }

    renderLoading("Asking your browser where the table is…");
    locateButton.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        locateButton.disabled = false;
        const { latitude, longitude } = position.coords;
        const name = await lookUpPlaceName(latitude, longitude);
        loadWeather({ latitude, longitude, name });
      },
      (error) => {
        locateButton.disabled = false;
        if (error.code === error.PERMISSION_DENIED) {
          offerCityForm("No problem, your location stays with you. Which city are you in?");
        } else {
          offerCityForm("We couldn't pin down where you are. Type a city instead.");
        }
      },
      { timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }

  async function lookUpPlaceName(latitude, longitude) {
    const url =
      "https://api.bigdatacloud.net/data/reverse-geocode-client" +
      `?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
    try {
      const place = await HPF.fetchJSON(url, { timeout: 5000 });
      return place.city || place.locality || place.principalSubdivision || "your table";
    } catch {
      return "your table"; // The weather still works without a name.
    }
  }

  async function handleCitySubmit(event) {
    event.preventDefault();
    const query = cityInput.value.trim();

    if (!query) {
      setCityError("Enter a city name first.");
      cityInput.focus();
      return;
    }

    const submitButton = cityForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    setCityError("");

    try {
      const place = await searchCity(query);
      if (!place) {
        setCityError(`We couldn't find "${query}". Check the spelling or try a nearby city.`);
        return;
      }
      toggleCityForm(false);
      loadWeather(place);
    } catch {
      setCityError("We couldn't reach the map just now. Try again in a moment.");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function searchCity(query) {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search" +
      `?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const data = await HPF.fetchJSON(url);
    const match = data.results && data.results[0];
    if (!match) {
      return null;
    }

    const region = match.country_code === "US" ? match.admin1 : match.country;
    return {
      latitude: match.latitude,
      longitude: match.longitude,
      // City-states such as Singapore share their name with the country.
      name: region && region !== match.name ? `${match.name}, ${region}` : match.name,
    };
  }

  /* ---------- Weather ---------- */

  async function loadWeather(place) {
    renderLoading("Looking out the window…");
    actions.hidden = true;

    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      "&current=temperature_2m,weather_code,is_day&timezone=auto";

    try {
      const data = await HPF.fetchJSON(url);
      const reading = describe(data.current, place.name);
      reading.latitude = place.latitude;

      HPF.weather = reading;
      HPF.storage.set(STORAGE_KEY, place);
      renderWeather(reading);
      updateHeader(reading);
      document.dispatchEvent(new CustomEvent("hpf:weather", { detail: reading }));
    } catch {
      renderError(
        "We couldn't see the sky just now. Check your connection and try again, or type a city.",
        () => loadWeather(place),
      );
    }
  }

  function describe(current, placeName) {
    const condition =
      CONDITIONS.find((group) => group.codes.includes(current.weather_code)) || CONDITIONS[2];
    const isDay = current.is_day === 1;
    const tempC = current.temperature_2m;

    let icon = condition.key;
    if (condition.key === "clear") {
      icon = isDay ? "sun" : "moon";
    }

    let mood = MOODS[condition.key];
    if (condition.key === "clear") {
      mood = isDay ? MOODS.clearDay : MOODS.clearNight;
    }

    let pour = "both";
    if (tempC < HOT_BELOW_C) {
      pour = "hot";
    } else if (tempC > ICED_ABOVE_C) {
      pour = "iced";
    }

    return {
      place: placeName,
      tempC,
      tempF: tempC * 1.8 + 32,
      condition: condition.key,
      label: condition.label,
      icon,
      mood,
      pour,
      isDay,
    };
  }

  function formatTemps(reading) {
    const c = `${Math.round(reading.tempC)}°C`;
    const f = `${Math.round(reading.tempF)}°F`;
    return useFahrenheit ? { main: f, alt: c } : { main: c, alt: f };
  }

  /* ---------- Rendering ---------- */

  function renderLoading(text) {
    const message = document.createElement("p");
    message.className = "weather-loading";
    message.textContent = text;
    body.replaceChildren(message);
  }

  function renderMessage(text) {
    const message = document.createElement("p");
    message.className = "weather-message";
    message.textContent = text;
    body.replaceChildren(message);
  }

  function renderError(text, retry) {
    const message = document.createElement("p");
    message.className = "weather-message is-error";
    message.textContent = text;

    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "btn btn-link";
    retryButton.textContent = "Try again";
    retryButton.addEventListener("click", retry);

    body.replaceChildren(message, retryButton);
    actions.hidden = false;
  }

  function renderWeather(reading) {
    const temps = formatTemps(reading);

    const now = document.createElement("div");
    now.className = "weather-now";
    now.append(createIcon(reading.icon, "weather-icon"));

    const text = document.createElement("div");
    const temp = document.createElement("p");
    temp.className = "weather-temp";
    temp.textContent = temps.main;
    const alt = document.createElement("span");
    alt.className = "weather-temp-alt";
    alt.textContent = temps.alt;
    temp.append(alt);

    const place = document.createElement("p");
    place.className = "weather-place";
    place.textContent = `${reading.label} in ${reading.place}`;
    text.append(temp, place);
    now.append(text);

    const mood = document.createElement("p");
    mood.className = "weather-mood";
    mood.textContent = reading.mood;

    const pour = document.createElement("p");
    pour.className = "pour-tag";
    pour.textContent = {
      hot: "We'll pour everything hot",
      iced: "We'll pour it over ice",
      both: "Hot or iced, your call",
    }[reading.pour];

    const change = document.createElement("button");
    change.type = "button";
    change.className = "btn btn-link";
    change.textContent = "Change location";
    change.addEventListener("click", () => {
      actions.hidden = false;
      locateButton.focus();
    });

    const footer = document.createElement("p");
    footer.append(change);

    body.replaceChildren(now, mood, pour, footer);
  }

  function updateHeader(reading) {
    const temps = formatTemps(reading);
    headerWeather.querySelector("use").setAttribute("href", `#icon-${reading.icon}`);
    headerWeather.querySelector(".header-weather-text").textContent =
      `${temps.main} · ${reading.place}`;
    headerWeather.hidden = false;
  }

  function offerCityForm(text) {
    renderMessage(text);
    actions.hidden = false;
    toggleCityForm(true);
    cityInput.focus();
  }

  function toggleCityForm(open) {
    cityForm.hidden = !open;
    cityToggle.setAttribute("aria-expanded", String(open));
    if (!open) {
      setCityError("");
    }
  }

  function setCityError(text) {
    cityError.textContent = text;
    cityInput.setAttribute("aria-invalid", text ? "true" : "false");
  }

  function createIcon(name, className) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(svgNS, "use");
    use.setAttribute("href", `#icon-${name}`);
    svg.append(use);
    return svg;
  }
})(window.HPF);
