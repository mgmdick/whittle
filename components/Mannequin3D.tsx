"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  ShadowMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import PainSheet from "./PainSheet";
import PoseDummy from "./PoseDummy";
import { buildMannequin, type MannequinModel } from "@/lib/mannequin/model";
import {
  FLOOR_Y,
  JOINT_ORDER,
  PRESETS,
  clonePose,
  describeJoint,
  deserializePose,
  forward,
  groundedRoot,
  poseTags,
  presetPose,
  serializePose,
  solveIK,
  type JointName,
  type Pose,
  type WorldPose,
} from "@/lib/mannequin/rig";
import { Ragdoll } from "@/lib/mannequin/ragdoll";
import { PART_LABEL } from "@/lib/pose";
import { usePersistentState } from "@/lib/storage";
import { intensityColor, intensityHSL, uid, type Movement } from "@/lib/types";

type Props = { onSave: (m: Movement) => void; onAssess: () => void };
type Mode = "pose" | "physics" | "blend";

const POSE_KEY = "bodymap.pose3d.v1";

type Drag = {
  pointerId: number;
  sx: number;
  sy: number;
  moved: boolean;
  part: string;
  joint: JointName;
  ball: boolean;
  plane: Plane;
  effLocal: Vector3;
  hitWorld: Vector3;
  chain: JointName[] | "turn";
  yaw0: number;
  root: Vector3;
};

function chainFor(joint: JointName, ball: boolean): JointName[] | "turn" {
  const s = joint.endsWith("L") ? "L" : joint.endsWith("R") ? "R" : "";
  const base = joint.replace(/[LR]$/, "");
  if (ball) {
    switch (base) {
      case "neck":
      case "shoulder":
        return ["waist"];
      case "elbow":
        return [`shoulder${s}` as JointName];
      case "wrist":
        return [`elbow${s}` as JointName, `shoulder${s}` as JointName];
      case "knee":
        return [`hip${s}` as JointName];
      case "ankle":
        return [`knee${s}` as JointName, `hip${s}` as JointName];
      default:
        return "turn";
    }
  }
  switch (base) {
    case "pelvis":
      return "turn";
    case "waist":
      return ["waist"];
    case "neck":
      return ["neck"];
    case "shoulder":
      return [`shoulder${s}` as JointName];
    case "elbow":
    case "wrist":
      return [`elbow${s}` as JointName, `shoulder${s}` as JointName];
    case "hip":
      return [`hip${s}` as JointName];
    case "knee":
    case "ankle":
      return [`knee${s}` as JointName, `hip${s}` as JointName];
    default:
      return "turn";
  }
}

const lerpWorld = (a: WorldPose, b: WorldPose, t: number): WorldPose => {
  const out = {} as WorldPose;
  for (const j of JOINT_ORDER) out[j] = { pos: a[j].pos.clone().lerp(b[j].pos, t), quat: a[j].quat.clone().slerp(b[j].quat, t) };
  return out;
};

export default function Mannequin3D(props: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <>
        <p className="instruction warn-note">3D isn&apos;t available on this device, so here&apos;s the 2D mannequin.</p>
        <PoseDummy {...props} />
      </>
    );
  }
  return <Stage {...props} onFail={() => setFailed(true)} />;
}

function Stage({ onSave, onAssess, onFail }: Props & { onFail: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("pose");
  const [painParts, setPainParts] = usePersistentState<string[]>("bodymap.pose3d.pain.v1", []);
  const [intensity, setIntensity] = usePersistentState("bodymap.pose3d.intensity.v1", 6);
  const [presetName, setPresetName] = usePersistentState("bodymap.pose3d.preset.v1", "Standing");
  const [readout, setReadout] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [ready, setReady] = useState(false);

  const painRef = useRef<string[]>(painParts);
  const intensityRef = useRef(intensity);
  painRef.current = painParts;
  intensityRef.current = intensity;

  const api = useRef<{
    applyPreset: (name: string) => void;
    setMode: (m: Mode) => void;
    undo: () => void;
    resetView: () => void;
    snapshot: () => string;
    tags: () => string[];
    serialized: () => ReturnType<typeof serializePose>;
  } | null>(null);
  const modeRef = useRef<Mode>("pose");

  useEffect(() => {
    const wrap = wrapRef.current!;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.className = "three-canvas";
    wrap.appendChild(renderer.domElement);

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.55;

    const camera = new PerspectiveCamera(34, 1, 0.05, 50);
    camera.position.set(1.25, 1.3, 3.85);

    const hemi = new HemisphereLight(0xfff3e2, 0x6b5440, 0.55);
    scene.add(hemi);
    const key = new DirectionalLight(0xfff6ea, 2.4);
    key.position.set(2.2, 4, 2.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.4;
    key.shadow.camera.right = 1.4;
    key.shadow.camera.top = 2.2;
    key.shadow.camera.bottom = -0.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 10;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new DirectionalLight(0xffcf96, 1.1);
    rim.position.set(-2.4, 2.6, -3);
    scene.add(rim);

    const shadowFloor = new Mesh(new PlaneGeometry(10, 10), new ShadowMaterial({ opacity: 0.16 }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);

    const model: MannequinModel = buildMannequin();
    scene.add(model.root, model.plinth, model.rod);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.75;
    controls.minDistance = 1.3;
    controls.maxDistance = 5.5;
    controls.maxPolarAngle = 1.66;
    controls.update();

    // ---- pose state
    let target: Pose = deserializePose(readStored()) ?? presetPose(PRESETS[0]);
    let display: Pose = clonePose(target);
    let rootY = groundedRoot(target).y;
    let frozenRoot: Vector3 | null = null;
    let ragdoll: Ragdoll | null = null;
    let blend: { from: WorldPose; t: number } | null = null;
    let drag: Drag | null = null;
    const history: Pose[] = [];

    function readStored() {
      try {
        return JSON.parse(localStorage.getItem(POSE_KEY) ?? "null");
      } catch {
        return null;
      }
    }
    const store = () => {
      try {
        localStorage.setItem(POSE_KEY, JSON.stringify(serializePose(target)));
      } catch {
        /* ignore */
      }
    };
    const pushHistory = () => {
      history.push(clonePose(target));
      if (history.length > 40) history.shift();
      setCanUndo(true);
    };

    const applyWorld = (w: WorldPose) => {
      for (const j of JOINT_ORDER) {
        model.groups[j].position.copy(w[j].pos);
        model.groups[j].quaternion.copy(w[j].quat);
      }
    };

    // ---- interaction
    const ray = new Raycaster();
    const ndc = new Vector2();
    const setNdc = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };

    const onDown = (e: PointerEvent) => {
      if (modeRef.current === "blend" || drag || e.target !== renderer.domElement) return;
      setNdc(e);
      const hit = ray.intersectObjects(model.pickables, false)[0];
      if (!hit) return;
      e.stopPropagation();
      e.preventDefault();
      const obj = hit.object as Mesh;
      const joint = obj.userData.joint as JointName;
      const normal = new Vector3();
      camera.getWorldDirection(normal);
      const group = model.groups[joint];
      drag = {
        pointerId: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
        part: obj.userData.part,
        joint,
        ball: !!obj.userData.ball,
        plane: new Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
        effLocal: group.worldToLocal(hit.point.clone()),
        hitWorld: hit.point.clone(),
        chain: chainFor(joint, !!obj.userData.ball),
        yaw0: target.yaw,
        root: new Vector3(0, rootY, 0),
      };
      controls.enabled = false;
      wrap.setPointerCapture(e.pointerId);
    };

    const tmp = new Vector3();
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.sx;
      if (!drag.moved) {
        if (Math.hypot(dx, e.clientY - drag.sy) < 7) return;
        drag.moved = true;
        if (modeRef.current === "pose") {
          pushHistory();
          frozenRoot = drag.root.clone();
          setPresetName("Custom");
        } else if (ragdoll) {
          ragdoll.startGrab(drag.joint, drag.hitWorld);
        }
      }
      setNdc(e);
      if (!ray.ray.intersectPlane(drag.plane, tmp)) return;
      if (modeRef.current === "physics" && ragdoll) {
        ragdoll.moveGrab(tmp);
        return;
      }
      if (drag.chain === "turn") {
        target.yaw = drag.yaw0 + dx * 0.012;
        setReadout(`Turn · ${Math.round((((target.yaw * 180) / Math.PI) % 360 + 540) % 360 - 180)}°`);
        return;
      }
      solveIK(target, frozenRoot ?? drag.root, drag.chain, drag.joint, drag.effLocal, tmp.clone(), 10);
      const lines = [drag.chain[drag.chain.length - 1], drag.chain[0]]
        .filter((j, i, a) => a.indexOf(j) === i)
        .map((j) => describeJoint(j, target));
      setReadout(lines.join("\n"));
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const d = drag;
      drag = null;
      controls.enabled = true;
      try {
        wrap.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (ragdoll) ragdoll.endGrab();
      if (!d.moved) {
        try {
          navigator.vibrate?.(8);
        } catch {
          /* unsupported */
        }
        setPainParts((ps) => (ps.includes(d.part) ? ps.filter((x) => x !== d.part) : [...ps, d.part]));
      } else {
        frozenRoot = null;
        store();
        window.setTimeout(() => setReadout(null), 900);
      }
    };

    wrap.addEventListener("pointerdown", onDown, { capture: true });
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);

    // ---- public actions
    api.current = {
      applyPreset: (name) => {
        const p = PRESETS.find((x) => x.name === name);
        if (!p) return;
        pushHistory();
        target = presetPose(p, target.yaw);
        store();
      },
      setMode: (m) => {
        if (m === "physics" && modeRef.current === "pose") {
          ragdoll = new Ragdoll(forward(display, new Vector3(0, rootY, 0)));
          ragdoll.nudge();
          model.rod.visible = false;
          modeRef.current = "physics";
          setMode("physics");
        } else if (m === "pose" && modeRef.current === "physics" && ragdoll) {
          blend = { from: ragdoll.read(), t: 0 };
          ragdoll = null;
          modeRef.current = "blend";
          setMode("blend");
        }
      },
      undo: () => {
        const prev = history.pop();
        if (prev) {
          target = prev;
          store();
        }
        setCanUndo(history.length > 0);
      },
      resetView: () => {
        camera.position.set(1.25, 1.3, 3.85);
        controls.target.set(0, 0.9, 0);
        controls.update();
      },
      snapshot: () => {
        renderer.render(scene, camera);
        const src = renderer.domElement;
        const c = document.createElement("canvas");
        c.width = 180;
        c.height = 220;
        const g = c.getContext("2d")!;
        g.fillStyle = "#efe4d3";
        g.fillRect(0, 0, c.width, c.height);
        const s = Math.max(c.width / src.width, c.height / src.height);
        const w = src.width * s;
        const h = src.height * s;
        g.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
        return c.toDataURL("image/jpeg", 0.82);
      },
      tags: () => poseTags(target),
      serialized: () => serializePose(target),
    };

    // ---- render loop
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    });
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    const painColor = new Color();
    const black = new Color(0, 0, 0);
    const white = new Color(1, 1, 1);
    const up = new Vector3(0, 1, 0);
    const rodFrom = new Vector3(0, FLOOR_Y, 0);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      let world: WorldPose;
      if (modeRef.current === "physics" && ragdoll) {
        ragdoll.step(dt);
        world = ragdoll.read();
      } else if (modeRef.current === "blend" && blend) {
        blend.t = Math.min(1, blend.t + dt / 0.9);
        const t = blend.t < 0.5 ? 2 * blend.t * blend.t : 1 - Math.pow(-2 * blend.t + 2, 2) / 2;
        const goal = forward(target, groundedRoot(target));
        world = lerpWorld(blend.from, goal, t);
        if (blend.t >= 1) {
          blend = null;
          display = clonePose(target);
          rootY = groundedRoot(target).y;
          model.rod.visible = true;
          modeRef.current = "pose";
          setMode("pose");
        }
      } else {
        // Spring the displayed pose towards the target for a weighty feel.
        const k = 1 - Math.exp(-dt * (drag?.moved ? 22 : 11));
        for (const j of JOINT_ORDER) display.joints[j].slerp(target.joints[j], k);
        display.yaw += (target.yaw - display.yaw) * k;
        const goalY = (frozenRoot ?? groundedRoot(display)).y;
        rootY += (goalY - rootY) * (1 - Math.exp(-dt * 12));
        world = forward(display, new Vector3(0, rootY, 0));
      }
      applyWorld(world);

      // Support rod from the plinth to the underside of the pelvis.
      if (model.rod.visible) {
        const to = new Vector3(0, -0.1, -0.02).applyQuaternion(world.pelvis.quat).add(world.pelvis.pos);
        const dir = to.clone().sub(rodFrom);
        const len = Math.max(0.01, dir.length());
        model.rod.position.copy(rodFrom);
        model.rod.quaternion.copy(new Quaternion().setFromUnitVectors(up, dir.normalize()));
        model.rod.scale.set(1, len, 1);
      }

      // Sore parts glow, breathing gently.
      const pain = painRef.current;
      painColor.setHSL(...intensityHSL(intensityRef.current));
      const pulse = 0.28 + 0.2 * Math.sin(now / 260);
      for (const m of model.pickables) {
        const mat = m.material as unknown as { color: Color; emissive: Color; emissiveIntensity: number };
        if (pain.includes(m.userData.part)) {
          mat.color.copy(painColor);
          mat.emissive.copy(painColor);
          mat.emissiveIntensity = pulse;
        } else if (mat.emissiveIntensity !== 0) {
          mat.color.copy(white);
          mat.emissive.copy(black);
          mat.emissiveIntensity = 0;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    setReady(true);

    // Read-only hook used by automated UI tests: screen position of a point
    // in a joint's local frame.
    (window as unknown as { __mannequin?: unknown }).__mannequin = {
      screenOf: (j: JointName, local: [number, number, number] = [0, 0, 0]) => {
        const v = model.groups[j].localToWorld(new Vector3(...local)).project(camera);
        const r = renderer.domElement.getBoundingClientRect();
        return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
      },
      mode: () => modeRef.current,
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onDown, { capture: true });
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      controls.dispose();
      model.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
      delete (window as unknown as { __mannequin?: unknown }).__mannequin;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doFlash = (m: string) => {
    setFlash(m);
    window.setTimeout(() => setFlash(null), 1600);
  };

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode !== "physics"} className={mode !== "physics" ? "on" : ""} onClick={() => api.current?.setMode("pose")}>
            Pose
          </button>
          <button role="tab" aria-selected={mode === "physics"} className={mode === "physics" ? "on" : ""} onClick={() => api.current?.setMode("physics")}>
            Physics
          </button>
        </div>
        <div className="row-gap">
          <button className="btn ghost small" onClick={() => api.current?.undo()} disabled={!canUndo || mode !== "pose"}>
            ↶ Undo
          </button>
          <button className="btn ghost small" onClick={() => api.current?.resetView()}>
            Recenter
          </button>
        </div>
      </div>

      <p className="instruction">
        {mode === "physics" ? (
          <>
            <strong>Physics:</strong> it&apos;s off its stand — grab a limb and fling it around. Tap <strong>Stand up</strong> to pose again.
          </>
        ) : (
          <>
            <strong>Drag</strong> a limb to pose it (joints stop where real ones do). <strong>Tap</strong> a part to mark it sore.
            Drag the background to turn the view; pinch to zoom.
          </>
        )}
      </p>

      <div className="figure-wrap stage3d" ref={wrapRef}>
        {!ready && <div className="stage-loading">Carving your mannequin…</div>}
        {readout && <div className="toast readout">{readout}</div>}
        {flash && <div className="toast ok">{flash}</div>}
        {mode === "physics" && (
          <button className="stage-btn" onClick={() => api.current?.setMode("pose")}>
            Stand up
          </button>
        )}
        {mode === "pose" && (
          <button className="stage-btn ghost" onClick={() => api.current?.setMode("physics")}>
            Drop it ⤓
          </button>
        )}
      </div>

      <div className="presets" aria-label="Starting poses">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={"chip" + (presetName === p.name ? " on" : "")}
            disabled={mode !== "pose"}
            onClick={() => {
              api.current?.applyPreset(p.name);
              setPresetName(p.name);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Sore parts</h3>
          <span className="muted small-text">{painParts.length ? "tap to remove" : "tap the mannequin to mark"}</span>
        </div>
        {painParts.length > 0 && (
          <div className="chips">
            {painParts.map((p) => (
              <button
                key={p}
                className="chip on hurt"
                style={{ ["--c" as string]: intensityColor(intensity) }}
                onClick={() => setPainParts((ps) => ps.filter((x) => x !== p))}
              >
                {PART_LABEL[p] ?? p} ✕
              </button>
            ))}
          </div>
        )}
        <button
          className="btn primary full"
          disabled={painParts.length === 0}
          onClick={() => {
            setLabel(presetName !== "Custom" && presetName !== "Standing" ? presetName : "");
            setSaving(true);
          }}
        >
          Save this painful movement
        </button>
        {savedCount > 0 && (
          <button className="btn accent full" onClick={onAssess}>
            Assess my pain →
          </button>
        )}
      </div>

      {saving && (
        <PainSheet
          title="Painful movement"
          subtitle={painParts.map((p) => PART_LABEL[p] ?? p).join(", ")}
          initial={{ intensity, types: [], note: "" }}
          saveLabel="Save to log"
          extra={
            <div className="field">
              <label className="field-label" htmlFor="mv-label">
                What were you doing?
              </label>
              <input id="mv-label" placeholder="e.g. Reaching for a high shelf" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          }
          onClose={() => setSaving(false)}
          onSave={(d) => {
            const a = api.current;
            setIntensity(d.intensity);
            onSave({
              id: uid(),
              createdAt: Date.now(),
              view: "3d",
              angles: {},
              pose3d: a?.serialized(),
              tags: a?.tags() ?? [],
              thumb: a?.snapshot(),
              painParts,
              intensity: d.intensity,
              label: label.trim() || (presetName === "Custom" ? "Custom pose" : presetName),
              note: [d.types.join(", "), d.note].filter(Boolean).join(" — "),
            });
            setSaving(false);
            setSavedCount((n) => n + 1);
            doFlash("Saved to your log");
          }}
        />
      )}
    </div>
  );
}
