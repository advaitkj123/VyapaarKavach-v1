/**
 * LiveAlertBanner — Real-time WebSocket alert component
 * Shows a dismissable red banner at the top of the dashboard
 * when the backend flags a new high-risk wallet via WebSocket.
 *
 * Falls back gracefully when backend is offline (no errors shown).
 */
import { useState, useEffect, useRef } from "react";
import { AlertTriangle, X, ArrowRight, Wifi, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import gsap from "gsap";

interface Alert {
  id: string;
  walletId: string;
  riskScore: number;
  platform: string;
  message: string;
  timestamp: string;
}

const WS_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000")
  .replace("http://", "ws://")
  .replace("https://", "wss://");

export default function LiveAlertBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connectWS = () => {
    try {
      const ws = new WebSocket(`${WS_URL}/ws/alerts`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // WS connected silently
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "high_risk_alert" || data.riskScore > 0.75) {
            const alert: Alert = {
              id: data.id || crypto.randomUUID(),
              walletId: data.walletId || data.wallet_id || "Unknown",
              riskScore: data.riskScore || data.risk_score || 0.9,
              platform: data.platform || "Unknown",
              message: data.message || `High-risk wallet detected — ${data.platform}`,
              timestamp: data.timestamp || new Date().toISOString(),
            };
            setAlerts((prev) => [alert, ...prev.slice(0, 4)]); // max 5
            animateIn();
          }
        } catch { /* no-op: invalid JSON from WS is silently discarded */ }
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 5s silently
        reconnectTimer.current = setTimeout(connectWS, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // Backend offline — silent fail, no UI error
    }
  };

  useEffect(() => {
    connectWS();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  const animateIn = () => {
    if (!bannerRef.current) return;
    gsap.fromTo(
      bannerRef.current,
      { y: -60, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.4)" }
    );
    // Pulse effect
    gsap.to(bannerRef.current, {
      boxShadow: "0 0 30px rgba(239,68,68,0.6)",
      duration: 0.4,
      repeat: 3,
      yoyo: true,
    });
  };

  const dismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));

  // Demo mode: inject a sample alert if no WS connection after 3s
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!connected && alerts.length === 0) {
        const demoAlert: Alert = {
          id: "demo-001",
          walletId: "PTM-0x8f4a...2b91",
          riskScore: 0.94,
          platform: "Paytm",
          message: "Smurfing pattern detected — 47 micro-transactions in 90min",
          timestamp: new Date().toISOString(),
        };
        setAlerts([demoAlert]);
        animateIn();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [connected]);

  if (visibleAlerts.length === 0) return null;

  return (
    <div ref={bannerRef} className="space-y-2 mb-4">
      {visibleAlerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/40 bg-red-500/10 backdrop-blur-sm"
          style={{ boxShadow: "0 0 20px rgba(239,68,68,0.2)" }}
        >
          {/* Pulse dot */}
          <div className="relative flex-shrink-0">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-red-500 animate-ping opacity-50" />
          </div>

          {/* Alert icon */}
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />

          {/* Message */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                🚨 LIVE ALERT
              </span>
              <span className="text-xs text-white/60">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-white font-medium truncate">
              <span className="text-red-300 font-mono">{alert.walletId}</span>
              {" — "}
              {alert.message}
            </p>
          </div>

          {/* Risk badge */}
          <span className="flex-shrink-0 px-2 py-0.5 text-xs font-bold rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
            {(alert.riskScore * 100).toFixed(0)}% RISK
          </span>

          {/* Investigate CTA */}
          <Link
            to={`/cryptoflow/warroom`}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            Investigate <ArrowRight className="h-3 w-3" />
          </Link>

          {/* Dismiss */}
          <button
            onClick={() => dismiss(alert.id)}
            className="flex-shrink-0 p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
