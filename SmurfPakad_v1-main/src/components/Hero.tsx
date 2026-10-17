import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, Shield, Brain, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_FRAMES = 100;
const FRAME_BASE   = import.meta.env.BASE_URL + 'hero-frames/';
const SCROLL_MULTIPLIER = 6; // 6x viewport height for the pinned section

// ─── Frame preloader ──────────────────────────────────────────────────────────
function preloadImages(count: number): HTMLImageElement[] {
  const imgs: HTMLImageElement[] = [];
  for (let i = 0; i < count; i++) {
    const img  = new Image();
    const num  = String(i).padStart(3, '0');
    img.src    = `${FRAME_BASE}im_creating_a_project_which_fi_${num}.jpg`;
    img.decoding = 'async';
    imgs.push(img);
  }
  return imgs;
}

// ─── Ease helpers ─────────────────────────────────────────────────────────────
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const mapRange = (
  v: number, inMin: number, inMax: number, outMin: number, outMax: number,
) => {
  const t = Math.max(0, Math.min(1, (v - inMin) / (inMax - inMin)));
  return outMin + (outMax - outMin) * easeInOutCubic(t);
};

// ─── Animated Counter ─────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 2000, active = false) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const frame     = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    startTime.current = null;
    const animate = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const p = Math.min((ts - startTime.current) / duration, 1);
      setValue((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) frame.current = requestAnimationFrame(animate);
    };
    frame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, active]);

  return Math.floor(value).toLocaleString();
}

function AnimatedStat({ value, suffix, label, active }: {
  value: number; suffix: string; label: string; active: boolean;
}) {
  const count = useCountUp(value, 2000, active);
  return (
    <div className="text-center">
      <p className="text-2xl md:text-3xl font-bold text-white tabular-nums">
        {count}<span className="text-purple-400">{suffix}</span>
      </p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

// ─── Hero Component ───────────────────────────────────────────────────────────
const Hero = () => {
  const sectionRef   = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imagesRef    = useRef<HTMLImageElement[]>([]);
  const currentFrame = useRef(0);
  const rafRef       = useRef<number>(0);
  const lastProgress = useRef(-1);

  const [progress,    setProgress]    = useState(0);
  const [ctaVisible,  setCtaVisible]  = useState(false);
  const [scrollHint,  setScrollHint]  = useState(true);
  const [statsActive, setStatsActive] = useState(false);

  // Preload all frames on mount
  useEffect(() => {
    imagesRef.current = preloadImages(TOTAL_FRAMES);
  }, []);

  // Draw a specific frame onto the canvas
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    const img    = imagesRef.current[index];
    if (!canvas || !img) return;
    if (!img.complete || img.naturalWidth === 0) return; // Prevents 'broken' state error
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth  || 1280;
    const ih = img.naturalHeight || 720;
    const scale = Math.max(cw / iw, ch / ih);
    const sw = iw * scale, sh = ih * scale;
    const sx = (cw - sw) / 2, sy = (ch - sh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, sw, sh);
  }, []);

  // Resize canvas to fill viewport
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      drawFrame(currentFrame.current);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [drawFrame]);

  // Scroll handler (RAF-gated for performance)
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect     = section.getBoundingClientRect();
        const totalH   = section.offsetHeight;
        const viewH    = window.innerHeight;
        const scrolled = -rect.top;
        const maxScroll = totalH - viewH;
        const prog     = Math.max(0, Math.min(1, scrolled / maxScroll));

        if (Math.abs(prog - lastProgress.current) < 0.0005) return;
        lastProgress.current = prog;

        const frameIdx = Math.min(
          Math.round(prog * (TOTAL_FRAMES - 1)),
          TOTAL_FRAMES - 1,
        );
        currentFrame.current = frameIdx;
        drawFrame(frameIdx);

        setProgress(prog);
        setScrollHint(prog < 0.02);
        setCtaVisible(prog > 0.85);
        setStatsActive(prog > 0.87);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  // Title: fades in [0%→5%], solid [5%→65%], fades out [65%→80%]
  const titleOpacity =
    progress < 0.05 ? mapRange(progress, 0, 0.05, 0, 1) :
    progress < 0.65 ? 1 :
    progress < 0.80 ? mapRange(progress, 0.65, 0.80, 1, 0) : 0;

  const titleScale =
    progress < 0.05 ? mapRange(progress, 0, 0.05, 0.7, 1) :
    progress < 0.65 ? 1 :
    progress < 0.80 ? mapRange(progress, 0.65, 0.80, 1, 0.8) : 0.8;

  // Tagline lags title by ~0.12
  const tagOpacity =
    progress < 0.17 ? mapRange(progress, 0.05, 0.17, 0, 1) :
    progress < 0.62 ? 1 :
    progress < 0.78 ? mapRange(progress, 0.62, 0.78, 1, 0) : 0;

  const tagY =
    progress < 0.17 ? mapRange(progress, 0.05, 0.17, 24, 0) : 0;

  const badgeOpacity =
    progress < 0.20 ? mapRange(progress, 0.08, 0.20, 0, 1) :
    progress < 0.60 ? 1 :
    progress < 0.75 ? mapRange(progress, 0.60, 0.75, 1, 0) : 0;

  const barWidth = `${(progress * 100).toFixed(1)}%`;

  return (
    <>
      {/* PINNED SCROLL ZONE */}
      <div
        ref={sectionRef}
        style={{ height: `${SCROLL_MULTIPLIER * 100}vh` }}
        className="relative"
      >
        <div className="sticky top-0 h-screen w-full overflow-hidden">

          {/* Canvas — frame animation */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ display: 'block' }}
          />

          {/* Vignette overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.58) 100%)',
            }}
          />

          {/* Overlay Text Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">

            {/* Badge pill */}
            <div
              style={{
                opacity: badgeOpacity,
                transform: `translateY(${tagY * 0.5}px)`,
              }}
              className="mb-6 flex items-center gap-2"
            >
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/15 bg-black/30 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-white/85 tracking-widest uppercase">
                  AI-Powered AML Detection
                </span>
              </div>
            </div>

            {/* SMURFPAKAD */}
            <h1
              style={{
                opacity: titleOpacity,
                transform: `scale(${titleScale})`,
                fontSize: 'clamp(3rem, 11vw, 10rem)',
                background:
                  'linear-gradient(135deg, #ffffff 0%, #c4b5fd 40%, #818cf8 70%, #38bdf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.03em',
                fontFamily: "'Poppins', 'Inter', sans-serif",
                fontWeight: 900,
                lineHeight: 1,
              }}
              className="text-center"
            >
              SMURFPAKAD
            </h1>

            {/* Primary tagline */}
            <p
              style={{
                opacity: tagOpacity,
                transform: `translateY(${tagY}px)`,
                fontSize: 'clamp(0.8rem, 2.5vw, 1.35rem)',
                letterSpacing: '0.28em',
                fontFamily: "'Inter', sans-serif",
              }}
              className="mt-4 text-center font-light uppercase text-white/80"
            >
              Hunt Smurfing.&nbsp;&nbsp;Protect Finance.
            </p>

            {/* Sub tagline */}
            <p
              style={{
                opacity: tagOpacity * 0.6,
                transform: `translateY(${tagY * 1.2}px)`,
                fontSize: 'clamp(0.65rem, 1.5vw, 0.95rem)',
                letterSpacing: '0.1em',
              }}
              className="mt-3 text-center font-light text-white/50"
            >
              Graph Neural Networks · Blockchain · RegTech
            </p>

          </div>

          {/* Progress bar */}
          <div className="absolute top-0 left-0 h-[2px] w-full bg-white/5 z-20 pointer-events-none">
            <div
              className="h-full bg-gradient-to-r from-purple-500 via-indigo-400 to-sky-400"
              style={{ width: barWidth }}
            />
          </div>

          {/* Scroll hint */}
          <div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-20"
            style={{
              opacity: scrollHint ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}
          >
            <span className="text-white/35 text-[10px] uppercase tracking-[0.3em]">Scroll to explore</span>
            <ChevronDown className="text-white/35 h-5 w-5 animate-bounce" />
          </div>

          {/* Frame counter */}
          <div className="absolute bottom-4 right-5 text-white/15 text-[10px] font-mono pointer-events-none z-20">
            {String(Math.round(progress * (TOTAL_FRAMES - 1))).padStart(3, '0')} / {TOTAL_FRAMES - 1}
          </div>

        </div>
      </div>

      {/* CTA SECTION */}
      <section
        className="relative bg-gradient-to-b from-[#0a0a14] via-[#0f0f1f] to-[#0a0a14] py-24 px-4 overflow-hidden"
        style={{
          opacity: ctaVisible ? 1 : 0,
          transform: ctaVisible ? 'translateY(0)' : 'translateY(40px)',
          transition: 'opacity 0.9s ease, transform 0.9s ease',
        }}
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-600/10 blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-sky-500/8 blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[140px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">

          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 backdrop-blur-sm">
            <Shield className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs font-medium text-purple-300 tracking-wider uppercase">
              Enterprise RegTech Platform
            </span>
          </div>

          {/* Headline */}
          <h2
            className="font-black leading-tight mb-4"
            style={{
              fontSize: 'clamp(2.2rem, 6vw, 5rem)',
              background: 'linear-gradient(135deg, #ffffff 0%, #c4b5fd 50%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontFamily: "'Poppins', 'Inter', sans-serif",
              letterSpacing: '-0.03em',
            }}
          >
            Hunt Smurfing.
            <br />
            Protect Finance.
          </h2>

          <p
            className="text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed"
            style={{ fontSize: 'clamp(0.95rem, 1.8vw, 1.15rem)' }}
          >
            SmurfPakad uses message-passing Graph Neural Networks to analyze blockchain transaction topology,
            detecting sophisticated money laundering schemes with{' '}
            <span className="text-white font-medium">98.5% accuracy</span>
            {' '}— powered by IBM watsonx.ai.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
            <Link to="/cryptoflow/dashboard">
              <Button
                size="lg"
                className="group relative overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-6 rounded-full text-base font-semibold shadow-xl shadow-purple-900/40 transition-all duration-300 hover:shadow-purple-700/50 hover:scale-105"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Analyze Transactions
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
                </span>
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </Button>
            </Link>

            <Link to="/cryptoflow/threats">
              <Button
                variant="outline"
                size="lg"
                className="border border-white/15 text-white bg-white/5 hover:bg-white/10 hover:border-red-500/40 px-8 py-6 rounded-full text-base font-semibold backdrop-blur-sm transition-all duration-300 hover:scale-105"
              >
                View Live Threats
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 mb-12 max-w-xl mx-auto">
            <AnimatedStat value={98}   suffix="%" label="Detection Accuracy" active={statsActive} />
            <AnimatedStat value={2500} suffix="K+" label="Wallets Analyzed"  active={statsActive} />
            <AnimatedStat value={15}   suffix="K+" label="Illicit Patterns"   active={statsActive} />
          </div>

          {/* Tech pills */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { Icon: Brain,  label: 'GNN (GraphSAGE)',     cls: 'border-purple-500/20 bg-purple-500/5 text-purple-300' },
              { Icon: Shield, label: 'SafeGuard Shield',    cls: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' },
              { Icon: Zap,    label: 'Real-time Detection', cls: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300' },
            ].map(({ Icon, label, cls }) => (
              <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium backdrop-blur-sm ${cls}`}>
                <Icon className="h-3 w-3" />
                {label}
              </div>
            ))}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 text-blue-300 text-xs font-medium backdrop-blur-sm">
              <span className="font-bold text-[10px]">IBM</span>
              <span className="text-blue-300/70 text-[10px]">watsonx.ai</span>
            </div>
          </div>

        </div>
      </section>
    </>
  );
};

export default Hero;
