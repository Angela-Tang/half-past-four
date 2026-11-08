/* Keep the approved setting together; size the cover around the real navigation. */
(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  const updateHeaderHeight = () => {
    document.documentElement.style.setProperty(
      "--site-header-height",
      `${header.getBoundingClientRect().height}px`,
    );
  };
  updateHeaderHeight();
  const headerObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(updateHeaderHeight) : null;
  if (headerObserver) headerObserver.observe(header);
  else window.addEventListener("resize", updateHeaderHeight);

  // A still preview uses the same user-facing pause control.
  if (new URLSearchParams(location.search).has("still"))
    document.getElementById("toggle-title-motion")?.click();

  const media = window.gsap?.matchMedia();
  media?.add("(prefers-reduced-motion: no-preference)", () => {
    const timeline = gsap.timeline({ defaults: { duration: 0.75, ease: "power3.out" } });
    timeline
      .from(
        ".collage-green, .collage-rose, .collage-blue-corner",
        { y: 22, autoAlpha: 0, stagger: 0.1 },
        0,
      )
      .from(".lace-setting-art", { y: 16, autoAlpha: 0, scale: 0.96 }, 0.25)
      .from(".table-knife, .table-spoon", { y: 18, autoAlpha: 0, stagger: 0.14 }, 0.65)
      .from(".baker-scrap, .plate-scrap, .cake-scrap", { y: 20, autoAlpha: 0, stagger: 0.12 }, 0.55)
      .from(".china-scrap, .pour-scrap", { y: -18, autoAlpha: 0, stagger: 0.13 }, 0.7)
      .from(".collage-note", { y: 10, autoAlpha: 0 }, 1);

    const cleanups = [];
    document.querySelectorAll(".lace-hero .collage-cutout > img").forEach((image) => {
      const enter = () => gsap.to(image, { y: -5, duration: 0.3, overwrite: "auto" });
      const leave = () => gsap.to(image, { y: 0, duration: 0.4, overwrite: "auto" });
      image.addEventListener("pointerenter", enter);
      image.addEventListener("pointerleave", leave);
      cleanups.push(() => {
        image.removeEventListener("pointerenter", enter);
        image.removeEventListener("pointerleave", leave);
      });
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  });

  window.addEventListener(
    "pagehide",
    () => {
      media?.revert();
      headerObserver?.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    },
    { once: true },
  );
})();
