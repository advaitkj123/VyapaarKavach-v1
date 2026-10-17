/**
 * NetworkGraph3D — Three.js 3D transaction network visualization
 * Renders wallets as nodes and transactions as animated edges.
 * Suspicious nodes pulse red. Perfect for the Graph and Dashboard pages.
 */
import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { ErrorBoundary } from "./ErrorBoundary";

interface Node3D {
  id: string;
  position: [number, number, number];
  riskScore: number;
  platform: "paytm" | "phonepe" | "gpay" | "bank";
}

interface Edge3D {
  from: string;
  to: string;
  amount: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  paytm: "#00baf2",
  phonepe: "#6739b7",
  gpay: "#4285f4",
  bank: "#34a853",
};

function NodeMesh({ node }: { node: Node3D }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isSuspicious = node.riskScore > 0.7;
  const color = isSuspicious ? "#ef4444" : PLATFORM_COLORS[node.platform] ?? "#8b5cf6";
  const scale = 0.12 + node.riskScore * 0.22;

  useFrame((state) => {
    if (!meshRef.current) return;
    if (isSuspicious) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
      meshRef.current.scale.setScalar(pulse * scale);
    }
  });

  return (
    <mesh ref={meshRef} position={node.position} scale={scale}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isSuspicious ? 0.8 : 0.3}
        metalness={0.6}
        roughness={0.2}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function EdgeLine({ from, to, nodes }: { from: string; to: string; nodes: Node3D[] }) {
  const fromNode = nodes.find((n) => n.id === from);
  const toNode = nodes.find((n) => n.id === to);
  if (!fromNode || !toNode) return null;

  const points = [
    new THREE.Vector3(...fromNode.position),
    new THREE.Vector3(...toNode.position),
  ];

  return (
    <Line
      points={points}
      color="#4f9cf9"
      lineWidth={0.5}
      transparent
      opacity={0.3}
    />
  );
}

function AnimatedEdge({ from, to, nodes }: { from: string; to: string; nodes: Node3D[] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const fromNode = nodes.find((n) => n.id === from);
  const toNode = nodes.find((n) => n.id === to);

  useFrame((state) => {
    if (!meshRef.current || !fromNode || !toNode) return;
    const t = (Math.sin(state.clock.elapsedTime * 1.5) + 1) / 2;
    meshRef.current.position.lerpVectors(
      new THREE.Vector3(...fromNode.position),
      new THREE.Vector3(...toNode.position),
      t
    );
  });

  if (!fromNode || !toNode) return null;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1} />
    </mesh>
  );
}

function Scene({ nodes, edges }: { nodes: Node3D[]; edges: Edge3D[] }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[3, 3, 3]} intensity={2} color="#4f9cf9" />
      <pointLight position={[-3, -3, 3]} intensity={1} color="#8b5cf6" />
      {nodes.map((node) => (
        <NodeMesh key={node.id} node={node} />
      ))}
      {edges.map((edge, i) => (
        <>
          <EdgeLine key={`line-${i}`} from={edge.from} to={edge.to} nodes={nodes} />
          <AnimatedEdge key={`anim-${i}`} from={edge.from} to={edge.to} nodes={nodes} />
        </>
      ))}
      <OrbitControls autoRotate autoRotateSpeed={0.5} enableZoom={true} enablePan={false} />
      <fog attach="fog" args={["#050510", 8, 20]} />
      <gridHelper args={[10, 10, "#1a1a3e", "#1a1a3e"]} position={[0, -1.5, 0]} />
    </>
  );
}

// Generate demo nodes
function generateDemoNodes(): Node3D[] {
  const platforms: Array<"paytm" | "phonepe" | "gpay" | "bank"> = ["paytm", "phonepe", "gpay", "bank"];
  return Array.from({ length: 20 }, (_, i) => ({
    id: `node-${i}`,
    position: [
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
    ] as [number, number, number],
    riskScore: i < 5 ? 0.7 + Math.random() * 0.3 : Math.random() * 0.5,
    platform: platforms[i % 4],
  }));
}

function generateDemoEdges(nodes: Node3D[]): Edge3D[] {
  return Array.from({ length: 30 }, () => {
    const from = nodes[Math.floor(Math.random() * nodes.length)];
    const to = nodes[Math.floor(Math.random() * nodes.length)];
    return { from: from.id, to: to.id, amount: Math.random() * 100000 };
  });
}

interface Props {
  nodes?: Node3D[];
  edges?: Edge3D[];
  height?: string;
}

export default function NetworkGraph3D({ nodes, edges, height = "400px" }: Props) {
  const demoNodes = useMemo(() => nodes ?? generateDemoNodes(), [nodes]);
  const demoEdges = useMemo(() => edges ?? generateDemoEdges(demoNodes), [edges, demoNodes]);

  return (
    <div style={{ width: "100%", height, borderRadius: "12px", overflow: "hidden" }}>
      <ErrorBoundary fallback={<div className="flex h-full w-full items-center justify-center text-gray-500 bg-gray-900/20 rounded-xl border border-gray-800">3D Graph Unavailable (WebGL not supported)</div>}>
        <Canvas camera={{ position: [4, 3, 5], fov: 55 }} gl={{ powerPreference: 'low-power', antialias: false }}>
          <Scene nodes={demoNodes} edges={demoEdges} />
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}
