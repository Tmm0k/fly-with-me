// The player paraglider. Geometry is procedural and vertex-colored like the
// rest of the world; the engine supplies its material and owns the flight
// transform. The rig faces +z. Its named groups are deliberately separate so
// the maneuver animator can move canopy attitude, pilot lean, arms, risers and
// lines independently.

export const DEFAULT_PARAGLIDER = {
  colors: {
    canopyPrimary: 0xf2c928,
    canopySecondary: 0xf2eee3,
    canopyPattern: 0x17191d,
    jacket: 0x202329,
    pants: 0x765238,
    helmet: 0x191c21,
    harness: 0x1b2026,
    sunglasses: 0x111317,
    gloves: 0x292d32,
    shoes: 0xf2f0e8,
  },
  below: 1.35,
  bob: 0.035,
  look: { rise: 1.65, ahead: 0 },
};

export const PARAGLIDER_COLOR_KEYS = [
  'canopyPrimary',
  'canopySecondary',
  'canopyPattern',
  'jacket',
  'pants',
  'helmet',
  'harness',
  'sunglasses',
  'gloves',
  'shoes',
];

export function normalizeParagliderAppearance(appearance) {
  const stored = appearance?.colors;
  const colors = {};
  for (const key of PARAGLIDER_COLOR_KEYS) {
    const value = stored?.[key];
    colors[key] = Number.isInteger(value) && value >= 0 && value <= 0xffffff
      ? value
      : DEFAULT_PARAGLIDER.colors[key];
  }
  return { ...DEFAULT_PARAGLIDER, colors };
}

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

function geometryFromTriangles(THREE, triangles) {
  const positions = [];
  const colors = [];
  for (const { points, color } of triangles) {
    const c = new THREE.Color(color);
    for (const point of points) {
      positions.push(...point);
      colors.push(c.r, c.g, c.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function canopyPaint(colors, v) {
  if (v < 2 / 12) return colors.canopySecondary;
  if (v < 4 / 12) return colors.canopyPattern;
  return colors.canopyPrimary;
}

function buildCanopyGeometry(THREE, colors) {
  const cellCount = 28;
  const spanSteps = cellCount * 2;
  const chordSteps = 12;
  const halfSpan = 5.1;
  const point = (u, v, upper) => {
    const tip = Math.abs(u);
    const chord = 2.9 * (1 - 0.67 * tip ** 2.6 - 0.25 * tip ** 7);
    const arc = 5.65 - 1.75 * tip ** 1.65 - 0.28 * tip ** 6;
    const sweep = -0.38 * tip ** 2;
    const airfoil = Math.sin(Math.PI * v ** 0.72);
    const nose = (1 - v) ** 0.55;
    const tipVolume = 0.5 + 0.5 * (1 - tip ** 8);
    const thickness = (0.12 * nose + 0.27 * airfoil) * tipVolume;
    const camber = 0.12 * Math.sin(Math.PI * v) * (1 - 0.35 * tip);
    // Whole cell coordinates are seams; half coordinates crown each chamber.
    const cellPosition = (u + 1) * cellCount * 0.5;
    const cellPhase = cellPosition - Math.floor(cellPosition);
    const inflation = Math.sin(Math.PI * cellPhase) ** 1.6 *
      (0.035 * (1 - v) ** 0.8 + 0.045 * airfoil) * (1 - 0.55 * tip ** 5);
    return [
      halfSpan * Math.sin((Math.PI * u) / 2),
      arc + camber + (upper ? thickness + inflation : -thickness * 0.72 - inflation * 0.28),
      sweep + (0.5 - v) * chord + 0.055 * Math.sin(Math.PI * cellPhase) ** 2 * (1 - v) ** 2,
    ];
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
        color: canopyPaint(colors, v),
      });
      quads.push({
        points: [point(u0, v0, false), point(u1, v0, false), point(u1, v1, false), point(u0, v1, false)],
        color: canopyPaint(colors, v),
        flip: true,
      });
    }
    for (const v of [0, 1]) {
      const color = v === 0 ? colors.canopySecondary : colors.canopyPrimary;
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
        color: canopyPaint(colors, (v0 + v1) * 0.5),
        flip: u < 0,
      });
    }
  }
  const openings = [];
  const openingSegments = 10;
  for (let cell = 0; cell < cellCount; cell++) {
    const u = -1 + ((cell + 0.5) * 2) / cellCount;
    const upper = point(u, 0, true);
    const lower = point(u, 0, false);
    const center = [upper[0], (upper[1] + lower[1]) * 0.5, (upper[2] + lower[2]) * 0.5 + 0.012];
    const perimeter = [];
    for (let segment = 0; segment < openingSegments; segment++) {
      const angle = (segment / openingSegments) * Math.PI * 2;
      const edgeU = u + (Math.cos(angle) * 0.62) / cellCount;
      const edgeUpper = point(edgeU, 0, true);
      const edgeLower = point(edgeU, 0, false);
      perimeter.push([
        (edgeUpper[0] + edgeLower[0]) * 0.5,
        (edgeUpper[1] + edgeLower[1]) * 0.5 + Math.sin(angle) * (upper[1] - lower[1]) * 0.29,
        (edgeUpper[2] + edgeLower[2]) * 0.5 + 0.014,
      ]);
    }
    for (let segment = 0; segment < openingSegments; segment++) {
      openings.push({
        points: [center, perimeter[segment], perimeter[(segment + 1) % openingSegments]],
        color: colors.canopyPattern,
      });
    }
  }
  return {
    geometry: geometryFromQuads(THREE, quads),
    openings: geometryFromTriangles(THREE, openings),
    point,
    cellCount,
  };
}

function strut(THREE, from, to, radius, sides = 7) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const delta = b.clone().sub(a);
  const radii = Array.isArray(radius) ? radius : [radius, radius];
  const geometry = new THREE.CylinderGeometry(radii[1], radii[0], delta.length(), sides);
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

function anchor(THREE, parent, name, at) {
  const result = new THREE.Object3D();
  result.name = name;
  result.position.set(...at);
  parent.add(result);
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
  const upper = strut(THREE, [0, 0, 0], localElbow, [0.135, 0.105], 10);
  arm.add(mesh(THREE, merge([{ ...upper, color }]), material, 'upper-arm'));

  const forearm = new THREE.Group();
  forearm.name = 'forearm';
  forearm.position.set(...localElbow);
  const localHand = hand.map((v, i) => v - elbow[i]);
  const lower = strut(THREE, [0, 0, 0], localHand, [0.105, 0.078], 10);
  forearm.add(mesh(THREE, merge([{ ...lower, color }]), material, 'lower-arm'));
  const glove = new THREE.SphereGeometry(0.13, 10, 7);
  glove.translate(...localHand);
  forearm.add(mesh(THREE, merge([{ geometry: glove, color: gloveColor }]), material, 'glove'));
  const handAnchor = anchor(THREE, forearm, 'brake-hand', localHand);
  arm.add(forearm);
  return { arm, forearm, handAnchor };
}

function lineMesh(THREE, merge, material, color, radius, count, name) {
  const geometry = merge([{ geometry: new THREE.CylinderGeometry(radius, radius, 1, 5), color }]);
  const result = new THREE.InstancedMesh(geometry, material, count);
  result.name = name;
  result.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  result.frustumCulled = false;
  result.castShadow = false;
  result.receiveShadow = false;
  return result;
}

function spring(state, name, target, dt, frequency) {
  const velocity = name + 'Velocity';
  state[velocity] += ((target - state[name]) * frequency * frequency - 2 * frequency * state[velocity]) * dt;
  state[name] += state[velocity] * dt;
  return state[name];
}

/** Keep each lightweight cylinder between its moving attachment objects. */
export function updateParagliderLines(rig) {
  const parts = rig.userData.parts;
  if (!parts?.lineRecords) return;
  rig.updateWorldMatrix(true, true);
  const scratch = rig.userData.lineScratch;
  scratch.inverse.copy(parts.lines.matrixWorld).invert();
  for (const record of parts.lineRecords) {
    scratch.from.setFromMatrixPosition(record.from.matrixWorld).applyMatrix4(scratch.inverse);
    scratch.to.setFromMatrixPosition(record.to.matrixWorld).applyMatrix4(scratch.inverse);
    scratch.delta.subVectors(scratch.to, scratch.from);
    const length = scratch.delta.length();
    scratch.rotation.setFromUnitVectors(scratch.up, scratch.delta.multiplyScalar(1 / length));
    scratch.midpoint.copy(scratch.from).add(scratch.to).multiplyScalar(0.5);
    scratch.scale.set(1, length, 1);
    scratch.matrix.compose(scratch.midpoint, scratch.rotation, scratch.scale);
    record.mesh.setMatrixAt(record.index, scratch.matrix);
  }
  for (const line of parts.lineMeshes) line.instanceMatrix.needsUpdate = true;
}

/** Translate existing flight motion into a stable, suspended paraglider pose. */
export function animateParaglider(rig, dt, motion = {}) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const parts = rig.userData.parts;
  const state = rig.userData.animation;
  const turn = Math.max(-1, Math.min(1, (motion.turnRate ?? 0) / 0.55));
  const vertical = Math.max(-1, Math.min(1, (motion.verticalRate ?? 0) / 16));
  const aimed = Math.max(-1, Math.min(1, (motion.aim ?? 0) / 0.45));
  const pitch = Math.max(-1, Math.min(1, vertical * 0.75 + aimed * 0.25));
  const time = Number.isFinite(motion.time) ? motion.time : 0;
  const air = Math.sin(time * 0.83) * 0.004 + Math.sin(time * 1.37 + 0.8) * 0.002;

  const canopyBank = spring(state, 'canopyBank', -turn * 0.14 + air, dt, 8);
  const pilotBank = spring(state, 'pilotBank', -turn * 0.22 + air * 0.7, dt, 4.2);
  const pilotShift = spring(state, 'pilotShift', -turn * 0.1, dt, 3.8);
  const canopyPitch = spring(state, 'canopyPitch', -pitch * 0.035, dt, 6);
  const pilotPitch = spring(state, 'pilotPitch', pitch * 0.07, dt, 3.8);
  const leftBrake = spring(state, 'leftBrake', Math.max(0, turn) * 0.42 - Math.max(0, -turn) * 0.04, dt, 7);
  const rightBrake = spring(state, 'rightBrake', Math.max(0, -turn) * 0.42 - Math.max(0, turn) * 0.04, dt, 7);

  parts.canopy.rotation.set(canopyPitch, 0, canopyBank);
  parts.pilot.rotation.set(pilotPitch, 0, pilotBank);
  parts.pilot.position.set(pilotShift, Math.sin(time * 0.72 + 0.4) * 0.012, -pitch * 0.035);
  parts.harness.rotation.z = pilotBank * 0.12;
  parts.leftArm.rotation.x = leftBrake * 0.48;
  parts.rightArm.rotation.x = rightBrake * 0.48;
  parts.leftForearm.rotation.x = leftBrake;
  parts.rightForearm.rotation.x = rightBrake;
  updateParagliderLines(rig);
}

/** Build the visible player rig around the engine-owned flight pivot. */
export function createParaglider(appearance, kit) {
  const { THREE, merge, M, material } = kit;
  const config = normalizeParagliderAppearance(appearance);
  const colors = config.colors;
  const rig = new THREE.Group();
  rig.name = 'paraglider';
  rig.rotation.order = 'YXZ';

  const canopy = new THREE.Group();
  canopy.name = 'canopy';
  const canopyBuilt = buildCanopyGeometry(THREE, colors);
  const canopySurface = mesh(THREE, canopyBuilt.geometry, material, 'canopy-surface');
  canopySurface.userData.cellCount = canopyBuilt.cellCount;
  const cellOpenings = mesh(THREE, canopyBuilt.openings, material, 'canopy-cell-openings');
  cellOpenings.userData.cellCount = canopyBuilt.cellCount;
  cellOpenings.castShadow = false;
  canopy.add(canopySurface, cellOpenings);
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

  pilot.add(
    mesh(
      THREE,
      merge([
        {
          geometry: new THREE.CapsuleGeometry(0.27, 0.5, 6, 12),
          matrix: M(0, 0.43, -0.21, 1.08, 1, 0.82, -0.18, 0, 0),
          color: colors.jacket,
        },
        {
          geometry: new THREE.SphereGeometry(1, 12, 8),
          matrix: M(0, 0.76, -0.3, 0.39, 0.18, 0.25, -0.18, 0, 0),
          color: colors.jacket,
        },
      ]),
      material,
      'jacket',
    ),
  );

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.3, -0.38);
  head.add(
    mesh(
      THREE,
      merge([
        { geometry: new THREE.SphereGeometry(1, 14, 9), matrix: M(0, -0.01, 0, 0.25, 0.29, 0.26), color: 0xb98268 },
        { geometry: new THREE.SphereGeometry(1, 16, 10), matrix: M(0, 0.11, -0.035, 0.3, 0.255, 0.31), color: colors.helmet },
        { geometry: new THREE.CylinderGeometry(0.285, 0.285, 0.075, 16), matrix: M(0, -0.055, -0.02), color: colors.helmet },
        { geometry: new THREE.SphereGeometry(1, 9, 6), matrix: M(-0.255, -0.025, 0.005, 0.045, 0.085, 0.055), color: 0xb98268 },
        { geometry: new THREE.SphereGeometry(1, 9, 6), matrix: M(0.255, -0.025, 0.005, 0.045, 0.085, 0.055), color: 0xb98268 },
        { geometry: new THREE.BoxGeometry(0.51, 0.085, 0.075), matrix: M(0, 0.005, 0.245), color: colors.sunglasses },
        { geometry: new THREE.SphereGeometry(1, 8, 5), matrix: M(0, -0.07, 0.255, 0.045, 0.055, 0.055), color: 0xa86f58 },
        { geometry: new THREE.BoxGeometry(0.42, 0.05, 0.17), matrix: M(0, 0.18, 0.21, 1, 1, 1, -0.12, 0, 0), color: colors.helmet },
      ]),
      material,
      'headwear-and-sunglasses',
    ),
  );
  pilot.add(head);

  const left = limb(THREE, material, merge, colors.jacket, colors.gloves, -1);
  const right = limb(THREE, material, merge, colors.jacket, colors.gloves, 1);
  pilot.add(left.arm, right.arm);

  const legs = [];
  const shoeUppers = [];
  const shoeSoles = [];
  for (const side of [-1, 1]) {
    const hip = [side * 0.2, -0.23, 0.03];
    const knee = [side * 0.23, -0.58, 0.67];
    const foot = [side * 0.24, -1.2, 0.52];
    const thigh = strut(THREE, hip, knee, [0.17, 0.145], 10);
    const shin = strut(THREE, knee, foot, [0.14, 0.105], 10);
    legs.push({ ...thigh, color: colors.pants }, { ...shin, color: colors.pants });
    legs.push({ geometry: new THREE.SphereGeometry(1, 9, 6), matrix: M(...knee, 0.155, 0.15, 0.16), color: colors.pants });
    shoeUppers.push(
      { geometry: new THREE.SphereGeometry(1, 12, 7), matrix: M(side * 0.24, -1.18, 0.59, 0.15, 0.13, 0.31, Math.PI / 2, 0, 0), color: colors.shoes },
      { geometry: new THREE.SphereGeometry(1, 12, 7), matrix: M(side * 0.24, -1.18, 0.79, 0.155, 0.115, 0.2), color: colors.shoes },
      { geometry: new THREE.BoxGeometry(0.26, 0.19, 0.13), matrix: M(side * 0.24, -1.2, 0.43), color: colors.shoes },
    );
    shoeSoles.push({ geometry: new THREE.BoxGeometry(0.3, 0.055, 0.55), matrix: M(side * 0.24, -1.3, 0.63, 1, 1, 1, 0.03, 0, 0), color: colors.shoes });
  }
  pilot.add(mesh(THREE, merge(legs), material, 'seated-legs'));
  const shoes = new THREE.Group();
  shoes.name = 'shoes';
  shoes.add(
    mesh(THREE, merge(shoeUppers), material, 'shoe-uppers'),
    mesh(THREE, merge(shoeSoles), material, 'shoe-soles'),
  );
  pilot.add(shoes);

  const risers = new THREE.Group();
  risers.name = 'risers';
  const riserParts = [];
  const riserAnchors = [];
  for (const side of [-1, 1]) {
    riserParts.push(
      { ...strut(THREE, [side * 0.26, 0.42, -0.08], [side * 0.4, 0.78, 0.02], 0.025, 6), color: colors.harness },
      { ...strut(THREE, [side * 0.4, 0.78, 0.02], [side * 0.47, 1.0, 0.08], 0.025, 6), color: colors.harness },
    );
    riserAnchors.push(anchor(THREE, risers, side < 0 ? 'left-riser' : 'right-riser', [side * 0.47, 1.0, 0.08]));
  }
  risers.add(mesh(THREE, merge(riserParts), material, 'riser-straps'));
  pilot.add(risers);

  const lines = new THREE.Group();
  lines.name = 'suspension-lines';
  const suspensionLines = lineMesh(THREE, merge, material, colors.harness, 0.011, 12, 'suspension-line-bundle');
  const brakeLines = lineMesh(THREE, merge, material, colors.canopyPattern, 0.009, 2, 'brake-line-bundle');
  lines.add(suspensionLines, brakeLines);
  rig.add(lines);

  const lineRecords = [];
  let suspensionIndex = 0;
  const suspensionPlan = [
    [5 / 28, 0.44],
    [9 / 28, 0.58],
    [13 / 28, 0.47],
    [17 / 28, 0.62],
    [21 / 28, 0.5],
    [25 / 28, 0.58],
  ];
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex === 0 ? -1 : 1;
    for (const [u, v] of suspensionPlan) {
      const top = anchor(
        THREE,
        canopy,
        `${side < 0 ? 'left' : 'right'}-suspension-${suspensionIndex % 6}`,
        canopyBuilt.point(side * u, v, false),
      );
      lineRecords.push({ mesh: suspensionLines, index: suspensionIndex++, from: riserAnchors[sideIndex], to: top });
    }
    const brakeTop = anchor(
      THREE,
      canopy,
      `${side < 0 ? 'left' : 'right'}-brake-canopy`,
      canopyBuilt.point(side * (21 / 28), 0.94, false),
    );
    lineRecords.push({
      mesh: brakeLines,
      index: sideIndex,
      from: side < 0 ? left.handAnchor : right.handAnchor,
      to: brakeTop,
    });
  }

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
    shoes,
    canopySurface,
    cellOpenings,
    lineRecords,
    lineMeshes: [suspensionLines, brakeLines],
  };
  rig.userData.animation = {
    canopyBank: 0,
    canopyBankVelocity: 0,
    pilotBank: 0,
    pilotBankVelocity: 0,
    pilotShift: 0,
    pilotShiftVelocity: 0,
    canopyPitch: 0,
    canopyPitchVelocity: 0,
    pilotPitch: 0,
    pilotPitchVelocity: 0,
    leftBrake: 0,
    leftBrakeVelocity: 0,
    rightBrake: 0,
    rightBrakeVelocity: 0,
  };
  rig.userData.lineScratch = {
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    delta: new THREE.Vector3(),
    midpoint: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    rotation: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
    inverse: new THREE.Matrix4(),
  };
  rig.userData.appearance = config;
  updateParagliderLines(rig);
  return rig;
}

/** Replace only the visible rig while retaining the engine-owned player pivot. */
export function dressParaglider(rig, appearance, kit) {
  const oldParts = rig.userData.parts;
  const animation = rig.userData.animation;
  const pose = {};
  for (const name of ['canopy', 'pilot', 'harness', 'leftArm', 'rightArm', 'leftForearm', 'rightForearm']) {
    const part = oldParts?.[name];
    if (part) pose[name] = {
      position: part.position.clone(),
      quaternion: part.quaternion.clone(),
      scale: part.scale.clone(),
    };
  }

  const geometries = new Set();
  rig.traverse((object) => {
    if (object !== rig && object.geometry) geometries.add(object.geometry);
  });
  while (rig.children.length) rig.remove(rig.children[0]);
  for (const geometry of geometries) geometry.dispose();

  const fresh = createParaglider(appearance, kit);
  while (fresh.children.length) rig.add(fresh.children[0]);
  rig.userData.parts = fresh.userData.parts;
  rig.userData.lineScratch = fresh.userData.lineScratch;
  rig.userData.appearance = fresh.userData.appearance;
  rig.userData.animation = animation;

  for (const [name, transform] of Object.entries(pose)) {
    const part = rig.userData.parts[name];
    part.position.copy(transform.position);
    part.quaternion.copy(transform.quaternion);
    part.scale.copy(transform.scale);
  }
  updateParagliderLines(rig);
  return rig;
}
