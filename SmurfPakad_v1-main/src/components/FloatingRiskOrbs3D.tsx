/**
 * FloatingRiskOrbs3D — 3D risk score visualization
 * Wraps react-three/fiber Canvas in an error boundary so WebGL failures
 * (ANGLE_instanced_arrays, software renderer, etc.) fall back to a CSS animation.
 */
import { useRef, useMemo, Component, ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, MeshDistortMaterial, Float, Text } from "@react-three/drei";
import * as THREE from "three";

interface RiskOrb {
  position: [number, number, number];
  riskScore: number;
  label: string;
  color: string;
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class WebGLErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.warn('FloatingRiskOrbs3D WebGL error (using fallback):', error); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// ─── CSS Fallback ─────────────────────────────────────────────────────────────
function CSSFallbackOrbs({ orbs }: { orbs: RiskOrb[] }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-xl overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 40%, rgba(139,92,246,0.15) 0%, transparent 60%), radial-gradient(circle at 70% 60%, rgba(79,146,249,0.1) 0%, transparent 60%)' }} />
      <div className="flex items-end justify-center gap-4 w-full px-6 pb-4" style={{ height: '100%', alignItems: 'flex-end' }}>
        {orbs.map((orb, i) => {
          const size = 40 + orb.riskScore * 60;
          const color = orb.color;
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-2"
              style={{ animation: `float-orb ${2 + i * 0.3}s ease-in-out infinite alternate`, animationDelay: `${i * 0.2}s` }}
            >
              <div
                style={{
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}44)`,
                  boxShadow: `0 0 ${size * 0.4}px ${color}66, 0 0 ${size * 0.8}px ${color}22`,
                  border: `1px solid ${color}44`,
                }}
              />
              <span className="text-xs text-gray-400 text-center leading-tight whitespace-nowrap" style={{ maxWidth: 70, fontSize: 10 }}>{orb.label}</span>
              <span className="text-xs font-bold" style={{ color, fontSize: 11 }}>{(orb.riskScore * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes float-orb {
          from { transform: translateY(0px); }
          to   { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}

// ─── 3D Orb Mesh ──────────────────────────────────────────────────────────────
function RiskOrbMesh({ orb, index }: { orb: RiskOrb; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const scale = 0.4 + orb.riskScore * 0.8;

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x = state.clock.elapsedTime * 0.3 + index;
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.5 + index;
  });

  return (
    <Float speed={1.5 + index * 0.3} rotationIntensity={0.4} floatIntensity={0.8}>
      <group position={orb.position}>
        <Sphere ref={meshRef} args={[scale, 32, 32]}>
          <MeshDistortMaterial
            color={orb.color}
            distort={0.3 + orb.riskScore * 0.2}
            speed={2}
            roughness={0.1}
            metalness={0.8}
            transparent
            opacity={0.85}
          />
        </Sphere>
        <Text position={[0, -scale - 0.3, 0]} fontSize={0.18} color="white" anchorX="center" anchorY="middle">
          {orb.label}
        </Text>
        <Text position={[0, -scale - 0.55, 0]} fontSize={0.14} color={orb.color} anchorX="center" anchorY="middle">
          {(orb.riskScore * 100).toFixed(0)}%
        </Text>
      </group>
    </Float>
  );
}

function ParticleField() {
  const points = useRef<THREE.Points>(null);
  const count = 300;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    points.current.rotation.y = state.clock.elapsedTime * 0.02;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#4f9cf9" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

interface Props {
  orbs?: RiskOrb[];
  height?: string;
}

const DEFAULT_ORBS: RiskOrb[] = [
  { position: [-2.5, 0, 0],  riskScore: 0.92, label: "Paytm Network",  color: "#ef4444" },
  { position: [0, 0.5, 0],   riskScore: 0.67, label: "PhonePe Hub",    color: "#f97316" },
  { position: [2.5, 0, 0],   riskScore: 0.41, label: "GPay Cluster",   color: "#eab308" },
  { position: [-1.2, -1.5, 1], riskScore: 0.18, label: "HDFC Branch",  color: "#22c55e" },
  { position: [1.2, -1.5, 1],  riskScore: 0.78, label: "SBI Gateway",  color: "#ef4444" },
];

export default function FloatingRiskOrbs3D({ orbs = DEFAULT_ORBS, height = "350px" }: Props) {
  return (
    <div style={{ width: "100%", height, borderRadius: "12px", overflow: "hidden" }}>
      <WebGLErrorBoundary fallback={<CSSFallbackOrbs orbs={orbs} />}>
        <Canvas camera={{ position: [0, 0, 7], fov: 60 }} gl={{ powerPreference: 'low-power', antialias: false }}>
          <ambientLight intensity={0.3} />
          <pointLight position={[5, 5, 5]}   intensity={1.5} color="#4f9cf9" />
          <pointLight position={[-5, -5, 5]} intensity={1}   color="#8b5cf6" />
          <fog attach="fog" args={["#0a0a1a", 8, 20]} />
          <ParticleField />
          {orbs.map((orb, i) => (
            <RiskOrbMesh key={i} orb={orb} index={i} />
          ))}
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}
