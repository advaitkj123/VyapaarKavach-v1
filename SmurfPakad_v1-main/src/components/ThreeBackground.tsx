import { useEffect, useRef, useState } from 'react';

interface ThreeBackgroundProps {
  variant?: 'particles' | 'cubes' | 'waves';
}

const ThreeBackground = ({ variant = 'particles' }: ThreeBackgroundProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationIdRef = useRef<number | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const THREE = await import('three');
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 30;

        // WebGLRenderer creation is where ANGLE errors happen — catch it specifically
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
        } catch {
          setWebglFailed(true);
          return;
        }

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        if (containerRef.current) containerRef.current.appendChild(renderer.domElement);

        const objects: THREE.Object3D[] = [];

        if (variant === 'particles') {
          const geo = new THREE.BufferGeometry();
          const count = 600;
          const pos = new Float32Array(count * 3);
          const col = new Float32Array(count * 3);
          for (let i = 0; i < count * 3; i += 3) {
            pos[i] = (Math.random() - 0.5) * 100;
            pos[i + 1] = (Math.random() - 0.5) * 100;
            pos[i + 2] = (Math.random() - 0.5) * 100;
            col[i] = 0.5 + Math.random() * 0.5;
            col[i + 1] = 0.2 + Math.random() * 0.3;
            col[i + 2] = 0.8 + Math.random() * 0.2;
          }
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          const mat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
          const pts = new THREE.Points(geo, mat);
          scene.add(pts);
          objects.push(pts);

        } else if (variant === 'cubes') {
          const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
          for (let i = 0; i < 20; i++) {
            const c = new THREE.Color().setHSL(Math.random() * 0.2 + 0.6, 0.8, 0.5);
            const cube = new THREE.Mesh(cubeGeo, new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 }));
            cube.position.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50);
            cube.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            scene.add(cube);
            objects.push(cube);
          }
          scene.add(new THREE.AmbientLight(0x404040));
          const pl = new THREE.PointLight(0x8b5cf6, 1, 100);
          pl.position.set(0, 0, 20);
          scene.add(pl);

        } else if (variant === 'waves') {
          const wGeo = new THREE.PlaneGeometry(50, 50, 20, 20);
          const plane = new THREE.Mesh(wGeo, new THREE.MeshPhongMaterial({ color: 0x8b5cf6, emissive: 0x4c1d95, emissiveIntensity: 0.3, wireframe: true, transparent: true, opacity: 0.6 }));
          plane.rotation.x = -Math.PI / 4;
          scene.add(plane);
          objects.push(plane);
          scene.add(new THREE.AmbientLight(0x404040));
          const dl = new THREE.DirectionalLight(0x8b5cf6, 1);
          dl.position.set(0, 1, 1);
          scene.add(dl);
        }

        let time = 0;
        const animate = () => {
          animationIdRef.current = requestAnimationFrame(animate);
          time += 0.01;
          if (variant === 'particles') {
            objects.forEach(o => { o.rotation.y += 0.001; o.rotation.x += 0.0005; });
          } else if (variant === 'cubes') {
            objects.forEach((c, i) => { c.rotation.x += 0.01; c.rotation.y += 0.01; c.position.y += Math.sin(time + i) * 0.02; });
          } else if (variant === 'waves') {
            const plane = objects[0] as THREE.Mesh;
            const arr = (plane.geometry as THREE.PlaneGeometry).attributes.position.array as Float32Array;
            for (let i = 0; i < arr.length; i += 3) {
              arr[i + 2] = Math.sin(arr[i] * 0.1 + time) * 2 + Math.cos(arr[i + 1] * 0.1 + time) * 2;
            }
            (plane.geometry as THREE.PlaneGeometry).attributes.position.needsUpdate = true;
            plane.rotation.z += 0.002;
          }
          renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        cleanup = () => {
          window.removeEventListener('resize', handleResize);
          if (animationIdRef.current !== null) {
            cancelAnimationFrame(animationIdRef.current);
          }
          if (containerRef.current && renderer.domElement) {
            containerRef.current.removeChild(renderer.domElement);
          }
          renderer.dispose();
          objects.forEach(obj => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
              obj.geometry.dispose();
              (obj.material as THREE.Material).dispose();
            }
          });
        };
      } catch (err) {
        console.warn('ThreeJS WebGL initialization failed (falling back to CSS):', err);
        setWebglFailed(true);
      }
    })();

    return () => { cleanup?.(); };
  }, [variant]);

  if (webglFailed) {
    return (
      <div
        className="fixed inset-0 -z-10 opacity-20"
        style={{
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 20% 20%, #7c3aed 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #4f46e5 0%, transparent 50%)',
        }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 -z-10 opacity-30 dark:opacity-20"
      style={{ pointerEvents: 'none' }}
    />
  );
};

export default ThreeBackground;
