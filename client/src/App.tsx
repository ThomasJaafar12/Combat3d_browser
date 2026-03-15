import { Canvas } from "@react-three/fiber";
import { Float, Grid, OrbitControls, Text } from "@react-three/drei";
import { useEffect } from "react";
import { featureFlags } from "@/config/featureFlags";
import { assetAudit } from "@/game/assetAudit";

function App() {
  useEffect(() => {
    const renderGameToText = () =>
      JSON.stringify({
        mode: "scaffold",
        note: "Commit 1 placeholder scene",
        featureFlags,
        assetAudit,
      });

    const advanceTime = (_ms: number) => {
      return;
    };

    Object.assign(window, {
      render_game_to_text: renderGameToText,
      advanceTime,
    });

    return () => {
      delete (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
      delete (window as Window & { advanceTime?: (ms: number) => void }).advanceTime;
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="boot-panel">
        <p className="eyebrow">Commit 1 scaffold</p>
        <h1>Combat Prototype V0</h1>
        <p>
          The runtime scaffold is in place. Next commits replace this placeholder with the
          authoritative combat simulation, third-person controls, spell loadouts, companion
          orders, and the wave encounter loop.
        </p>

        <section>
          <h2>Feature flags</h2>
          <ul>
            {Object.entries(featureFlags).map(([key, enabled]) => (
              <li key={key}>
                <span>{key}</span>
                <strong>{enabled ? "enabled" : "disabled"}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Curated asset anchors</h2>
          <ul>
            <li>Leader: {assetAudit.characters.leader}</li>
            <li>Companion: {assetAudit.characters.companion}</li>
            <li>Enemy: {assetAudit.characters.enemy}</li>
          </ul>
        </section>
      </aside>

      <main className="viewport-shell">
        <Canvas
          camera={{ position: [0, 7, 12], fov: 42 }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 1.5, 0);
          }}
        >
          <color attach="background" args={["#e6dcc6"]} />
          <ambientLight intensity={1.3} />
          <directionalLight castShadow intensity={2.4} position={[12, 20, 4]} />
          <gridHelper args={[40, 40, "#786654", "#bca37c"]} />
          <Grid
            args={[40, 40]}
            cellColor="#967958"
            sectionColor="#c5a77b"
            fadeDistance={45}
            fadeStrength={1}
            infiniteGrid={false}
          />
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#bfa07a" />
          </mesh>
          <mesh castShadow position={[-3.2, 1.4, 0]}>
            <boxGeometry args={[2.2, 2.8, 2.2]} />
            <meshStandardMaterial color="#76523b" />
          </mesh>
          <mesh castShadow position={[3.2, 1.7, -1.5]}>
            <cylinderGeometry args={[1.2, 1.6, 3.4, 16]} />
            <meshStandardMaterial color="#4d6579" />
          </mesh>
          <Float speed={1.8} rotationIntensity={0.3} floatIntensity={0.5}>
            <mesh castShadow position={[0, 2.8, 0]}>
              <cylinderGeometry args={[0.6, 0.85, 2.5, 12]} />
              <meshStandardMaterial color="#30495d" />
            </mesh>
          </Float>
          <Text
            color="#382717"
            fontSize={0.58}
            maxWidth={5}
            position={[0, 5.45, 0]}
            textAlign="center"
          >
            Authority scaffold online
          </Text>
          <OrbitControls enablePan={false} minDistance={7} maxDistance={18} target={[0, 1.5, 0]} />
        </Canvas>
      </main>
    </div>
  );
}

export default App;
