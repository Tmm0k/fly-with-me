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
    skin: 0xb98268,
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
  'skin',
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

function geometryFromFaces(THREE, quads, triangles = []) {
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
  for (const { points, color } of triangles) {
    for (const point of points) push(point, color);
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
  const spanSteps = cellCount * 4;
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
    quads.push({
      points: [point(u0, 1, false), point(u1, 1, false), point(u1, 1, true), point(u0, 1, true)],
      color: colors.canopyPrimary,
      flip: true,
    });
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
  const openingQuads = [];
  const openingBacks = [];
  const openingSegments = 12;
  const intakeDepth = 0.14;
  const leading = (u) => {
    const upper = point(u, 0, true);
    const lower = point(u, 0, false);
    return {
      x: (upper[0] + lower[0]) * 0.5,
      y: (upper[1] + lower[1]) * 0.5,
      z: (upper[2] + lower[2]) * 0.5,
      halfHeight: (upper[1] - lower[1]) * 0.5,
    };
  };
  // Each cell replaces the closed nose face with a fabric rim around a short tunnel.
  for (let cell = 0; cell < cellCount; cell++) {
    const u = -1 + ((cell + 0.5) * 2) / cellCount;
    const center = leading(u);
    const outer = [];
    const mouth = [];
    const back = [];
    for (let segment = 0; segment < openingSegments; segment++) {
      const angle = (segment / openingSegments) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const edgeScale = 1 / Math.max(Math.abs(cosine), Math.abs(sine));
      const outerEdge = leading(u + (cosine * edgeScale) / cellCount);
      const mouthEdge = leading(u + (cosine * 0.62) / cellCount);
      const backEdge = leading(u + (cosine * 0.52) / cellCount);
      outer.push([
        outerEdge.x,
        outerEdge.y + sine * edgeScale * outerEdge.halfHeight,
        outerEdge.z,
      ]);
      mouth.push([
        mouthEdge.x,
        mouthEdge.y + sine * center.halfHeight * 0.58,
        mouthEdge.z + 0.006,
      ]);
      back.push([
        backEdge.x,
        backEdge.y + sine * center.halfHeight * 0.48,
        backEdge.z - intakeDepth,
      ]);
    }
    for (let segment = 0; segment < openingSegments; segment++) {
      const next = (segment + 1) % openingSegments;
      quads.push({
        points: [outer[segment], outer[next], mouth[next], mouth[segment]],
        color: colors.canopySecondary,
      });
      openingQuads.push({
        points: [mouth[segment], mouth[next], back[next], back[segment]],
        color: colors.canopyPattern,
      });
      openingBacks.push({
        points: [[center.x, center.y, center.z - intakeDepth], back[segment], back[next]],
        color: colors.canopyPattern,
      });
    }
  }
  return {
    geometry: geometryFromFaces(THREE, quads),
    openings: geometryFromFaces(THREE, openingQuads, openingBacks),
    point,
    cellCount,
    intakeDepth,
    openingSegments,
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

// A light, lathed volume gives the avatar deliberate shoulders, waist, jaw
// and other silhouettes without introducing a character asset or skeleton.
function profiledGeometry(THREE, rings, segments = 12) {
  const positions = [];
  const indices = [];
  for (const ring of rings) {
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions.push(
        (ring.x ?? 0) + Math.cos(angle) * ring.rx,
        ring.y,
        (ring.z ?? 0) + Math.sin(angle) * ring.rz,
      );
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const a = ring * segments + i;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + next;
      const d = (ring + 1) * segments + i;
      indices.push(a, b, c, a, c, d);
    }
  }
  const bottom = positions.length / 3;
  positions.push(rings[0].x ?? 0, rings[0].y, rings[0].z ?? 0);
  const top = positions.length / 3;
  const last = rings.at(-1);
  positions.push(last.x ?? 0, last.y, last.z ?? 0);
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(bottom, next, i);
    const offset = (rings.length - 1) * segments;
    indices.push(top, offset + i, offset + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A few low, chamfered cross-sections make a readable sneaker without the
// inflated silhouette produced by capsules and overlapping spheres.
function shoeGeometry(THREE, sections) {
  const positions = [];
  const indices = [];
  for (const { z, width, bottom, top, bevel } of sections) {
    const inset = Math.min(bevel, width * 0.45, (top - bottom) * 0.45);
    positions.push(
      -width + inset, bottom, z,
      width - inset, bottom, z,
      width, bottom + inset, z,
      width, top - inset, z,
      width - inset, top, z,
      -width + inset, top, z,
      -width, top - inset, z,
      -width, bottom + inset, z,
    );
  }
  for (let section = 0; section < sections.length - 1; section++) {
    const at = section * 8;
    const nextAt = at + 8;
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      indices.push(at + i, at + next, nextAt + next, at + i, nextAt + next, nextAt + i);
    }
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i);
  const end = (sections.length - 1) * 8;
  for (let i = 1; i < 7; i++) indices.push(end, end + i, end + i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
  const shoulder = [side * 0.36, 0.73, -0.25];
  const elbow = [side * 0.55, 0.34, 0.015];
  const hand = [side * 0.43, 0.58, 0.28];
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'left-arm' : 'right-arm';
  arm.position.set(...shoulder);
  const localElbow = elbow.map((v, i) => v - shoulder[i]);
  const upper = strut(THREE, [0, 0, 0], localElbow, [0.15, 0.105], 10);
  arm.add(
    mesh(
      THREE,
      merge([
        { ...upper, color },
        { geometry: new THREE.SphereGeometry(1, 10, 7), matrix: new THREE.Matrix4().makeScale(0.16, 0.15, 0.15), color },
      ]),
      material,
      'upper-arm',
    ),
  );

  const forearm = new THREE.Group();
  forearm.name = 'forearm';
  forearm.position.set(...localElbow);
  const localHand = hand.map((v, i) => v - elbow[i]);
  const lower = strut(THREE, [0, 0, 0], localHand, [0.115, 0.075], 10);
  forearm.add(
    mesh(
      THREE,
      merge([
        { ...lower, color },
        { geometry: new THREE.SphereGeometry(1, 9, 6), matrix: new THREE.Matrix4().makeScale(0.112, 0.112, 0.105), color },
      ]),
      material,
      'lower-arm',
    ),
  );
  const direction = new THREE.Vector3(...localHand).normalize();
  const gloveStart = new THREE.Vector3(...localHand).addScaledVector(direction, -0.07).toArray();
  const gloveEnd = new THREE.Vector3(...localHand).addScaledVector(direction, 0.09).toArray();
  const mitten = strut(THREE, gloveStart, gloveEnd, [0.09, 0.105], 9);
  const fingertip = new THREE.SphereGeometry(1, 10, 7);
  fingertip.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...gloveEnd),
      new THREE.Quaternion(),
      new THREE.Vector3(0.105, 0.115, 0.105),
    ),
  );
  const thumb = new THREE.SphereGeometry(1, 8, 6);
  thumb.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(localHand[0] - side * 0.075, localHand[1] - 0.015, localHand[2] + 0.015),
      new THREE.Quaternion(),
      new THREE.Vector3(0.055, 0.075, 0.06),
    ),
  );
  const glove = mesh(
    THREE,
    merge([{ ...mitten, color: gloveColor }, { geometry: fingertip, color: gloveColor }, { geometry: thumb, color: gloveColor }]),
    material,
    'glove',
  );
  forearm.add(glove);
  const handAnchor = anchor(THREE, forearm, 'brake-hand', localHand);
  arm.add(forearm);
  return { arm, forearm, glove, handAnchor };
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
  cellOpenings.userData.intakeDepth = canopyBuilt.intakeDepth;
  cellOpenings.userData.openingSegments = canopyBuilt.openingSegments;
  cellOpenings.castShadow = false;
  canopy.add(canopySurface, cellOpenings);
  rig.add(canopy);

  const pilot = new THREE.Group();
  pilot.name = 'pilot';
  pilot.rotation.order = 'YXZ';
  rig.add(pilot);

  const harness = new THREE.Group();
  harness.name = 'harness';
  const harnessBack = profiledGeometry(
    THREE,
    [
      { y: -0.02, z: -0.4, rx: 0.22, rz: 0.055 },
      { y: 0.22, z: -0.44, rx: 0.29, rz: 0.06 },
      { y: 0.52, z: -0.45, rx: 0.27, rz: 0.055 },
      { y: 0.68, z: -0.4, rx: 0.18, rz: 0.045 },
    ],
    10,
  );
  const harnessStraps = [];
  for (const side of [-1, 1]) {
    harnessStraps.push(
      { ...strut(THREE, [side * 0.27, 0.67, -0.38], [side * 0.2, 0.08, -0.44], 0.035, 7), color: colors.harness },
      { ...strut(THREE, [side * 0.21, 0.02, -0.31], [side * 0.27, -0.31, -0.12], 0.032, 7), color: colors.harness },
      { ...strut(THREE, [side * 0.27, -0.31, -0.12], [side * 0.24, -0.49, 0.34], 0.026, 7), color: colors.harness },
    );
  }
  harnessStraps.push({ ...strut(THREE, [-0.33, 0.08, -0.43], [0.33, 0.08, -0.43], 0.035, 7), color: colors.harness });
  harness.add(
    mesh(
      THREE,
      merge([
        { geometry: harnessBack, color: colors.harness },
        {
          geometry: profiledGeometry(THREE, [
            { y: -0.16, z: -0.25, rx: 0.28, rz: 0.1 },
            { y: -0.27, z: -0.18, rx: 0.37, rz: 0.15 },
            { y: -0.37, z: -0.02, rx: 0.32, rz: 0.18 },
          ], 12),
          color: colors.harness,
        },
        ...harnessStraps,
      ]),
      material,
      'harness-shell',
    ),
  );
  pilot.add(harness);

  const jacket = mesh(
    THREE,
    merge([
      {
        geometry: profiledGeometry(THREE, [
          { y: -0.02, z: -0.08, rx: 0.22, rz: 0.145 },
          { y: 0.12, z: -0.105, rx: 0.27, rz: 0.175 },
          { y: 0.42, z: -0.18, rx: 0.32, rz: 0.2 },
          { y: 0.66, z: -0.245, rx: 0.39, rz: 0.205 },
          { y: 0.77, z: -0.285, rx: 0.31, rz: 0.17 },
          { y: 0.84, z: -0.31, rx: 0.16, rz: 0.115 },
        ], 14),
        color: colors.jacket,
      },
      {
        geometry: new THREE.TorusGeometry(0.14, 0.025, 6, 14),
        matrix: M(0, 0.845, -0.31, 1, 1, 1, Math.PI / 2, 0, 0),
        color: colors.jacket,
      },
    ]),
    material,
    'jacket',
  );
  pilot.add(jacket);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.3, -0.38);
  const skin = mesh(
    THREE,
    merge([
      {
        geometry: profiledGeometry(THREE, [
          { y: -0.24, z: 0.035, rx: 0.13, rz: 0.15 },
          { y: -0.19, z: 0.025, rx: 0.19, rz: 0.205 },
          { y: -0.05, z: 0.015, rx: 0.245, rz: 0.255 },
          { y: 0.1, z: -0.005, rx: 0.255, rz: 0.265 },
          { y: 0.22, z: -0.025, rx: 0.205, rz: 0.22 },
          { y: 0.26, z: -0.035, rx: 0.12, rz: 0.14 },
        ], 14),
        color: colors.skin,
      },
      { geometry: new THREE.SphereGeometry(1, 9, 6), matrix: M(-0.25, -0.035, 0, 0.043, 0.078, 0.052), color: colors.skin },
      { geometry: new THREE.SphereGeometry(1, 9, 6), matrix: M(0.25, -0.035, 0, 0.043, 0.078, 0.052), color: colors.skin },
      { geometry: new THREE.SphereGeometry(1, 8, 5), matrix: M(0, -0.065, 0.255, 0.042, 0.058, 0.055), color: colors.skin },
      { geometry: new THREE.CylinderGeometry(0.115, 0.14, 0.17, 12), matrix: M(0, -0.325, -0.02), color: colors.skin },
    ]),
    material,
    'skin',
  );
  const headwear = mesh(
    THREE,
    merge([
      { geometry: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.61), matrix: M(0, 0.105, -0.04, 0.29, 0.26, 0.3), color: colors.helmet },
      { geometry: new THREE.CylinderGeometry(0.28, 0.265, 0.065, 16), matrix: M(0, -0.045, -0.025), color: colors.helmet },
      { geometry: new THREE.BoxGeometry(0.39, 0.045, 0.18), matrix: M(0, 0.13, 0.225, 1, 1, 1, -0.11, 0, 0), color: colors.helmet },
    ]),
    material,
    'headwear',
  );
  const sunglasses = mesh(
    THREE,
    merge([
      { geometry: new THREE.SphereGeometry(1, 10, 6), matrix: M(-0.13, 0.015, 0.248, 0.115, 0.064, 0.025, 0, -0.1, -0.04), color: colors.sunglasses },
      { geometry: new THREE.SphereGeometry(1, 10, 6), matrix: M(0.13, 0.015, 0.248, 0.115, 0.064, 0.025, 0, 0.1, 0.04), color: colors.sunglasses },
      { ...strut(THREE, [-0.035, 0.02, 0.266], [0.035, 0.02, 0.266], 0.012, 6), color: colors.sunglasses },
      { ...strut(THREE, [-0.235, 0.025, 0.225], [-0.255, -0.01, 0.035], 0.012, 6), color: colors.sunglasses },
      { ...strut(THREE, [0.235, 0.025, 0.225], [0.255, -0.01, 0.035], 0.012, 6), color: colors.sunglasses },
    ]),
    material,
    'sunglasses',
  );
  head.add(skin, headwear, sunglasses);
  pilot.add(head);

  const left = limb(THREE, material, merge, colors.jacket, colors.gloves, -1);
  const right = limb(THREE, material, merge, colors.jacket, colors.gloves, 1);
  pilot.add(left.arm, right.arm);

  const pants = new THREE.Group();
  pants.name = 'pants';
  const pantsSeat = mesh(
    THREE,
    merge([{
      geometry: profiledGeometry(THREE, [
        { y: 0.015, z: -0.035, rx: 0.22, rz: 0.14 },
        { y: -0.1, z: -0.015, rx: 0.285, rz: 0.19 },
        { y: -0.24, z: 0.035, rx: 0.31, rz: 0.225 },
        { y: -0.35, z: 0.14, rx: 0.27, rz: 0.2 },
      ], 12),
      color: colors.pants,
    }]),
    material,
    'pants-seat',
  );
  const legs = [];
  const shoeUppers = [];
  const shoeSoles = [];
  for (const side of [-1, 1]) {
    const hip = [side * 0.19, -0.27, 0.13];
    const knee = [side * 0.24, -0.58, 0.62];
    const foot = [side * 0.24, -1.12, 0.51];
    const thigh = strut(THREE, hip, knee, [0.17, 0.145], 10);
    const shin = strut(THREE, knee, foot, [0.145, 0.095], 10);
    legs.push({ ...thigh, color: colors.pants }, { ...shin, color: colors.pants });
    legs.push(
      { geometry: new THREE.SphereGeometry(1, 9, 6), matrix: M(...knee, 0.15, 0.14, 0.15), color: colors.pants },
      { geometry: new THREE.CylinderGeometry(0.105, 0.095, 0.15, 9), matrix: M(side * 0.24, -1.08, 0.5, 1, 1, 1, 0.2, 0, 0), color: colors.pants },
    );
    shoeUppers.push(
      {
        geometry: shoeGeometry(THREE, [
          { z: -0.25, width: 0.105, bottom: -0.065, top: 0.105, bevel: 0.025 },
          { z: -0.1, width: 0.115, bottom: -0.065, top: 0.12, bevel: 0.025 },
          { z: 0.08, width: 0.135, bottom: -0.065, top: 0.095, bevel: 0.025 },
          { z: 0.25, width: 0.12, bottom: -0.065, top: 0.055, bevel: 0.025 },
        ]),
        matrix: M(side * 0.24, -1.2, 0.69, 1, 1, 1, 0.035, 0, 0),
        color: colors.shoes,
      },
    );
    shoeSoles.push({
      geometry: shoeGeometry(THREE, [
        { z: -0.29, width: 0.12, bottom: -0.03, top: 0.03, bevel: 0.015 },
        { z: 0.1, width: 0.15, bottom: -0.03, top: 0.03, bevel: 0.015 },
        { z: 0.29, width: 0.135, bottom: -0.03, top: 0.03, bevel: 0.015 },
      ]),
      matrix: M(side * 0.24, -1.285, 0.69, 1, 1, 1, 0.035, 0, 0),
      color: colors.shoes,
    });
  }
  const seatedLegs = mesh(THREE, merge(legs), material, 'seated-legs');
  pants.add(pantsSeat, seatedLegs);
  pilot.add(pants);
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
    skin,
    headwear,
    sunglasses,
    jacket,
    pants,
    pantsSeat,
    seatedLegs,
    leftGlove: left.glove,
    rightGlove: right.glove,
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
