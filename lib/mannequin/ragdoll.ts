import {
  Body,
  Box,
  ConeTwistConstraint,
  Cylinder,
  Material,
  ContactMaterial,
  Plane,
  PointToPointConstraint,
  Quaternion as CQuat,
  Sphere,
  Vec3,
  World,
  type Shape,
} from "cannon-es";
import { Quaternion, Vector3 } from "three";
import { FLOOR_Y, JOINTS, JOINT_ORDER, type JointName, type WorldPose } from "./rig";

// Rigid-body ragdoll of the mannequin. Each joint group becomes a body; the
// joints become cone-twist constraints so limbs flop and swing realistically.

type Spec = { shape: () => Shape; center: [number, number, number]; mass: number; axis: [number, number, number]; cone: number; twist: number };

const SPECS: Record<JointName, Spec> = {
  pelvis: { shape: () => new Box(new Vec3(0.14, 0.075, 0.095)), center: [0, -0.02, 0], mass: 9, axis: [0, 1, 0], cone: 0, twist: 0 },
  waist: { shape: () => new Box(new Vec3(0.14, 0.17, 0.09)), center: [0, 0.21, 0], mass: 14, axis: [0, 1, 0], cone: Math.PI / 5, twist: Math.PI / 6 },
  neck: { shape: () => new Sphere(0.11), center: [0, 0.2, 0], mass: 5, axis: [0, 1, 0], cone: Math.PI / 4.5, twist: Math.PI / 4 },
  shoulderL: { shape: () => new Box(new Vec3(0.042, 0.12, 0.042)), center: [0, -0.15, 0], mass: 2.2, axis: [0, -1, 0], cone: Math.PI / 2, twist: Math.PI / 4 },
  shoulderR: { shape: () => new Box(new Vec3(0.042, 0.12, 0.042)), center: [0, -0.15, 0], mass: 2.2, axis: [0, -1, 0], cone: Math.PI / 2, twist: Math.PI / 4 },
  elbowL: { shape: () => new Box(new Vec3(0.035, 0.11, 0.035)), center: [0, -0.13, 0], mass: 1.4, axis: [0, -1, 0], cone: Math.PI / 2.2, twist: Math.PI / 8 },
  elbowR: { shape: () => new Box(new Vec3(0.035, 0.11, 0.035)), center: [0, -0.13, 0], mass: 1.4, axis: [0, -1, 0], cone: Math.PI / 2.2, twist: Math.PI / 8 },
  wristL: { shape: () => new Box(new Vec3(0.02, 0.075, 0.04)), center: [0, -0.1, 0], mass: 0.5, axis: [0, -1, 0], cone: Math.PI / 4, twist: Math.PI / 8 },
  wristR: { shape: () => new Box(new Vec3(0.02, 0.075, 0.04)), center: [0, -0.1, 0], mass: 0.5, axis: [0, -1, 0], cone: Math.PI / 4, twist: Math.PI / 8 },
  hipL: { shape: () => new Box(new Vec3(0.062, 0.18, 0.062)), center: [0, -0.22, 0], mass: 7, axis: [0, -1, 0], cone: Math.PI / 3, twist: Math.PI / 8 },
  hipR: { shape: () => new Box(new Vec3(0.062, 0.18, 0.062)), center: [0, -0.22, 0], mass: 7, axis: [0, -1, 0], cone: Math.PI / 3, twist: Math.PI / 8 },
  kneeL: { shape: () => new Box(new Vec3(0.045, 0.17, 0.045)), center: [0, -0.21, 0], mass: 3.5, axis: [0, -1, 0], cone: Math.PI / 2, twist: Math.PI / 12 },
  kneeR: { shape: () => new Box(new Vec3(0.045, 0.17, 0.045)), center: [0, -0.21, 0], mass: 3.5, axis: [0, -1, 0], cone: Math.PI / 2, twist: Math.PI / 12 },
  ankleL: { shape: () => new Box(new Vec3(0.04, 0.028, 0.11)), center: [0, -0.052, 0.06], mass: 1, axis: [0, -1, 0], cone: Math.PI / 6, twist: Math.PI / 12 },
  ankleR: { shape: () => new Box(new Vec3(0.04, 0.028, 0.11)), center: [0, -0.052, 0.06], mass: 1, axis: [0, -1, 0], cone: Math.PI / 6, twist: Math.PI / 12 },
};

const v3 = (v: Vector3) => new Vec3(v.x, v.y, v.z);
const tq = (q: Quaternion) => new CQuat(q.x, q.y, q.z, q.w);

export class Ragdoll {
  world: World;
  bodies = {} as Record<JointName, Body>;
  private grab: { constraint: PointToPointConstraint; anchor: Body } | null = null;

  constructor(start: WorldPose) {
    this.world = new World({ gravity: new Vec3(0, -9.82, 0) });
    this.world.allowSleep = true;
    const wood = new Material("wood");
    const floor = new Material("floor");
    this.world.addContactMaterial(new ContactMaterial(wood, floor, { friction: 0.55, restitution: 0.15 }));
    this.world.addContactMaterial(new ContactMaterial(wood, wood, { friction: 0.3, restitution: 0.05 }));

    const ground = new Body({ mass: 0, material: floor });
    ground.addShape(new Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    // The plinth: the figure can land on it or tumble off onto the floor.
    const plinth = new Body({ mass: 0, material: floor });
    plinth.addShape(new Cylinder(0.44, 0.46, FLOOR_Y, 24));
    plinth.position.set(0, FLOOR_Y / 2, 0);
    this.world.addBody(plinth);

    for (const j of JOINT_ORDER) {
      const s = SPECS[j];
      const w = start[j];
      const center = new Vector3(...s.center).applyQuaternion(w.quat).add(w.pos);
      const b = new Body({
        mass: s.mass,
        material: wood,
        position: v3(center),
        quaternion: tq(w.quat),
        linearDamping: 0.06,
        angularDamping: 0.35,
      });
      b.addShape(s.shape());
      b.allowSleep = true;
      b.sleepSpeedLimit = 0.08;
      this.bodies[j] = b;
      this.world.addBody(b);
    }

    for (const j of JOINT_ORDER) {
      const parent = JOINTS[j].parent;
      if (!parent) continue;
      const s = SPECS[j];
      const pivotWorld = v3(start[j].pos);
      const A = this.bodies[parent];
      const B = this.bodies[j];
      const pivotA = A.quaternion.inverse().vmult(pivotWorld.vsub(A.position));
      const pivotB = B.quaternion.inverse().vmult(pivotWorld.vsub(B.position));
      const axisB = new Vec3(...s.axis);
      const axisWorld = B.quaternion.vmult(axisB);
      const axisA = A.quaternion.inverse().vmult(axisWorld);
      this.world.addConstraint(
        new ConeTwistConstraint(A, B, { pivotA, pivotB, axisA, axisB, angle: s.cone, twistAngle: s.twist, collideConnected: false })
      );
    }
  }

  /** Give the figure a little shove so it doesn't drop perfectly straight. */
  nudge() {
    const dir = Math.random() > 0.5 ? 1 : -1;
    this.bodies.waist.applyImpulse(new Vec3(1.1 * dir, 0, -0.35), this.bodies.waist.position.vadd(new Vec3(0, 0.15, 0)));
  }

  step(dt: number) {
    this.world.step(1 / 60, Math.min(dt, 1 / 20), 4);
  }

  /** Joint world transforms derived from the bodies (for rendering). */
  read(): WorldPose {
    const out = {} as WorldPose;
    for (const j of JOINT_ORDER) {
      const b = this.bodies[j];
      const quat = new Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const pos = new Vector3(b.position.x, b.position.y, b.position.z).sub(
        new Vector3(...SPECS[j].center).applyQuaternion(quat)
      );
      out[j] = { pos, quat };
    }
    return out;
  }

  startGrab(j: JointName, hitWorld: Vector3) {
    this.endGrab();
    const b = this.bodies[j];
    b.wakeUp();
    const local = b.quaternion.inverse().vmult(v3(hitWorld).vsub(b.position));
    const anchor = new Body({ mass: 0, type: Body.KINEMATIC, position: v3(hitWorld) });
    anchor.collisionResponse = false;
    this.world.addBody(anchor);
    const constraint = new PointToPointConstraint(b, local, anchor, new Vec3(0, 0, 0), 60);
    this.world.addConstraint(constraint);
    this.grab = { constraint, anchor };
  }

  moveGrab(p: Vector3) {
    if (!this.grab) return;
    this.grab.anchor.position.set(p.x, Math.max(p.y, 0.02), p.z);
    for (const b of Object.values(this.bodies)) b.wakeUp();
  }

  endGrab() {
    if (!this.grab) return;
    this.world.removeConstraint(this.grab.constraint);
    this.world.removeBody(this.grab.anchor);
    this.grab = null;
  }
}
