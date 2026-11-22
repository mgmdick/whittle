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
import MovementCheck, { type CheckApi } from "./MovementCheck";
import { buildMannequin, type MannequinModel } from "@/lib/mannequin/model";
import {
  FLOOR_Y,
  JOINT_ORDER,
  PRESETS,
  PRESET_GROUPS,
  clonePose,
  describeJoint,
  deserializePose,
  forward,
  getAxis,
  groundedRoot,
  jointForPart,
  poseTags,
  presetLabel,
  presetPose,
  serializePose,
  setAxis,
  slidersFor,
  solveIK,
  type JointName,
  type Pose,
  type PresetGroup,
  type Slider,
  type WorldPose,
} from "@/lib/mannequin/rig";
import { Ragdoll } from "@/lib/mannequin/ragdoll";
import { PART_LABEL } from "@/lib/pose";
import { usePersistentState } from "@/lib/storage";
import { intensityColor, intensityHSL, uid, type Movement } from "@/lib/types";

type Props = { onSave: (m: Movement) => void; onAssess: () => void };
type Mode = "pose" | "physics" | "blend";
type CamView = "front" | "angle" | "side" | "back";

const POSE_KEY = "bodymap.pose3d.v1";
const VIEWS: { id: CamView; label: string; azimuth: number }[] = [
  { id: "front", label: "Front", azimuth: 0 },
  { id: "angle", label: "¾", azimuth: 32 },
  { id: "side", label: "Side", azimuth: 90 },
  { id: "back", label: "Back", azimuth: 180 },
];
const PICK_RADIUS_PX = 38;

type Drag = {
  pointerId: number;
  sx: number;
  sy: number;
  moved: boolean;
  part: string;
  joint: JointName;
  plane: Plane;
  effLocal: Vector3;
  hitWorld: Vector3;
  chain: JointName[] | "turn";
  yaw0: number;
  root: Vector3;
};

/** Joints moved when dragging a part — shoulder/hip first so the limb swings as a whole. */
function chainFor(joint: JointName, ball: boolean): JointName[] | "turn" {
  const s = joint.endsWith("L") ? "L" : joint.endsWith("R") ? "R" : "";
  const base = joint.replace(/[LR]$/, "");
  const J = (n: string) => `${n}${s}` as JointName;
  if (ball) {
    switch (base) {
      case "neck":
      case "shoulder":
        return ["waist"];
      case "elbow":
        return [J("shoulder")];
      case "wrist":
        return [J("shoulder"), J("elbow")];
      case "knee":
        return [J("hip")];
      case "ankle":
        return [J("hip"), J("knee")];
      default:
        return "turn";
    }
  }
  switch (base) {
    case "waist":
      return ["waist"];
    case "neck":
      return ["neck"];
    case "shoulder":
      return [J("shoulder")];
    case "elbow":
    case "wrist":
      return [J("shoulder"), J("elbow")];
    case "hip":
      return [J("hip")];
    case "knee":
    case "ankle":
      return [J("hip"), J("knee")];
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

type Api = {
  /** Loop a movement: rest → frames… → hold → rest. */
  playMove: (frames: Pose[], speed?: number) => void;
  stopMove: () => void;
  showPose: (p: Pose) => void;
  setFocus: (parts: string[], tone?: "select" | "pain") => void;
  setCheckMode: (on: boolean) => void;
  setTapHandler: (fn: ((part: string) => void) | null) => void;
  applyPreset: (name: string, side: "L" | "R") => void;
  setMode: (m: Mode) => void;
  undo: () => void;
  setView: (v: CamView) => void;
  beginEdit: () => void;
  getValue: (j: JointName, s: Slider) => number;
  setValue: (j: JointName, s: Slider, v: number) => void;
  resetJoint: (j: JointName) => void;
  snapshot: () => string;
  tags: () => string[];
  serialized: () => ReturnType<typeof serializePose>;
};

function Stage({ onSave, onAssess, onFail }: Props & { onFail: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("pose");
  const [painParts, setPainParts] = usePersistentState<string[]>("bodymap.pose3d.pain.v1", []);
  const [intensity, setIntensity] = usePersistentState("bodymap.pose3d.intensity.v1", 6);
  const [presetKey, setPresetKey] = usePersistentState("bodymap.pose3d.preset.v2", "Standing");
  const [group, setGroup] = usePersistentState<PresetGroup>("bodymap.pose3d.group.v1", "Arms");
  const [side, setSide] = usePersistentState<"L" | "R">("bodymap.pose3d.side.v1", "R");
  const [camView, setCamView] = useState<CamView>("angle");
  const [tool, setTool] = usePersistentState<"check" | "pose">("bodymap.pose3d.tool.v1", "check");
  const [selected, setSelected] = useState<string | null>(null);
  const [, setPoseVer] = useState(0);
  const [readout, setReadout] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [ready, setReady] = useState(false);

  const painRef = useRef<string[]>(painParts);
  const intensityRef = useRef(intensity);
  const selectedRef = useRef<string | null>(null);
  painRef.current = painParts;
  intensityRef.current = intensity;
  selectedRef.current = selected;

  const api = useRef<Api | null>(null);
  const modeRef = useRef<Mode>("pose");
  const bump = () => setPoseVer((v) => v + 1);

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

    const TARGET = new Vector3(0, 1.0, 0);
    const camera = new PerspectiveCamera(34, 1, 0.05, 50);
    const camAt = (azDeg: number, dist = 4.5, elev = 0.16) => {
      const a = (azDeg * Math.PI) / 180;
      return new Vector3(Math.sin(a) * dist, TARGET.y + elev * dist * 0.5, Math.cos(a) * dist);
    };
    camera.position.copy(camAt(32));

    scene.add(new HemisphereLight(0xfff3e2, 0x6b5440, 0.55));
    const key = new DirectionalLight(0xfff6ea, 2.4);
    key.position.set(2.2, 4, 2.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.2, bottom: -0.6, near: 0.5, far: 10 });
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
    for (const m of model.pickables) m.geometry.computeBoundingSphere();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(TARGET);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
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
    let camTween: { from: Vector3; to: Vector3; t: number } | null = null;
    let drag: Drag | null = null;
    let bgTap: { id: number; x: number; y: number } | null = null;
    let anim: { segs: { from: Pose; to: Pose; dur: number }[]; t: number; total: number } | null = null;
    let checkMode = false;
    let freePose: Pose | null = null;
    let tapHandler: ((part: string) => void) | null = null;
    let tapCand: { id: number; x: number; y: number; part: string } | null = null;
    let focus: { parts: string[]; tone: "select" | "pain" } = { parts: [], tone: "select" };
    const history: Pose[] = [];

    function readStored() {
      try {
        return JSON.parse(localStorage.getItem(POSE_KEY) ?? "null");
      } catch {
        return null;
      }
    }
    const store = () => {
      if (checkMode) return;
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

    // ---- picking: exact ray hit, or the nearest part within a finger's width
    const ray = new Raycaster();
    const ndc = new Vector2();
    const rect = () => renderer.domElement.getBoundingClientRect();
    const setRay = (cx: number, cy: number) => {
      const r = rect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    const pick = (cx: number, cy: number): { mesh: Mesh; point: Vector3 } | null => {
      setRay(cx, cy);
      const hit = ray.intersectObjects(model.pickables, false)[0];
      if (hit) return { mesh: hit.object as Mesh, point: hit.point.clone() };
      const r = rect();
      let best: { mesh: Mesh; point: Vector3 } | null = null;
      let bestD = PICK_RADIUS_PX;
      for (const m of model.pickables) {
        const c = m.geometry.boundingSphere!.center.clone().applyMatrix4(m.matrixWorld);
        const p = c.clone().project(camera);
        const sx = r.left + ((p.x + 1) / 2) * r.width;
        const sy = r.top + ((1 - p.y) / 2) * r.height;
        // Prefer limbs over joint balls when equally close.
        const d = Math.hypot(sx - cx, sy - cy) + (m.userData.ball ? 6 : 0);
        if (d < bestD) {
          bestD = d;
          best = { mesh: m, point: c };
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      if (modeRef.current === "blend" || drag || e.target !== renderer.domElement) return;
      if (checkMode) {
        // In the movement check a tap picks a body area; otherwise just look around.
        if (!tapHandler) return;
        const h = pick(e.clientX, e.clientY);
        if (!h) return;
        e.stopPropagation();
        e.preventDefault();
        tapCand = { id: e.pointerId, x: e.clientX, y: e.clientY, part: h.mesh.userData.part };
        return;
      }
      const hit = pick(e.clientX, e.clientY);
      if (!hit) {
        bgTap = { id: e.pointerId, x: e.clientX, y: e.clientY };
        return; // let OrbitControls rotate the view
      }
      e.stopPropagation();
      e.preventDefault();
      const joint = hit.mesh.userData.joint as JointName;
      const normal = new Vector3();
      camera.getWorldDirection(normal);
      drag = {
        pointerId: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
        part: hit.mesh.userData.part,
        joint,
        plane: new Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
        effLocal: model.groups[joint].worldToLocal(hit.point.clone()),
        hitWorld: hit.point.clone(),
        chain: chainFor(joint, !!hit.mesh.userData.ball),
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
        if (Math.hypot(dx, e.clientY - drag.sy) < 8) return;
        drag.moved = true;
        if (modeRef.current === "pose") {
          pushHistory();
          frozenRoot = drag.root.clone();
          setPresetKey("Custom");
          setSelected(drag.part);
        } else if (ragdoll) {
          ragdoll.startGrab(drag.joint, drag.hitWorld);
        }
      }
      setRay(e.clientX, e.clientY);
      if (!ray.ray.intersectPlane(drag.plane, tmp)) return;
      if (modeRef.current === "physics" && ragdoll) {
        ragdoll.moveGrab(tmp);
        return;
      }
      if (drag.chain === "turn") {
        target.yaw = drag.yaw0 + dx * 0.012;
        setReadout(`Turning the whole body`);
        return;
      }
      solveIK(target, frozenRoot ?? drag.root, drag.chain, drag.joint, drag.effLocal, tmp.clone(), 10);
      setReadout(drag.chain.map((j) => describeJoint(j, target)).join("\n"));
    };

    const onUp = (e: PointerEvent) => {
      if (tapCand && e.pointerId === tapCand.id) {
        if (Math.hypot(e.clientX - tapCand.x, e.clientY - tapCand.y) < 10) {
          try {
            navigator.vibrate?.(8);
          } catch {
            /* unsupported */
          }
          tapHandler?.(tapCand.part);
        }
        tapCand = null;
        return;
      }
      if (bgTap && e.pointerId === bgTap.id) {
        if (Math.hypot(e.clientX - bgTap.x, e.clientY - bgTap.y) < 6) setSelected(null);
        bgTap = null;
      }
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
        setSelected((cur) => (cur === d.part ? null : d.part));
      } else {
        frozenRoot = null;
        store();
        bump();
        window.setTimeout(() => setReadout(null), 900);
      }
    };

    wrap.addEventListener("pointerdown", onDown, { capture: true });
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);

    // ---- public actions
    const standing = () => presetPose(PRESETS[0]);
    api.current = {
      playMove: (frames, speed = 1.1) => {
        const rest = standing();
        const segs: { from: Pose; to: Pose; dur: number }[] = [];
        let prev = rest;
        frames.forEach((f) => {
          segs.push({ from: prev, to: f, dur: speed });
          prev = f;
        });
        segs.push({ from: prev, to: prev, dur: 0.9 });
        segs.push({ from: prev, to: rest, dur: 0.9 });
        segs.push({ from: rest, to: rest, dur: 0.6 });
        anim = { segs, t: 0, total: segs.reduce((a, b) => a + b.dur, 0) };
      },
      stopMove: () => {
        anim = null;
        target = standing();
      },
      showPose: (p) => {
        anim = null;
        target = clonePose(p);
      },
      setFocus: (parts, tone = "select") => {
        focus = { parts, tone };
      },
      setCheckMode: (on) => {
        if (on && !checkMode) {
          freePose = clonePose(target);
          checkMode = true;
          target = standing();
        } else if (!on && checkMode) {
          checkMode = false;
          anim = null;
          tapHandler = null;
          focus = { parts: [], tone: "select" };
          if (freePose) target = freePose;
        }
      },
      setTapHandler: (fn) => {
        tapHandler = fn;
      },
      applyPreset: (name, s) => {
        const p = PRESETS.find((x) => x.name === name);
        if (!p) return;
        pushHistory();
        target = presetPose(p, target.yaw, s);
        store();
        bump();
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
          bump();
        }
        setCanUndo(history.length > 0);
      },
      setView: (v) => {
        const az = VIEWS.find((x) => x.id === v)!.azimuth;
        const dist = Math.min(5.2, Math.max(4.5, camera.position.distanceTo(controls.target)));
        camTween = { from: camera.position.clone(), to: camAt(az, dist), t: 0 };
        controls.target.copy(TARGET);
      },
      beginEdit: () => pushHistory(),
      getValue: (j, s) => getAxis(target, j, s),
      setValue: (j, s, v) => {
        setAxis(target, j, s, v);
        setPresetKey("Custom");
        store();
        bump();
      },
      resetJoint: (j) => {
        pushHistory();
        target.joints[j].identity();
        store();
        bump();
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
        g.drawImage(src, (c.width - src.width * s) / 2, (c.height - src.height * s) / 2, src.width * s, src.height * s);
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
    const selColor = new Color(0x4fb3ff);
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
        world = lerpWorld(blend.from, forward(target, groundedRoot(target)), t);
        if (blend.t >= 1) {
          blend = null;
          display = clonePose(target);
          rootY = groundedRoot(target).y;
          model.rod.visible = true;
          modeRef.current = "pose";
          setMode("pose");
        }
      } else {
        if (anim) {
          anim.t = (anim.t + dt) % anim.total;
          let t = anim.t;
          let seg = anim.segs[0];
          for (const sg of anim.segs) {
            seg = sg;
            if (t <= sg.dur) break;
            t -= sg.dur;
          }
          const u = Math.min(1, t / seg.dur);
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          for (const j of JOINT_ORDER) target.joints[j].copy(seg.from.joints[j]).slerp(seg.to.joints[j], e);
        }
        // Spring the displayed pose towards the target for a weighty feel.
        const k = 1 - Math.exp(-dt * (drag?.moved ? 22 : anim ? 16 : 10));
        for (const j of JOINT_ORDER) display.joints[j].slerp(target.joints[j], k);
        display.yaw += (target.yaw - display.yaw) * k;
        const goalY = (frozenRoot ?? groundedRoot(display)).y;
        rootY += (goalY - rootY) * (1 - Math.exp(-dt * 12));
        world = forward(display, new Vector3(0, rootY, 0));
      }
      applyWorld(world);

      if (model.rod.visible) {
        const to = new Vector3(0, -0.1, -0.02).applyQuaternion(world.pelvis.quat).add(world.pelvis.pos);
        const dir = to.clone().sub(rodFrom);
        const len = Math.max(0.01, dir.length());
        model.rod.position.copy(rodFrom);
        model.rod.quaternion.copy(new Quaternion().setFromUnitVectors(up, dir.normalize()));
        model.rod.scale.set(1, len, 1);
      }

      if (camTween) {
        camTween.t = Math.min(1, camTween.t + dt / 0.55);
        const t = 1 - Math.pow(1 - camTween.t, 3);
        camera.position.lerpVectors(camTween.from, camTween.to, t);
        if (camTween.t >= 1) camTween = null;
      }

      // Sore parts take the pain colour and breathe; the selected part glows blue.
      const pain = painRef.current;
      const sel = selectedRef.current;
      painColor.setHSL(...intensityHSL(intensityRef.current));
      const pulse = 0.28 + 0.2 * Math.sin(now / 260);
      for (const m of model.pickables) {
        const mat = m.material as unknown as { color: Color; emissive: Color; emissiveIntensity: number };
        const part = m.userData.part as string;
        const focused = focus.parts.includes(part);
        if (focused && focus.tone === "pain") {
          mat.color.copy(painColor);
          mat.emissive.copy(painColor);
          mat.emissiveIntensity = pulse + 0.1;
        } else if (focused) {
          mat.color.copy(white);
          mat.emissive.copy(selColor);
          mat.emissiveIntensity = 0.3 + 0.14 * Math.sin(now / 220);
        } else if (checkMode) {
          if (mat.emissiveIntensity !== 0) {
            mat.color.copy(white);
            mat.emissive.copy(black);
            mat.emissiveIntensity = 0;
          }
        } else if (pain.includes(part)) {
          mat.color.copy(painColor);
          mat.emissive.copy(painColor);
          mat.emissiveIntensity = part === sel ? pulse + 0.35 : pulse;
        } else if (part === sel) {
          mat.color.copy(white);
          mat.emissive.copy(selColor);
          mat.emissiveIntensity = 0.32 + 0.12 * Math.sin(now / 220);
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

    // Read-only hook used by automated UI tests.
    (window as unknown as { __mannequin?: unknown }).__mannequin = {
      screenOf: (j: JointName, local: [number, number, number] = [0, 0, 0]) => {
        const v = model.groups[j].localToWorld(new Vector3(...local)).project(camera);
        const r = rect();
        return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
      },
      mode: () => modeRef.current,
      target: (j: JointName) => describeJoint(j, target),
      shown: (j: JointName) => describeJoint(j, display),
      animating: () => !!anim,
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

  useEffect(() => {
    if (!ready) return;
    api.current?.setCheckMode(tool === "check");
    if (tool === "check") setSelected(null);
  }, [tool, ready]);

  const checkApi = useRef<() => CheckApi | null>(() => {
    const a = api.current;
    if (!a) return null;
    return {
      playMove: a.playMove,
      stopMove: a.stopMove,
      showPose: a.showPose,
      setFocus: a.setFocus,
      setTapHandler: a.setTapHandler,
      snapshot: a.snapshot,
      setView: (v) => {
        setCamView(v);
        a.setView(v);
      },
    };
  });

  const doFlash = (m: string) => {
    setFlash(m);
    window.setTimeout(() => setFlash(null), 1600);
  };

  // Bring the mannequin back into view after choosing a movement below it.
  const showStage = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 80) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const togglePain = (part: string) =>
    setPainParts((ps) => (ps.includes(part) ? ps.filter((x) => x !== part) : [...ps, part]));

  const selJoint = selected ? jointForPart(selected) : null;
  const sliders = selJoint ? slidersFor(selJoint) : [];
  const groupPresets = PRESETS.filter((p) => p.group === group);
  const step = painParts.length === 0 ? (presetKey === "Standing" ? 1 : 2) : 3;

  return (
    <div className={"panel mannequin-panel" + (tool === "check" ? " checking" : "")}>
      <div className="seg tool-switch" role="tablist" aria-label="Mannequin mode">
        <button role="tab" aria-selected={tool === "check"} className={tool === "check" ? "on" : ""} onClick={() => setTool("check")}>
          Movement check
        </button>
        <button role="tab" aria-selected={tool === "pose"} className={tool === "pose" ? "on" : ""} onClick={() => setTool("pose")}>
          Free pose
        </button>
      </div>
      {tool === "pose" && (
      <ol className="steps" aria-label="How it works">
        <li className={step === 1 ? "on" : step > 1 ? "done" : ""}>
          <span>1</span>Pick the movement
        </li>
        <li className={step === 2 ? "on" : step > 2 ? "done" : ""}>
          <span>2</span>Tap where it hurts
        </li>
        <li className={step === 3 ? "on" : ""}>
          <span>3</span>Save
        </li>
      </ol>
      )}

      <div className="figure-wrap stage3d" ref={wrapRef}>
        {!ready && <div className="stage-loading">Carving your mannequin…</div>}
        <div className="view-btns" role="group" aria-label="Camera angle">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={camView === v.id ? "on" : ""}
              aria-pressed={camView === v.id}
              onClick={() => {
                setCamView(v.id);
                api.current?.setView(v.id);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {readout && <div className="toast readout">{readout}</div>}
        {flash && <div className="toast ok">{flash}</div>}
        {tool === "pose" && (
        <div className="stage-actions">
          {mode === "pose" && (
            <button className="stage-btn ghost small" onClick={() => api.current?.undo()} disabled={!canUndo}>
              ↶ Undo
            </button>
          )}
          {mode === "physics" ? (
            <button className="stage-btn" onClick={() => api.current?.setMode("pose")}>
              Stand up
            </button>
          ) : (
            <button className="stage-btn ghost small" onClick={() => api.current?.setMode("physics")} disabled={mode !== "pose"}>
              Drop it ⤓
            </button>
          )}
        </div>
        )}
      </div>
      {tool === "check" && (
        <MovementCheck api={checkApi.current} ready={ready} onSave={onSave} onAssess={onAssess} />
      )}

      {tool === "pose" && (
      <>
      {!selected && mode === "pose" && (
        <p className="instruction stage-caption">
          <strong>Tap</strong> a body part to select it · <strong>drag</strong> a limb to move it · drag the background to look around
        </p>
      )}
      {mode !== "pose" && (
        <p className="instruction stage-caption">Grab a limb and fling it around. Tap <strong>Stand up</strong> to pose again.</p>
      )}

      {selected && selJoint ? (
        <div className="card part-card">
          <div className="card-head">
            <h3>{PART_LABEL[selected] ?? selected}</h3>
            <button className="icon-btn" aria-label="Deselect" onClick={() => setSelected(null)}>
              ✕
            </button>
          </div>
          <button
            className={"btn full hurt-toggle" + (painParts.includes(selected) ? " on" : "")}
            style={{ ["--c" as string]: intensityColor(intensity) }}
            onClick={() => togglePain(selected)}
          >
            {painParts.includes(selected) ? "✓ Marked as sore — tap to undo" : "It hurts here"}
          </button>
          {mode === "pose" && sliders.length > 0 && (
            <div className="sliders">
              {sliders.map((s) => {
                const v = api.current?.getValue(selJoint, s) ?? 0;
                return (
                  <label key={s.label} className="slider">
                    <span className="slider-head">
                      <strong>{s.label}</strong>
                      <span className="muted">{Math.abs(v)}°</span>
                    </span>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={1}
                      value={v}
                      onPointerDown={() => api.current?.beginEdit()}
                      onChange={(e) => api.current?.setValue(selJoint, s, Number(e.target.value))}
                    />
                    <span className="slider-ends">
                      <span>{s.ends[0]}</span>
                      <span>{s.ends[1]}</span>
                    </span>
                  </label>
                );
              })}
              <button className="btn ghost small" onClick={() => api.current?.resetJoint(selJoint)}>
                Reset this joint
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className="card moves">
        <div className="card-head">
          <h3>Movements</h3>
          <button
            className="btn ghost small"
            disabled={mode !== "pose"}
            onClick={() => {
              api.current?.applyPreset("Standing", side);
              setPresetKey("Standing");
            }}
          >
            Stand straight
          </button>
        </div>
        <div className="moves-bar">
          <div className="seg small" role="tablist" aria-label="Body area">
            {PRESET_GROUPS.map((g) => (
              <button key={g} role="tab" aria-selected={group === g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
          <div className="seg small" role="tablist" aria-label="Side">
            {(["L", "R"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={side === s} className={side === s ? "on" : ""} onClick={() => setSide(s)}>
                {s === "L" ? "Left" : "Right"}
              </button>
            ))}
          </div>
        </div>
        <div className="chips">
          {groupPresets.map((p) => {
            const key = p.sided ? `${p.name}|${side}` : p.name;
            return (
              <button
                key={p.name}
                className={"chip" + (presetKey === key ? " on" : "")}
                disabled={mode !== "pose"}
                onClick={() => {
                  api.current?.applyPreset(p.name, side);
                  setPresetKey(key);
                  showStage();
                }}
              >
                {presetLabel(p, side)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Sore parts</h3>
          <span className="muted small-text">{painParts.length ? "tap to remove" : "tap a part, then “It hurts here”"}</span>
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
            const p = PRESETS.find((x) => presetKey === x.name || presetKey === `${x.name}|L` || presetKey === `${x.name}|R`);
            setLabel(p && p.name !== "Standing" ? presetLabel(p, presetKey.endsWith("|L") ? "L" : "R") : "");
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

      </>
      )}

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
              label: label.trim() || "Custom pose",
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
