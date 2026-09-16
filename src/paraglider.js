// The player paraglider. Geometry is procedural and vertex-colored like the
// rest of the world; the engine supplies its material and owns the flight
// transform. The rig faces +z. Its named groups are deliberately separate so
// canopy attitude, pilot lean, arms, risers and lines can move independently
// when maneuver animation arrives.

export const DEFAULT_PARAGLIDER = {
  colors: {
    canopyPrimary: 0xf2c928,
    canopySecondary: 0xf2eee3,
    canopyPattern: 0x17191d,
    jacket: 0xb8573d,
    pants: 0x303945,
    helmet: 0x191c21,
    harness: 0x1b2026,
    sunglasses: 0x111317,
    gloves: 0x292d32,
  },
  below: 1.35,
  bob: 0.035,
  look: { rise: 1.65, ahead: 0 },
};

function geometryFromQuads(THREE, quads) {
  const positions = [];
  const colors = [];
  const push = (point, color) => {
    positions.push(...point);
    const c = new THREE.Color(color);
    colors.push(c.r, c.g, c.b);
  };
  for (const { points, color, flip = false } of quads) {
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of order) push(points[i], color);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function canopyPaint(colors, u, v) {
  if (Math.abs(u) > 0.79 || (v < 0.12 && Math.abs(u) > 0.28)) return colors.canopySecondary;
  return colors.canopyPrimary;
}

function buildCanopyGeometry(THREE, colors) {
  const spanSteps = 28;
  const chordSteps = 8;
  const halfSpan = 5.1;
  const point = (u, v, upper) => {
    const tip = Math.abs(u);
    const chord = 2.75 * (1 - 0.62 * tip ** 2.7);
    const arc = 5.55 - 1.72 * tip ** 1.65;
    const sweep = -0.4 * tip ** 2;
    const crown = Math.sin(Math.PI * v);
    return [halfSpan * u, arc + (upper ? 0.16 + crown * 0.28 : -0.16 - crown * 0.07), sweep + (0.5 - v) * chord];
  };
  const quads = [];
  for (let i = 0; i < spanSteps; i++) {
    const u0 = -1 + (2 * i) / spanSteps;
    const u1 = -1 + (2 * (i + 1)) / spanSteps;
    for (let j = 0; j < chordSteps; j++) {
      const v0 = j / chordSteps;
      const v1 = (j + 1) / chordSteps;
      const u = (u0 + u1) * 0.5;
      const v = (v0 + v1) * 0.5;
      quads.push({
        points: [point(u0, v0, true), point(u1, v0, true), point(u1, v1, true), point(u0, v1, true)],
        color: canopyPaint(colors, u, v),
      });
      quads.push({
        points: [point(u0, v0, false), point(u1, v0, false), point(u1, v1, false), point(u0, v1, false)],
        color: canopyPaint(colors, u, v),
        flip: true,
      });
    }
    for (const v of [0, 1]) {
      const color = v === 0 && i % 2 === 0 ? colors.canopySecondary : colors.canopyPrimary;
      quads.push({
        points: [point(u0, v, false), point(u1, v, false), point(u1, v, true), point(u0, v, true)],
        color,
        flip: v === 1,
      });
    }
  }
  for (const u of [-1, 1]) {
    for (let j = 0; j < chordSteps; j++) {
      const v0 = j / chordSteps;
      const v1 = (j + 1) / chordSteps;
      quads.push({
        points: [point(u, v0, false), point(u, v1, false), point(u, v1, true), point(u, v0, true)],
        color: colors.canopySecondary,
        flip: u < 0,
      });
    }
  }
  return { geometry: geometryFromQuads(THREE, quads), point };
}

function buildCanopyMarkingGeometry(THREE, color, point) {
  const strokes = [
    [[-0.68, 0.78], [-0.68, 0.2]],
    [[-0.68, 0.2], [0, 0.62]],
    [[0, 0.62], [0.68, 0.2]],
    [[0.68, 0.2], [0.68, 0.78]],
  ];
  const quads = [];
  for (const [[ax, ay], [bx, by]] of strokes) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const px = (-dy / len) * 0.085;
    const py = (dx / len) * 0.085;
    for (const upper of [true, false]) {
      const corners = [
        point(ax + px, ay + py, upper),
        point(bx + px, by + py, upper),
        point(bx - px, by - py, upper),
        point(ax - px, ay - py, upper),
      ];
      for (const p of corners) p[1] += upper ? 0.012 : -0.012;
      quads.push({ points: corners, color, flip: !upper });
    }
  }
  return geometryFromQuads(THREE, quads);
}

function strut(THREE, from, to, radius, sides = 7) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const delta = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), sides);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  const matrix = new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), rotation, new THREE.Vector3(1, 1, 1));
  return { geometry, matrix };
}

function mesh(THREE, geometry, material, name) {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function limb(THREE, material, merge, color, gloveColor, side) {
  const shoulder = [side * 0.36, 0.78, -0.18];
  const elbow = [side * 0.55, 0.38, 0.04];
  const hand = [side * 0.43, 0.6, 0.28];
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'left-arm' : 'right-arm';
  arm.position.set(...shoulder);
  const localElbow = elbow.map((v, i) => v - shoulder[i]);
  const upper = strut(THREE, [0, 0, 0], localElbow, 0.105, 9);
  arm.add(mesh(THREE, merge([{ ...upper, color }]), material, 'upper-arm'));

  const forearm = new THREE.Group();
  forearm.name = 'forearm';
  forearm.position.set(...localElbow);
  const localHand = hand.map((v, i) => v - elbow[i]);
  const lower = strut(THREE, [0, 0, 0], localHand, 0.09, 9);
  forearm.add(mesh(THREE, merge([{ ...lower, color }]), material, 'lower-arm'));
  const glove = new THREE.SphereGeometry(0.13, 10, 7);
  glove.translate(...localHand);
  forearm.add(mesh(THREE, merge([{ geometry: glove, color: gloveColor }]), material, 'glove'));
  arm.add(forearm);
  return { arm, forearm, hand };
}

/** Build the visible player rig around the engine-owned flight pivot. */
export function createParaglider(appearance, kit) {
  const { THREE, merge, M, material } = kit;
  const colors = { ...DEFAULT_PARAGLIDER.colors, ...(appearance?.colors ?? {}) };
  const config = { ...DEFAULT_PARAGLIDER, ...appearance, colors };
  const rig = new THREE.Group();
  rig.name = 'paraglider';
  rig.rotation.order = 'YXZ';

  const canopy = new THREE.Group();
  canopy.name = 'canopy';
  const canopyBuilt = buildCanopyGeometry(THREE, colors);
  canopy.add(mesh(THREE, canopyBuilt.geometry, material, 'canopy-surface'));
  const marking = mesh(
    THREE,
    buildCanopyMarkingGeometry(THREE, colors.canopyPattern, canopyBuilt.point),
    material,
    'canopy-m-pattern',
  );
  marking.castShadow = false;
  canopy.add(marking);
  rig.add(canopy);

  const pilot = new THREE.Group();
  pilot.name = 'pilot';
  pilot.rotation.order = 'YXZ';
  rig.add(pilot);

  const harness = new THREE.Group();
  harness.name = 'harness';
  harness.add(
    mesh(
      THREE,
      merge([
        { geometry: new THREE.SphereGeometry(1, 12, 8), matrix: M(0, 0.16, -0.28, 0.48, 0.7, 0.34, -0.16, 0, 0), color: colors.harness },
        { geometry: new THREE.SphereGeometry(1, 12, 8), matrix: M(0, -0.31, 0.04, 0.48, 0.22, 0.62, 0.2, 0, 0), color: colors.harness },
        { geometry: new THREE.BoxGeometry(0.72, 0.08, 0.13), matrix: M(0, 0.48, -0.03, 1, 1, 1, -0.12, 0, 0), color: colors.harness },
      ]),
      material,
      'harness-shell',
    ),
  );
  pilot.add(harness);

  const torso = strut(THREE, [0, -0.05, -0.12], [0, 0.92, -0.31], 0.29, 12);
  pilot.add(mesh(THREE, merge([{ ...torso, color: colors.jacket }]), material, 'jacket'));

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.28, -0.37);
  head.add(
    mesh(
      THREE,
      merge([
        { geometry: new THREE.SphereGeometry(1, 14, 9), matrix: M(0, 0, 0, 0.25, 0.29, 0.26), color: 0xb98268 },
        { geometry: new THREE.SphereGeometry(1, 14, 8), matrix: M(0, 0.1, -0.02, 0.28, 0.25, 0.29), color: colors.helmet },
        { geometry: new THREE.BoxGeometry(0.5, 0.08, 0.08), matrix: M(0, 0.01, 0.24), color: colors.sunglasses },
        { geometry: new THREE.BoxGeometry(0.38, 0.045, 0.16), matrix: M(0, 0.16, 0.2, 1, 1, 1, -0.12, 0, 0), color: colors.helmet },
      ]),
      material,
      'helmet-and-sunglasses',
    ),
  );
  pilot.add(head);

  const left = limb(THREE, material, merge, colors.jacket, colors.gloves, -1);
  const right = limb(THREE, material, merge, colors.jacket, colors.gloves, 1);
  pilot.add(left.arm, right.arm);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = [side * 0.2, -0.23, 0.03];
    const knee = [side * 0.23, -0.58, 0.67];
    const foot = [side * 0.24, -1.2, 0.52];
    const thigh = strut(THREE, hip, knee, 0.14, 9);
    const shin = strut(THREE, knee, foot, 0.12, 9);
    legs.push({ ...thigh, color: colors.pants }, { ...shin, color: colors.pants });
    legs.push({ geometry: new THREE.SphereGeometry(1, 9, 6), matrix: M(...foot, 0.14, 0.12, 0.28, Math.PI / 2, 0, 0), color: colors.harness });
  }
  pilot.add(mesh(THREE, merge(legs), material, 'seated-legs'));

  const risers = new THREE.Group();
  risers.name = 'risers';
  const riserParts = [];
  for (const side of [-1, 1]) {
    riserParts.push(
      { ...strut(THREE, [side * 0.26, 0.42, -0.08], [side * 0.4, 0.78, 0.02], 0.025, 6), color: colors.harness },
      { ...strut(THREE, [side * 0.4, 0.78, 0.02], [side * 0.47, 1.0, 0.08], 0.025, 6), color: colors.harness },
    );
  }
  risers.add(mesh(THREE, merge(riserParts), material, 'riser-straps'));
  pilot.add(risers);

  const lines = new THREE.Group();
  lines.name = 'suspension-lines';
  const lineParts = [];
  for (const side of [-1, 1]) {
    const low = [side * 0.47, 1.0, 0.08];
    for (const [u, v] of [[0.2, 0.7], [0.46, 0.58], [0.72, 0.46], [0.9, 0.36]]) {
      lineParts.push({ ...strut(THREE, low, canopyBuilt.point(side * u, v, false), 0.011, 5), color: colors.harness });
    }
    const brake = side < 0 ? left.hand : right.hand;
    lineParts.push({ ...strut(THREE, brake, canopyBuilt.point(side * 0.58, 0.94, false), 0.009, 5), color: colors.canopyPattern });
  }
  const lineMesh = mesh(THREE, merge(lineParts), material, 'line-bundle');
  lineMesh.castShadow = false;
  lines.add(lineMesh);
  rig.add(lines);

  rig.userData.parts = {
    canopy,
    pilot,
    harness,
    lines,
    leftArm: left.arm,
    rightArm: right.arm,
    leftForearm: left.forearm,
    rightForearm: right.forearm,
    risers,
    head,
  };
  rig.userData.appearance = config;
  return rig;
}
