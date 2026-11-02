// Self-tests for the scan-models simulation world (explore/fieldWorld.ts): the facts its predictions quote.
import type { SelfTest } from '../../../selftest/types';
import { isTrue, nearAbs } from '../../../selftest/assert';
import { rayCast } from '../../../core/models_field';
import { mixture } from '../../../core/models_beam';
import { LANDMARKS, TRUE_POSE, Z_MAX, halfTurn, landmarkLog, landmarkReadings, mapAndField, scoreParams, scoresAt, simulateScan, slice } from '../explore/fieldWorld';

/** Largest jump between neighbouring samples of a curve (how jagged it is). */
const maxJump = (ys: number[]) => ys.slice(1).reduce((a, y, i) => Math.max(a, Math.abs(y - ys[i])), 0);

export const tests: SelfTest[] = [
  {
    id: 'models-field-world',
    topic: 'models',
    title: 'Scan-models world: the true pose scores best; the beam model is more jagged than the likelihood field along x',
    run: () => {
      const sp = scoreParams(0.1);
      const scan = simulateScan(TRUE_POSE, 60, 0.02, false);
      const s = slice(TRUE_POSE, 'x', scan, sp);
      const mid = (s.off.length - 1) / 2;
      const bestF = s.field.indexOf(Math.max(...s.field));
      const bestB = s.beam.indexOf(Math.max(...s.beam));
      const jf = maxJump(s.field);
      const jb = maxJump(s.beam);
      return [
        isTrue(`likelihood field peaks within 0.05 m of the truth (index ${bestF} vs ${mid})`, Math.abs(bestF - mid) <= 2),
        isTrue(`beam model peaks within 0.05 m of the truth (index ${bestB} vs ${mid})`, Math.abs(bestB - mid) <= 2),
        isTrue(`beam model jumps more between 2.5 cm steps (${jb.toFixed(1)} vs ${jf.toFixed(1)})`, jb > jf),
      ];
    },
  },
  {
    id: 'models-field-through-wall',
    topic: 'models',
    title: 'Through-wall beam: from (6.5, 5.1, 0) the 0° beam ends on the box behind the thin wall (field happy, beam model not)',
    run: () => {
      const { map } = mapAndField();
      const sp = scoreParams(0.1);
      const scan = simulateScan(TRUE_POSE, 60, 0.02, false);
      const k = 30; // angle 0 with 60 beams over 360°
      const h = { x: 6.5, y: 5.1, theta: 0 };
      const sc = scoresAt(h, scan, sp);
      const z = scan.ranges[k];
      const zStar = rayCast(map, h.x, h.y, 0, Z_MAX);
      const pBeam = mixture(z, { ...sp.beam, zStar, zMax: Z_MAX });
      return [
        nearAbs('beam 30 points along the heading', scan.angles[k], 0, 1e-12),
        nearAbs('true 0° range ≈ 3.1 m (to the thin wall)', z, 3.1, 0.08),
        isTrue(`its end point from the hypothesis lies within 6 cm of an obstacle (d = ${sc.field.beams[k].dist.toFixed(3)} m)`, sc.field.beams[k].dist <= 0.06),
        nearAbs('the ray cast from the hypothesis stops at the wall: z* ≈ 0.5 m', zStar, 0.5, 0.06),
        isTrue(`beam model: p(z | z*) is only the random floor (${pBeam.toExponential(2)} ≤ 0.007)`, pBeam <= 0.007),
      ];
    },
  },
  {
    id: 'models-field-landmarks',
    topic: 'models',
    title: 'Landmarks: with identical posts the half-turned pose scores as well as the truth; with known identities it does not',
    run: () => {
      const zsId = landmarkReadings(TRUE_POSE, true);
      const zsKnown = landmarkReadings(TRUE_POSE, false);
      const ht = halfTurn(TRUE_POSE);
      const idTruth = landmarkLog(TRUE_POSE, zsId, true).logq;
      const idHalf = landmarkLog(ht, zsId, true).logq;
      const knTruth = landmarkLog(TRUE_POSE, zsKnown, false).logq;
      const knHalf = landmarkLog(ht, zsKnown, false).logq;
      return [
        nearAbs('identical posts: ln q at the half turn equals ln q at the truth', idHalf, idTruth, 1e-6),
        isTrue(`known identities: the half turn scores far lower (${knHalf.toFixed(0)} vs ${knTruth.toFixed(0)})`, knHalf < knTruth - 100),
        isTrue('four landmarks', LANDMARKS.length === 4),
      ];
    },
  },
  {
    id: 'models-field-person',
    topic: 'models',
    title: 'Unexpected person: the beams that hit the person get the likelihood-field floor, not zero',
    run: () => {
      const sp = scoreParams(0.1);
      const clear = simulateScan(TRUE_POSE, 60, 0.02, false);
      const withP = simulateScan(TRUE_POSE, 60, 0.02, true);
      const changed = withP.ranges.map((z, i) => z < clear.ranges[i] - 0.3).filter(Boolean).length;
      const sc = scoresAt(TRUE_POSE, withP, sp);
      const floor = Math.log(sp.field.zRand / Z_MAX);
      const minFactor = Math.min(...sc.field.beams.filter((b) => !b.skipped).map((b) => b.logq));
      return [
        isTrue(`the person shortens some beams (${changed})`, changed >= 2),
        isTrue(`every beam's factor stays at or above ln(z_rand/z_max) = ${floor.toFixed(2)} (min ${minFactor.toFixed(2)})`, minFactor >= floor - 1e-9),
        isTrue('the true pose still beats a 0.3 m shift with the person present', sc.field.logq > scoresAt({ ...TRUE_POSE, x: TRUE_POSE.x + 0.3 }, withP, sp).field.logq),
      ];
    },
  },
];
