/**
 * AnalyticsChart3D — Three.js 3D bar chart for risk analytics
 * Renders animated 3D bars with glow effects for risk scores per platform.
 * Used on Analysis, Benchmarks, and Governance pages.
 */
import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { ErrorBoundary } from "./ErrorBoundary";

interface BarData {
  label: string;
  value: number;        // 0–1
  color: string;
  sublabel?: string;
}

function AnimatedBar({ bar, index, maxValue }: { bar: BarData; index: number; maxValue: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetHeight = (bar.value / maxValue) * 3;
  const currentHeight = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    currentHeight.current = THREE.MathUtils.lerp(currentHeight.current, targetHeight, delta * 2);
    meshRef.current.scale.y = currentHeight.current;
    meshRef.current.position.y = currentHeight.current / 2;
  });

  const x = (index - 2) * 1.4;

  return (
    <group position={[x, 0, 0]}>
      {/* Bar */}
      <RoundedBox ref={meshRef} args={[0.9, 1, 0.5]} radius={0.08} smoothness={4} position={[0, 0, 0]}>
        <meshStandardMaterial
          color={bar.color}
          emissive={bar.color}
          emissiveIntensity={0.3}
          metalness={0.4}
          roughness={0.3}
          transparent
          opacity={0.9}
        />
      </RoundedBox>

      {/* Value label on top */}
      <Text
        position={[0, targetHeight + 0.3, 0]}
        fontSize={0.22}
        color="white"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {(bar.value * 100).toFixed(0)}%
      </Text>

      {/* Bottom label */}
      <Text
        position={[0, -0.35, 0]}
        fontSize={0.16}
        color="#9ca3af"
        anchorX="center"
        anchorY="top"
      >
        {bar.label}
      </Text>

      {/* Sublabel */}
      {bar.sublabel && (
        <Text
          position={[0, -0.6, 0]}
          fontSize={0.12}
          color={bar.color}
          anchorX="center"
          anchorY="top"
        >
          {bar.sublabel}
        </Text>
      )}

      {/* Glow plane at base */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.9, 0.5]} />
        <meshStandardMaterial color={bar.color} emissive={bar.color} emissiveIntensity={0.5} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function GridFloor() {
  return (
    <>
      <gridHelper args={[12, 12, "#1e293b", "#1e293b"]} position={[0, -0.02, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#050510" transparent opacity={0.8} />
      </mesh>
    </>
  );
}

const DEFAULT_BARS: BarData[] = [
  { label: "Paytm", value: 0.87, color: "#ef4444", sublabel: "HIGH RISK" },
  { label: "PhonePe", value: 0.62, color: "#f97316", sublabel: "MEDIUM" },
  { label: "GPay", value: 0.43, color: "#eab308", sublabel: "MEDIUM" },
  { label: "HDFC", value: 0.18, color: "#22c55e", sublabel: "LOW" },
  { label: "SBI", value: 0.74, color: "#ef4444", sublabel: "HIGH RISK" },
];

interface Props {
  bars?: BarData[];
  height?: string;
  title?: string;
}

export default function AnalyticsChart3D({ bars = DEFAULT_BARS, height = "320px", title }: Props) {
  const maxValue = useMemo(() => Math.max(...bars.map((b) => b.value)), [bars]);

  return (
    <div style={{ width: "100%", height, borderRadius: "12px", overflow: "hidden" }}>
      {title && (
        <div style={{
          position: "absolute",
          top: 12, left: 16,
          color: "rgba(255,255,255,0.7)",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          pointerEvents: "none",
          zIndex: 10,
        }}>
          {title}
        </div>
      )}
      <ErrorBoundary fallback={<div className="flex h-full w-full items-center justify-center text-gray-500 bg-gray-900/20 rounded-xl border border-gray-800">3D Analytics Unavailable (WebGL not supported)</div>}>
        <Canvas camera={{ position: [0, 3.5, 7], fov: 50 }} gl={{ powerPreference: 'low-power', antialias: false }}>
          <ambientLight intensity={0.3} />
          <pointLight position={[0, 8, 3]} intensity={1.5} color="white" />
          <pointLight position={[-4, 2, 4]} intensity={0.8} color="#4f9cf9" />
          <pointLight position={[4, 2, 4]} intensity={0.8} color="#8b5cf6" />
          <fog attach="fog" args={["#050510", 10, 25]} />
          <GridFloor />
          {bars.map((bar, i) => (
            <AnimatedBar key={i} bar={bar} index={i} maxValue={maxValue} />
          ))}
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}
