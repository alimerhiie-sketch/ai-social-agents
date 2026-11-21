import React, { useMemo } from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { withAlpha } from "../../brand";
import type { Beat } from "../../types";
import type { Look } from "../looks";
import { pr } from "../theme";

// 3D hero objects for the blueprint (technical cutaway) and cosmic (glowing isometric) looks.
// Built from primitives, every motion driven by the frame (Remotion rule: no useFrame).

export type ObjectId = "engine" | "chip" | "server" | "brain" | "gem" | "globe" | "phone" | "coins" | "cubes" | "lock";
export const OBJECTS: ObjectId[] = ["engine", "chip", "server", "brain", "gem", "globe", "phone", "coins", "cubes", "lock"];

type M = { look: Look; f: number; seed: number };

/** Material set per look: blueprint = matte pale with line edges; cosmic = glossy emissive. */
function useMats(look: Look) {
  return useMemo(() => {
    const blue = look.id === "blueprint";
    return {
      body: new THREE.MeshStandardMaterial({ color: blue ? "#E9F1FF" : "#7C5CFF", roughness: blue ? 0.55 : 0.25, metalness: blue ? 0.1 : 0.35, emissive: blue ? "#0A1E44" : "#2A1470", emissiveIntensity: blue ? 0.15 : 0.5 }),
      dark: new THREE.MeshStandardMaterial({ color: blue ? "#9FB8E6" : "#2A1F66", roughness: 0.6, metalness: 0.2 }),
      accent: new THREE.MeshStandardMaterial({ color: look.accent, emissive: look.accent, emissiveIntensity: blue ? 0.8 : 1.4, roughness: 0.3 }),
      accent2: new THREE.MeshStandardMaterial({ color: look.accent2, emissive: look.accent2, emissiveIntensity: blue ? 0.4 : 1.1, roughness: 0.3 }),
      glass: new THREE.MeshStandardMaterial({ color: blue ? "#BFD6FF" : "#FFB3E0", transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1, emissive: blue ? "#000000" : "#FF5FA2", emissiveIntensity: 0.4 }),
      line: new THREE.LineBasicMaterial({ color: blue ? "#0C3A8F" : "#FFFFFF", transparent: true, opacity: blue ? 0.65 : 0.3 }),
    };
  }, [look]);
}

/** Mesh with its outline edges (the blueprint line look). */
function Edged({ geometry, material, line, position, rotation, scale }: { geometry: THREE.BufferGeometry; material: THREE.Material; line: THREE.LineBasicMaterial; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number | [number, number, number] }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 25), [geometry]);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={geometry} material={material} />
      <lineSegments geometry={edges} material={line} />
    </group>
  );
}

function Engine({ look, f }: M) {
  const m = useMats(look);
  const shell = useMemo(() => new THREE.CylinderGeometry(1.25, 1.1, 2.6, 48, 1, true, 0, Math.PI * 1.45), []);
  const hub = useMemo(() => new THREE.ConeGeometry(0.42, 0.9, 32), []);
  const blade = useMemo(() => new THREE.BoxGeometry(0.06, 1.0, 0.28), []);
  const core = useMemo(() => new THREE.CylinderGeometry(0.55, 0.45, 1.8, 32), []);
  const spin = f * 0.35;
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <Edged geometry={shell} material={m.body} line={m.line} rotation={[0, 0.6, 0]} />
      <mesh geometry={core} material={m.dark} position={[0, -0.3, 0]} />
      <group position={[0, 1.15, 0]} rotation={[0, spin, 0]}>
        <mesh geometry={hub} material={m.body} position={[0, 0.25, 0]} />
        {Array.from({ length: 14 }, (_, i) => (
          <mesh key={i} geometry={blade} material={m.dark} rotation={[0.35, (i / 14) * Math.PI * 2, Math.PI / 2]} position={[Math.cos((i / 14) * Math.PI * 2) * 0.62, 0, -Math.sin((i / 14) * Math.PI * 2) * 0.62]} />
        ))}
      </group>
      {/* airflow streaks */}
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const t = ((f * 0.04 + i * 0.13) % 1) * 4 - 1;
        return (
          <mesh key={`s${i}`} material={m.accent} position={[Math.cos(a) * 0.95, 2.2 - t * 1.6, Math.sin(a) * 0.95]}>
            <boxGeometry args={[0.03, 0.7, 0.03]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Chip({ look, f }: M) {
  const m = useMats(look);
  const body = useMemo(() => new THREE.BoxGeometry(2.2, 0.28, 2.2), []);
  const core = useMemo(() => new THREE.BoxGeometry(1.0, 0.12, 1.0), []);
  const pin = useMemo(() => new THREE.BoxGeometry(0.1, 0.06, 0.4), []);
  const pulse = 0.8 + Math.sin(f / 6) * 0.4;
  return (
    <group rotation={[0.55, f * 0.01, 0]}>
      <Edged geometry={body} material={m.dark} line={m.line} />
      <mesh geometry={core} material={m.accent} position={[0, 0.2, 0]} scale={[1, pulse, 1]} />
      {Array.from({ length: 4 }, (_, side) =>
        Array.from({ length: 7 }, (_, i) => (
          <mesh key={`${side}-${i}`} geometry={pin} material={m.body} rotation={[0, (side * Math.PI) / 2, 0]} position={[Math.cos((side * Math.PI) / 2) * 0 + (side % 2 === 0 ? -0.9 + i * 0.3 : (side === 1 ? 1.3 : -1.3)), 0, side % 2 === 0 ? (side === 0 ? 1.3 : -1.3) : -0.9 + i * 0.3]} />
        )),
      )}
      {/* data lines travelling to the core */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const t = 1 - ((f * 0.03 + i * 0.17) % 1);
        return (
          <mesh key={`d${i}`} material={m.accent2} position={[Math.cos(a) * (0.6 + t * 1.4), 0.22, Math.sin(a) * (0.6 + t * 1.4)]}>
            <sphereGeometry args={[0.06, 12, 12]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Server({ look, f }: M) {
  const m = useMats(look);
  const box = useMemo(() => new THREE.BoxGeometry(2.0, 0.5, 1.4), []);
  return (
    <group rotation={[0.45, -0.6 + Math.sin(f / 60) * 0.15, 0]}>
      {Array.from({ length: 4 }, (_, i) => {
        const p = pr(f, i * 5, 14);
        return (
          <group key={i} position={[0, -0.9 + i * 0.62 + (1 - p) * 3, 0]}>
            <Edged geometry={box} material={m.body} line={m.line} />
            {Array.from({ length: 5 }, (_, j) => (
              <mesh key={j} material={(Math.floor(f / 5) + i + j) % 3 ? m.accent : m.accent2} position={[-0.75 + j * 0.18, 0, 0.71]}>
                <boxGeometry args={[0.1, 0.1, 0.02]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function Brain({ look, f }: M) {
  const m = useMats(look);
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1.3, 3);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const n = 1 + 0.08 * Math.sin(v.x * 5) * Math.cos(v.y * 6) * Math.sin(v.z * 4);
      v.multiplyScalar(n);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const wire = useMemo(() => new THREE.WireframeGeometry(geo), [geo]);
  return (
    <group rotation={[0.2, f * 0.012, 0]}>
      <mesh geometry={geo} material={m.glass} />
      <lineSegments geometry={wire} material={m.line} />
      {Array.from({ length: 16 }, (_, i) => {
        const r = (k: string) => random(`br${i}${k}`);
        const a = r("a") * Math.PI * 2;
        const b = Math.acos(2 * r("b") - 1);
        const on = Math.sin(f / 5 + i * 1.3) > 0.4;
        return (
          <mesh key={i} material={on ? m.accent : m.accent2} position={[Math.sin(b) * Math.cos(a) * 1.32, Math.cos(b) * 1.32, Math.sin(b) * Math.sin(a) * 1.32]}>
            <sphereGeometry args={[on ? 0.08 : 0.05, 12, 12]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Gem({ look, f }: M) {
  const m = useMats(look);
  const gem = useMemo(() => new THREE.OctahedronGeometry(0.9, 0), []);
  const ped = useMemo(() => new THREE.CylinderGeometry(1.1, 1.3, 0.35, 6), []);
  const gemEdges = useMemo(() => new THREE.EdgesGeometry(gem), [gem]);
  return (
    <group rotation={[0.35, 0, 0]}>
      <Edged geometry={ped} material={m.dark} line={m.line} position={[0, -1.4, 0]} />
      <mesh material={m.accent2} position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.45, 32]} />
      </mesh>
      <group position={[0, Math.sin(f / 14) * 0.15, 0]} rotation={[0, f * 0.03, 0]}>
        <mesh geometry={gem} material={m.accent} scale={[1, 1.5, 1]} />
        <lineSegments geometry={gemEdges} material={m.line} scale={[1, 1.5, 1]} />
      </group>
      <group position={[1.5, 0.3 + Math.sin(f / 11 + 1) * 0.2, -0.4]} rotation={[0.3, -f * 0.04, 0.4]}>
        <mesh geometry={gem} material={m.accent2} scale={[0.45, 0.8, 0.45]} />
      </group>
      <group position={[-1.4, -0.2 + Math.sin(f / 13 + 2) * 0.2, 0.3]} rotation={[0.2, f * 0.05, -0.3]}>
        <mesh geometry={gem} material={m.body} scale={[0.35, 0.6, 0.35]} />
      </group>
    </group>
  );
}

function Globe({ look, f }: M) {
  const m = useMats(look);
  const s = useMemo(() => new THREE.SphereGeometry(1.25, 32, 20), []);
  const wire = useMemo(() => new THREE.WireframeGeometry(new THREE.SphereGeometry(1.27, 24, 14)), []);
  return (
    <group rotation={[0.35, 0, 0.15]}>
      <group rotation={[0, f * 0.01, 0]}>
        <mesh geometry={s} material={m.dark} />
        <lineSegments geometry={wire} material={m.line} />
      </group>
      {[0, 1, 2].map((i) => {
        const a = f * (0.03 + i * 0.01) + i * 2;
        return (
          <group key={i} rotation={[i * 0.7, 0, i * 0.5]}>
            <mesh material={m.accent2} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.8 + i * 0.25, 0.008, 6, 80]} />
            </mesh>
            <mesh material={i === 0 ? m.accent : m.body} position={[Math.cos(a) * (1.8 + i * 0.25), 0, Math.sin(a) * (1.8 + i * 0.25)]}>
              <boxGeometry args={[0.16, 0.1, 0.1]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Phone3D({ look, f }: M) {
  const m = useMats(look);
  const body = useMemo(() => new THREE.BoxGeometry(1.3, 2.6, 0.14), []);
  return (
    <group rotation={[0.15, -0.5 + Math.sin(f / 40) * 0.25, 0.08]}>
      <Edged geometry={body} material={m.dark} line={m.line} />
      <mesh material={m.accent2} position={[0, 0, 0.075]}>
        <planeGeometry args={[1.15, 2.4]} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const p = pr(f, 6 + i * 6, 10);
        return (
          <mesh key={i} material={i % 2 ? m.body : m.accent} position={[i % 2 ? 0.15 : -0.12, 0.85 - i * 0.42, 0.09 + (1 - p) * 0.6]} scale={[p, 1, 1]}>
            <boxGeometry args={[0.75, 0.26, 0.02]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Coins({ look, f }: M) {
  const m = useMats(look);
  const coin = useMemo(() => new THREE.CylinderGeometry(0.6, 0.6, 0.14, 40), []);
  const n = Math.min(10, 1 + Math.floor(f / 4));
  return (
    <group rotation={[0.5, f * 0.01, 0]}>
      {Array.from({ length: n }, (_, i) => {
        const p = pr(f, i * 4, 10);
        return <Edged key={i} geometry={coin} material={i % 3 === 0 ? m.accent : m.body} line={m.line} position={[Math.sin(i * 1.9) * 0.05, -1.2 + i * 0.16 + (1 - p) * 2.5, 0]} />;
      })}
      <group position={[1.4, 0, 0]} rotation={[Math.PI / 2, f * 0.1, 0]}>
        <Edged geometry={coin} material={m.accent} line={m.line} />
      </group>
    </group>
  );
}

function Cubes({ look, f }: M) {
  const m = useMats(look);
  const c = useMemo(() => new THREE.BoxGeometry(0.42, 0.42, 0.42), []);
  return (
    <group rotation={[0.6, 0.7 + f * 0.008, 0]}>
      {Array.from({ length: 27 }, (_, i) => {
        const x = (i % 3) - 1;
        const y = Math.floor(i / 3) % 3 - 1;
        const z = Math.floor(i / 9) - 1;
        const p = pr(f, random(`cb${i}`) * 20, 14);
        const out = 1 - p;
        return <Edged key={i} geometry={c} material={(i * 7) % 5 === 0 ? m.accent : (i * 3) % 7 === 0 ? m.accent2 : m.body} line={m.line} position={[x * 0.48 + x * out * 3, y * 0.48 + y * out * 3 + out * 2, z * 0.48 + z * out * 3]} />;
      })}
    </group>
  );
}

function Lock({ look, f }: M) {
  const m = useMats(look);
  const body = useMemo(() => new THREE.BoxGeometry(1.8, 1.5, 0.6), []);
  const open = pr(f, 14, 10);
  return (
    <group rotation={[0.25, -0.4 + Math.sin(f / 50) * 0.2, 0]}>
      <Edged geometry={body} material={m.body} line={m.line} position={[0, -0.4, 0]} />
      <mesh material={m.dark} position={[0, 0.35 + open * 0.35, 0]} rotation={[0, open * 0.8, 0]}>
        <torusGeometry args={[0.6, 0.12, 16, 40, Math.PI]} />
      </mesh>
      <mesh material={m.accent} position={[0, -0.35, 0.31]}>
        <cylinderGeometry args={[0.16, 0.16, 0.04, 24]} />
      </mesh>
    </group>
  );
}

const DRAW: Record<ObjectId, (p: M) => React.ReactElement> = { engine: Engine, chip: Chip, server: Server, brain: Brain, gem: Gem, globe: Globe, phone: Phone3D, coins: Coins, cubes: Cubes, lock: Lock };

/** The `object` beat: one 3D hero object, an orbiting camera, a title and callout labels. */
export function ObjectBeat({ beat, look, d, seed, backdrop = false }: { beat: Beat; look: Look; d: number; seed: number; backdrop?: boolean }) {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const id = (OBJECTS.includes(beat.object as ObjectId) ? beat.object : "cubes") as ObjectId;
  const Obj = DRAW[id];
  const enter = pr(f, 0, 16);
  const orbit = Math.sin(f / 70 + seed) * 0.35;
  const dist = 7.2 - (f / Math.max(1, d)) * 0.6;
  const callouts = beat.items.slice(0, 4);
  return (
    <AbsoluteFill>
      {backdrop && <BlueprintBackdrop look={look} f={f} />}
      <ThreeCanvas width={width} height={height} camera={{ fov: 32, position: [Math.sin(orbit) * dist, 0.6, Math.cos(orbit) * dist] }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <CameraLook orbit={orbit} dist={dist} />
        <ambientLight intensity={look.id === "blueprint" ? 0.9 : 0.5} />
        <directionalLight position={[4, 6, 5]} intensity={look.id === "blueprint" ? 1.1 : 1.6} />
        <pointLight position={[-4, -2, 3]} intensity={look.id === "cosmic" ? 30 : 8} color={look.accent2} />
        <group position={[0, 0.15, 0]} scale={(0.75 + enter * 0.25) * 0.56}>
          <Obj look={look} f={f} seed={seed} />
        </group>
      </ThreeCanvas>
      {beat.text && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 290, textAlign: "center", fontFamily: look.font, fontWeight: look.weight, fontSize: beat.text.length > 22 ? 64 : 80, color: look.ink, letterSpacing: "-0.01em", opacity: pr(f, 2, 12), transform: `translateY(${(1 - pr(f, 2, 12)) * 20}px)`, textShadow: `0 6px 30px ${withAlpha("#000000", 0.35)}` }}>
          {beat.text.replace(/\*/g, "")}
        </div>
      )}
      {callouts.map((c, i) => {
        const left = i % 2 === 0;
        const y = 640 + Math.floor(i / 2) * 330 + (left ? 0 : 150);
        const p = pr(f, 10 + i * 6, 12);
        return (
          <div key={i} style={{ position: "absolute", top: y, [left ? "left" : "right"]: 70, display: "flex", flexDirection: left ? "row" : "row-reverse", alignItems: "center", gap: 14, opacity: p }}>
            <div style={{ padding: "12px 22px", borderRadius: 12, border: `2px solid ${withAlpha(look.ink, 0.6)}`, background: withAlpha(look.paper, 0.7), fontFamily: look.font, fontWeight: 700, fontSize: 46, color: look.ink, transform: `translateX(${(1 - p) * (left ? -30 : 30)}px)` }}>
              {c.label}
            </div>
            <div style={{ width: 120 * p, height: 2, background: withAlpha(look.ink, 0.7) }} />
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: look.accent, opacity: p }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

function CameraLook({ orbit, dist }: { orbit: number; dist: number }) {
  // keep the default camera pointed at the object while it orbits (frame-driven, no useFrame)
  return <PerspectiveRig orbit={orbit} dist={dist} />;
}

function PerspectiveRig({ orbit, dist }: { orbit: number; dist: number }) {
  const camera = useThree((s) => s.camera);
  camera.position.set(Math.sin(orbit) * dist, 0.6, Math.cos(orbit) * dist);
  camera.lookAt(0, 0.05, 0);
  return null;
}

/** The blueprint world, drawn inside the beat (used when a paper reel cuts to a blueprint explainer). */
function BlueprintBackdrop({ look, f }: { look: Look; f: number }) {
  const line = (a: number) => withAlpha(look.ink, a);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #1452B8 0%, ${look.bg} 55%, #082A66 100%)` }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${line(0.07)} 2px, transparent 2px), linear-gradient(90deg, ${line(0.07)} 2px, transparent 2px), linear-gradient(${line(0.16)} 2px, transparent 2px), linear-gradient(90deg, ${line(0.16)} 2px, transparent 2px)`,
          backgroundSize: "48px 48px, 48px 48px, 240px 240px, 240px 240px",
          backgroundPosition: `0 ${(f * 0.8) % 240}px`,
        }}
      />
      {/* drawing-sheet frame and title block, like a technical plate */}
      <div style={{ position: "absolute", inset: 40, border: `3px solid ${line(0.35)}` }} />
      <div style={{ position: "absolute", right: 40, bottom: 40, width: 300, height: 90, borderLeft: `3px solid ${line(0.35)}`, borderTop: `3px solid ${line(0.35)}`, fontFamily: look.bodyFont, fontSize: 22, letterSpacing: "0.2em", color: line(0.5), display: "grid", placeItems: "center" }}>
        FIG. {1 + (Math.floor(f / 1000) % 9)} — AMX AI
      </div>
    </AbsoluteFill>
  );
}
