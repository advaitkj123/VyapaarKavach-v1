/**
 * useGSAP animations — reusable GSAP hooks for all pages
 *
 * Usage:
 *   usePageEntrance()  — animates children in on mount
 *   useScrollReveal()  — reveals elements on scroll
 *   useCountUp()       — animates number counting up
 *   useStaggerCards()  — staggers card entrance animations
 */
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Fade-in + slide-up entrance for the whole page on mount.
 * Call at the top of any page component.
 */
export function usePageEntrance(selector = ".page-content") {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        selector,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }
      );
    });
    return () => ctx.revert();
  }, [selector]);
}

/**
 * Stagger cards entrance — each card flies in with a delay.
 * Apply className="gsap-card" to each card.
 */
export function useStaggerCards(parentSelector = ".cards-container") {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        `${parentSelector} .gsap-card`,
        { opacity: 0, y: 40, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          stagger: 0.08,
          ease: "power2.out",
          delay: 0.2,
        }
      );
    });
    return () => ctx.revert();
  }, [parentSelector]);
}

/**
 * Reveal elements on scroll using ScrollTrigger.
 * Apply className="gsap-reveal" to any element.
 */
export function useScrollReveal() {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".gsap-reveal").forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 85%",
              toggleActions: "play none none reverse",
            },
          }
        );
      });
    });
    return () => ctx.revert();
  }, []);
}

/**
 * Animates a number counting up from 0 to target.
 * Returns a ref to attach to the DOM element.
 */
export function useCountUp(target: number, duration = 2, decimals = 0) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration,
      ease: "power2.out",
      onUpdate: () => {
        if (ref.current) {
          ref.current.textContent = obj.val.toFixed(decimals);
        }
      },
    });
  }, [target, duration, decimals]);

  return ref;
}

/**
 * Pulse animation on a ref element — used for live indicators.
 */
export function usePulse(color = "#ef4444") {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.to(ref.current, {
        boxShadow: `0 0 20px ${color}88`,
        duration: 0.8,
        repeat: -1,
        yoyo: true,
        ease: "power1.inOut",
      });
    });
    return () => ctx.revert();
  }, [color]);

  return ref;
}

/**
 * Magnetic hover effect for buttons/cards.
 * Apply ref to any interactive element.
 */
export function useMagneticHover(strength = 0.3) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * strength;
      const dy = (e.clientY - cy) * strength;
      gsap.to(el, { x: dx, y: dy, duration: 0.4, ease: "power2.out" });
    };

    const handleMouseLeave = () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.5)" });
    };

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [strength]);

  return ref;
}

/**
 * Shimmer loading animation — runs on a ref element.
 */
export function useShimmer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ref.current,
        { backgroundPosition: "-200% 0" },
        {
          backgroundPosition: "200% 0",
          duration: 1.5,
          repeat: -1,
          ease: "none",
        }
      );
    });
    return () => ctx.revert();
  }, []);

  return ref;
}

/**
 * Timeline entrance for a sequence of elements.
 * Pass an array of selectors and they animate in sequence.
 */
export function useSequenceEntrance(selectors: string[], delayBetween = 0.15) {
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.1 });
      selectors.forEach((sel) => {
        tl.fromTo(
          sel,
          { opacity: 0, x: -20 },
          { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" },
          `-=${delayBetween}`
        );
      });
    });
    return () => ctx.revert();
  }, [selectors, delayBetween]);
}
