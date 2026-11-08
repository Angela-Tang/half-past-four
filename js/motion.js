/* GSAP core: small, interruptible movements that explain a change of course. */
(function (HPF) {
  "use strict";
  HPF.motion = {};
  if (!window.gsap) return;
  const media = gsap.matchMedia();
  media.add("(prefers-reduced-motion: no-preference)", (context) => {
    document.documentElement.dataset.gsapMotion = "true";
    HPF.motion.menu = () =>
      context.add(() => {
        gsap.fromTo(
          ".menu-item",
          { y: 9, autoAlpha: 0.3 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.32,
            stagger: 0.035,
            ease: "power2.out",
            clearProps: "transform,opacity,visibility",
          },
        );
      });
    HPF.motion.stand = (id) =>
      context.add(() => {
        const targets = id
          ? document.querySelectorAll(`.mini-stand img[data-choice="${id}"]`)
          : document.querySelectorAll(".mini-tier img, .mini-tea img");
        if (!targets.length) return;
        gsap.fromTo(
          targets,
          { y: -15, scale: 0.9, autoAlpha: 0 },
          {
            y: 0,
            scale: 1,
            autoAlpha: 1,
            duration: 0.45,
            stagger: 0.045,
            ease: "back.out(1.25)",
            clearProps: "transform,opacity,visibility",
          },
        );
      });
    HPF.motion.receipt = () =>
      context.add(() => {
        gsap.fromTo(
          "#tea-receipt",
          { y: 14, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.55,
            ease: "power3.out",
            clearProps: "transform,opacity,visibility",
          },
        );
      });
    return () => {
      HPF.motion = {};
      delete document.documentElement.dataset.gsapMotion;
    };
  });
  window.addEventListener("pagehide", () => media.revert(), { once: true });
})(window.HPF);
