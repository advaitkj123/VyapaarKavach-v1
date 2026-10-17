/**
 * VIGILANT — Variational Intelligence for Graph, Information-flow,
 * and Limit-order Anomaly Tracking
 *
 * Market-behaviour threat screening (path signatures + Hawkes-style dynamics).
 * Transaction-graph (SmurfPakad) remains a separate module.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, AlertTriangle, Brain, CheckCircle2, Eye, FileText,
  GitBranch, Network, Radar, Shield, Sparkles, TrendingUp,
} from "lucide-react";
import {
  ablationSummary,
  runVigilantDemoScenarios,
  type VigilantWindowAnalysis,
} from "@/lib/vigilant";
import { toast } from "@/components/ToastNotification";

function scoreColor(s: number) {
  if (s >= 0.62) return "text-red-400";
  if (s >= 0.4) return "text-amber-400";
  return "text-emerald-400";
}

function labelBadge(label: string) {
  if (label === "alert") return "bg-red-500/20 text-red-300 border-red-500/40";
  if (label === "review") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
}

function MiniPathChart({ analysis }: { analysis: VigilantWindowAnalysis }) {
  const w = 320;
  const h = 120;
  const path = analysis.path;
  if (path.length < 2) return null;

  const mids = path.map((p) => p.mid);
  const obis = path.map((p) => p.obi);
  const minM = Math.min(...mids);
  const maxM = Math.max(...mids);
  const minO = Math.min(...obis);
  const maxO = Math.max(...obis);
  const n = path.length - 1;

  const midPts = path
    .map((p, i) => {
      const x = (i / n) * (w - 20) + 10;
      const y = h - 15 - ((p.mid - minM) / Math.max(maxM - minM, 1e-6)) * (h - 30);
      return `${x},${y}`;
    })
    .join(" ");

  const obiPts = path
    .map((p, i) => {
      const x = (i / n) * (w - 20) + 10;
      const y = h - 15 - ((p.obi - minO) / Math.max(maxO - minO, 1e-6)) * (h - 30);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28 rounded-lg bg-black/30 border border-white/10">
      <polyline fill="none" stroke="#6366f1" strokeWidth="2" points={midPts} />
      <polyline fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" points={obiPts} />
      <text x="12" y="14" fill="#94a3b8" fontSize="10">mid (indigo) · OBI (amber)</text>
    </svg>
  );
}

function EventTimeline({ analysis }: { analysis: VigilantWindowAnalysis }) {
  const colors: Record<string, string> = {
    submit_bid: "#34d399",
    submit_ask: "#60a5fa",
    cancel_bid: "#f472b6",
    cancel_ask: "#fb7185",
    exec_buy: "#fbbf24",
    exec_sell: "#a78bfa",
  };
  const tMax = Math.max(...analysis.events.map((e) => e.t), 0.01);

  return (
    <div className="space-y-2">
      <div className="relative h-8 rounded bg-black/30 border border-white/10 overflow-hidden">
        {analysis.events.map((e, i) => (
          <div
            key={i}
            title={`${e.type} @ ${e.t.toFixed(3)}s qty=${e.qty}`}
            className="absolute top-1 bottom-1 w-1 rounded-sm"
            style={{
              left: `${(e.t / tMax) * 96 + 2}%`,
              backgroundColor: colors[e.type] || "#94a3b8",
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] text-gray-400">
        {Object.entries(colors).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Vigilant() {
  const scenarios = useMemo(() => runVigilantDemoScenarios(), []);
  const [selectedId, setSelectedId] = useState(scenarios[1]?.scenarioId || scenarios[0]?.scenarioId);
  const selected = scenarios.find((s) => s.scenarioId === selectedId) || scenarios[0];
  const ablation = useMemo(() => ablationSummary(scenarios), [scenarios]);

  const copyReport = () => {
    if (!selected) return;
    const f = selected.fusion;
    const report = `VIGILANT Investigation Report
=============================
Instrument: ${selected.instrument}
Window: ${selected.windowStart} – ${selected.windowEnd}
Scenario: ${selected.scenarioName} (${selected.groundTruth})
Model score: ${f.score.toFixed(3)} [${f.scoreType}]
Label: ${f.label.toUpperCase()}

Triggered features: ${f.triggeredFeatures.join(", ") || "none"}

Evidence:
${f.evidence.map((e) => `- ${e}`).join("\n")}

Component scores:
- Conventional: ${f.conventionalScore.toFixed(3)}
- Path signatures (deg-2): ${f.signatureScore.toFixed(3)}
- Hawkes-style dynamics: ${f.hawkesScore.toFixed(3)}

Limitations:
${f.limitations.map((e) => `- ${e}`).join("\n")}

Suggested next steps:
1. Inspect the underlying order and execution sequence.
2. Compare with the instrument's normal activity at the same time of day.
3. Check for market-wide or news-driven events.
4. Escalate only if evidence satisfies review policy.
`;
    navigator.clipboard.writeText(report).then(() => toast.success("Evidence report copied"));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-crypto-purple text-xs font-semibold tracking-wider uppercase mb-1">
              <Radar className="h-3.5 w-3.5" />
              Financial Cybersecurity · Market Microstructure
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">VIGILANT</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
              Variational Intelligence for Graph, Information-flow, and Limit-order Anomaly Tracking —
              screens electronic-market event streams using <strong className="text-gray-300">path signatures</strong> and{" "}
              <strong className="text-gray-300">Hawkes-style event dynamics</strong>. Alerts are for human review, not proof of crime.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs">Family A · Market behaviour</Badge>
            <Link to="/cryptoflow/graph">
              <Badge className="bg-crypto-purple/20 text-crypto-purple cursor-pointer hover:bg-crypto-purple/30">
                Family B · Transaction graph →
              </Badge>
            </Link>
          </div>
        </div>

        {/* Positioning cards */}
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="dark:bg-white/5 dark:border-emerald-500/20">
            <CardContent className="pt-4 text-xs space-y-1">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Core research
              </div>
              <p className="text-gray-400">Path-dependent LOB trajectories + self-exciting order-flow for suspicious pattern screening.</p>
            </CardContent>
          </Card>
          <Card className="dark:bg-white/5 dark:border-amber-500/20">
            <CardContent className="pt-4 text-xs space-y-1">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5" /> Separate module
              </div>
              <p className="text-gray-400">SmurfPakad / MuleCatcher transaction graphs stay distinct unless authorised linkage exists.</p>
            </CardContent>
          </Card>
          <Card className="dark:bg-white/5 dark:border-indigo-500/20">
            <CardContent className="pt-4 text-xs space-y-1">
              <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" /> Investigation layer
              </div>
              <p className="text-gray-400">Evidence-linked reports only — no fabricated event IDs or intent claims.</p>
            </CardContent>
          </Card>
        </div>

        {/* Scenario picker */}
        <Card className="dark:bg-white/5 dark:border-crypto-purple/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-crypto-purple" />
              Demo scenes — pick a market window
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-3 gap-2">
              {scenarios.map((s) => (
                <button
                  key={s.scenarioId}
                  type="button"
                  onClick={() => setSelectedId(s.scenarioId)}
                  className={`text-left rounded-lg border px-3 py-3 transition-colors ${
                    selectedId === s.scenarioId
                      ? "border-crypto-purple bg-crypto-purple/15"
                      : "border-white/10 bg-black/20 hover:border-white/25"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">{s.scenarioName}</span>
                    <Badge className={labelBadge(s.fusion.label)}>{s.fusion.label}</Badge>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{s.description}</p>
                  <div className={`text-lg font-bold mt-2 ${scoreColor(s.fusion.score)}`}>
                    {(s.fusion.score * 100).toFixed(0)}%
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {selected && (
          <div className="grid lg:grid-cols-5 gap-4">
            {/* Left: path + events */}
            <div className="lg:col-span-3 space-y-4">
              <Card className="dark:bg-white/5 dark:border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Market-state path · {selected.instrument}
                    </span>
                    <span className="text-xs font-normal text-gray-500">
                      {selected.windowStart} → {selected.windowEnd}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MiniPathChart analysis={selected} />
                  <div>
                    <div className="text-xs font-semibold text-gray-300 mb-2">Event timeline</div>
                    <EventTimeline analysis={selected} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded border border-white/10 p-2">
                      <div className="text-gray-500">Events</div>
                      <div className="text-white font-semibold">{selected.events.length}</div>
                    </div>
                    <div className="rounded border border-white/10 p-2">
                      <div className="text-gray-500">Net return</div>
                      <div className="text-white font-semibold">
                        {(selected.conventional.netReturn * 100).toFixed(3)}%
                      </div>
                    </div>
                    <div className="rounded border border-white/10 p-2">
                      <div className="text-gray-500">Cancel/exec</div>
                      <div className="text-white font-semibold">
                        {selected.conventional.cancelExecRatio.toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded border border-white/10 p-2">
                      <div className="text-gray-500">Lévy area</div>
                      <div className="text-white font-semibold">
                        {selected.signature.levyAreaXY.toFixed(4)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Feature groups */}
              <div className="grid sm:grid-cols-3 gap-3">
                <Card className="dark:bg-white/5 dark:border-white/10">
                  <CardContent className="pt-4 space-y-2">
                    <div className="text-xs font-semibold text-gray-300">C · Conventional</div>
                    <div className={`text-2xl font-bold ${scoreColor(selected.fusion.conventionalScore)}`}>
                      {(selected.fusion.conventionalScore * 100).toFixed(0)}
                    </div>
                    <ul className="text-[11px] text-gray-400 space-y-0.5">
                      <li>Cancel intensity {selected.conventional.cancelIntensity.toFixed(1)}/s</li>
                      <li>Exec intensity {selected.conventional.execIntensity.toFixed(1)}/s</li>
                      <li>Depth vol {(selected.conventional.depthVolatility * 100).toFixed(0)}%</li>
                    </ul>
                  </CardContent>
                </Card>
                <Card className="dark:bg-white/5 dark:border-indigo-500/20">
                  <CardContent className="pt-4 space-y-2">
                    <div className="text-xs font-semibold text-indigo-300">S · Signatures (deg-2)</div>
                    <div className={`text-2xl font-bold ${scoreColor(selected.fusion.signatureScore)}`}>
                      {(selected.fusion.signatureScore * 100).toFixed(0)}
                    </div>
                    <ul className="text-[11px] text-gray-400 space-y-0.5">
                      <li>Dims: {selected.signature.dims.join(", ")}</li>
                      <li>L1 terms: {selected.signature.level1.length}</li>
                      <li>L2 terms: {selected.signature.level2.length}</li>
                    </ul>
                  </CardContent>
                </Card>
                <Card className="dark:bg-white/5 dark:border-pink-500/20">
                  <CardContent className="pt-4 space-y-2">
                    <div className="text-xs font-semibold text-pink-300">H · Hawkes-style</div>
                    <div className={`text-2xl font-bold ${scoreColor(selected.fusion.hawkesScore)}`}>
                      {(selected.fusion.hawkesScore * 100).toFixed(0)}
                    </div>
                    <ul className="text-[11px] text-gray-400 space-y-0.5">
                      <li>Burstiness {selected.hawkes.burstiness.toFixed(2)}</li>
                      <li>ρ(B) ≈ {selected.hawkes.spectralRadiusApprox.toFixed(3)}</li>
                      <li>Types: {selected.hawkes.eventTypes.length}</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Right: evidence report */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="dark:bg-white/5 dark:border-crypto-purple/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-crypto-purple" />
                    Evidence-linked alert
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <Badge className={labelBadge(selected.fusion.label)}>
                      {selected.fusion.label === "alert" ? (
                        <><AlertTriangle className="h-3 w-3 mr-1" /> Review required</>
                      ) : selected.fusion.label === "review" ? (
                        "Elevated — monitor"
                      ) : (
                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Within envelope</>
                      )}
                    </Badge>
                    <span className={`text-xl font-bold ${scoreColor(selected.fusion.score)}`}>
                      {(selected.fusion.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500">{selected.fusion.scoreType}</p>

                  <div>
                    <div className="font-semibold text-white mb-1">Triggered features</div>
                    <div className="flex flex-wrap gap-1">
                      {selected.fusion.triggeredFeatures.length ? (
                        selected.fusion.triggeredFeatures.map((f) => (
                          <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                        ))
                      ) : (
                        <span className="text-gray-500">None above threshold</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold text-white mb-1">Evidence</div>
                    <ul className="space-y-1 text-gray-300">
                      {selected.fusion.evidence.map((e, i) => (
                        <li key={i} className="flex gap-1.5">
                          <Sparkles className="h-3 w-3 text-crypto-purple shrink-0 mt-0.5" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold text-white mb-1">Interpretation</div>
                    <p className="text-gray-400 leading-relaxed">
                      Combined evidence{" "}
                      {selected.fusion.label === "alert"
                        ? "warrants further review"
                        : selected.fusion.label === "review"
                          ? "is elevated relative to the ordinary window"
                          : "does not cross the screening threshold"}
                      . Current data does <em>not</em> establish trader intent or prove market manipulation.
                    </p>
                  </div>

                  <div>
                    <div className="font-semibold text-white mb-1">Limitations</div>
                    <ul className="text-gray-500 space-y-0.5">
                      {selected.fusion.limitations.map((l, i) => (
                        <li key={i}>• {l}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" className="bg-crypto-purple hover:bg-crypto-dark-purple" onClick={copyReport}>
                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                      Copy report
                    </Button>
                    <Link to="/cryptoflow/graph">
                      <Button size="sm" variant="outline">
                        <GitBranch className="h-3.5 w-3.5 mr-1.5" />
                        Open transaction graph
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Ablation */}
              {ablation && (
                <Card className="dark:bg-white/5 dark:border-white/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Ablation snapshot (Scene 5)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-[10px] text-gray-500 grid grid-cols-3 gap-1 font-medium">
                      <span>Model</span>
                      <span className="text-right">Normal</span>
                      <span className="text-right">Spoof-like</span>
                    </div>
                    {ablation.models.map((m) => (
                      <div key={m.name} className="grid grid-cols-3 gap-1 text-xs border-t border-white/5 pt-1.5">
                        <span className="text-gray-300 truncate">{m.name}</span>
                        <span className={`text-right ${scoreColor(m.normal)}`}>{(m.normal * 100).toFixed(0)}</span>
                        <span className={`text-right font-semibold ${scoreColor(m.alert)}`}>{(m.alert * 100).toFixed(0)}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-gray-500 pt-2 leading-relaxed">{ablation.claim}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Bottom: research framing */}
        <Card className="dark:bg-indigo-950/30 dark:border-indigo-500/20">
          <CardContent className="pt-5 text-xs text-gray-400 space-y-2">
            <div className="font-semibold text-indigo-200">Research hypothesis (H₁)</div>
            <p>
              At a matched false-positive rate, Performance(Signatures + Hawkes) &gt; Performance(Conventional)
              for detecting defined suspicious order-flow patterns on chronological holdouts.
            </p>
            <p>
              This prototype implements the feature pipeline and an illustrative fusion score for demos.
              Production claims require labelled/synthetic evaluation protocols, calibration, and held-out sessions —
              not headline accuracy alone.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
