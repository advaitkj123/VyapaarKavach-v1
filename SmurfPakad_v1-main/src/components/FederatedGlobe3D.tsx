/**
 * FederatedGlobe3D — 3D rotating globe showing cross-bank federated learning
 * Three glowing nodes (Paytm, PhonePe, GPay) orbit a central model node
 * with animated gradient beams showing gradient sharing.
 */
import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, Torus, Text, Float, Line } from "@react-three/drei";
import * as THREE from "three";
import { ErrorBoundary } from "./ErrorBoundary";

const BANKS = [
  { name: "Paytm", color: "#00baf2", angle: 0 },
  { name: "PhonePe", color: "#7c3aed", angle: (Math.PI * 2) / 3 },
  { name: "GPay", color: "#4285f4", angle: (Math.PI * 4) / 3 },
];

function CentralModel() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
  });

  return (
    <group>
      <Sphere ref={meshRef} args={[0.5, 32, 32]}>
        <meshStandardMaterial
          color="#4f9cf9"
          emissive="#4f9cf9"
          emissiveIntensity={0.6}
          metalness={0.9}
          roughness={0.1}
        />
      </Sphere>
      <Torus args={[0.7, 0.02, 16, 100]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#4f9cf9" emissive="#4f9cf9" emissiveIntensity={0.4} transparent opacity={0.6} />
      </Torus>
      <Text position={[0, -0.9, 0]} fontSize={0.18} color="white" anchorX="center">
        Global Model
      </Text>
    </group>
  );
}

function BankNode({ bank, orbitRadius = 2.5 }: { bank: typeof BANKS[0]; orbitRadius?: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime * 0.4;
    const x = Math.cos(bank.angle + t) * orbitRadius;
    const z = Math.sin(bank.angle + t) * orbitRadius;
    groupRef.current.position.set(x, 0, z);
  });

  return (
    <group ref={groupRef}>
      <Float speed={2} floatIntensity={0.3}>
        <Sphere args={[0.28, 24, 24]}>
          <meshStandardMaterial
            color={bank.color}
            emissive={bank.color}
            emissiveIntensity={0.5}
            metalness={0.7}
            roughness={0.2}
          />
        </Sphere>
        <Text position={[0, 0.5, 0]} fontSize={0.15} color={bank.color} anchorX="center">
          {bank.name}
        </Text>
      </Float>
    </group>
  );
}

function OrbitRing() {
  return (
    <Torus args={[2.5, 0.01, 8, 120]} rotation={[Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color="#334155" transparent opacity={0.4} />
    </Torus>
  );
}

function DataPacket({ bank, speed }: { bank: typeof BANKS[0]; speed: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = (state.clock.elapsedTime * speed) % 1;
    const angle = bank.angle + state.clock.elapsedTime * 0.4;
    const x = Math.cos(angle) * 2.5 * (1 - t);
    const z = Math.sin(angle) * 2.5 * (1 - t);
    meshRef.current.position.set(x, 0, z);
    meshRef.current.material.opacity = 1 - t;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshStandardMaterial color={bank.color} emissive={bank.color} emissiveIntensity={2} transparent />
    </mesh>
  );
}

interface Props {
  height?: string;
  isTraining?: boolean;
}

export default function FederatedGlobe3D({ height = "380px", isTraining = false }: Props) {
  return (
    <div style={{ width: "100%", height, borderRadius: "12px", overflow: "hidden" }}>
      <ErrorBoundary fallback={<div className="flex h-full w-full items-center justify-center text-gray-500 bg-gray-900/20 rounded-xl border border-gray-800">3D Globe Unavailable (WebGL not supported)</div>}>
        <Canvas camera={{ position: [0, 3, 6], fov: 55 }} gl={{ powerPreference: 'low-power', antialias: false }}>
          <ambientLight intensity={0.2} />
          <pointLight position={[0, 5, 0]} intensity={2} color="#4f9cf9" />
          <pointLight position={[0, -3, 0]} intensity={0.5} color="#8b5cf6" />
          <fog attach="fog" args={["#050510", 8, 20]} />

          <CentralModel />
          <OrbitRing />

          {BANKS.map((bank) => (
            <BankNode key={bank.name} bank={bank} />
          ))}

          {isTraining && BANKS.map((bank) => (
            <DataPacket key={bank.name} bank={bank} speed={0.6 + Math.random() * 0.3} />
          ))}
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}
