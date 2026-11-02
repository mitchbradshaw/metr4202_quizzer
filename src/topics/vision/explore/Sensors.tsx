// Robot sensors compared (summary notes §7 "Sensors"; 2023 Q27 and 2024 Q25, three marks each; 2023 Q23 fiducials).
//
// Cards for eight sensors that can be arranged by proprioceptive / exteroceptive and active / passive. Pick two to
// build the three-mark comparison the papers ask for. Below, the fiducial-marker panel (visionFiducial.tsx).
import { useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Badge, Segmented } from '../../../ui/kit';
import { Rich } from '../../../ui/Rich';
import { Panel } from './visionCommon';
import { FiducialPanel } from './visionFiducial';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'sensors',
  title: 'Sensors compared, and fiducial markers',
  summary:
    'Eight robot sensors on cards: what each measures, strengths, weaknesses and uses, arranged by proprioceptive / exteroceptive and active / passive. Pick two to build the 3-mark comparison answer; then see why one fiducial marker is enough in theory but several are better.',
  notice:
    'Ask two questions of any sensor: does it sense the robot itself (proprioceptive) or the world (exteroceptive)? Does it emit energy and time the return (active) or only receive (passive)? A camera tells you **what** things are; a lidar tells you **where** surfaces are.',
  minutes: 8,
};

export interface Sensor {
  id: string;
  name: string;
  proprio: boolean;
  active: boolean;
  /** Why it is active or passive, when it is not obvious. */
  classNote?: string;
  measures: string;
  strengths: string[];
  weaknesses: string[];
  uses: string[];
  /** One-line summary for the comparison answer. */
  gist: string;
}

export const SENSORS: Sensor[] = [
  {
    id: 'camera',
    name: 'Camera (monocular)',
    proprio: false,
    active: false,
    measures: 'Light intensity and colour over a dense 2-D image: the bearing to each scene point, but no direct depth.',
    strengths: ['Cheap, small, high resolution', 'Rich colour, texture and semantics: recognise objects, read signs and fiducials'],
    weaknesses: ['No direct depth: scale ambiguity from one image', 'Depends on lighting (dark, glare, shadows); needs calibration and heavy processing'],
    uses: ['Object recognition', 'Fiducial markers', 'Lane following', 'Visual servoing', 'Visual odometry'],
    gist: 'tells you what things are, and in which direction',
  },
  {
    id: 'lidar2d',
    name: '2-D lidar',
    proprio: false,
    active: true,
    measures: 'Range and bearing to surfaces in one plane, by timing laser pulses (time of flight) as the beam sweeps.',
    strengths: ['Accurate metric ranges (cm) over a wide field of view', 'Works in the dark: it brings its own light'],
    weaknesses: ['Sees one horizontal slice only (misses tables, overhangs)', 'No colour or texture; glass, mirrors and black surfaces return poorly'],
    uses: ['2-D occupancy-grid mapping and SLAM', 'Indoor localisation', 'Obstacle avoidance and safety scanners'],
    gist: 'tells you precisely where surfaces are, in one plane',
  },
  {
    id: 'lidar3d',
    name: '3-D lidar',
    proprio: false,
    active: true,
    measures: 'Range and bearing over many beams at different elevations: a 3-D point cloud around the robot.',
    strengths: ['Accurate 3-D geometry at long range (tens to 100+ m)', 'Independent of ambient light; 360° coverage'],
    weaknesses: ['Expensive, heavy data rate', 'Sparse at range, no colour; degraded by rain, fog and dust'],
    uses: ['Self-driving cars', 'Outdoor 3-D mapping and SLAM', 'Terrain and obstacle detection'],
    gist: 'gives the 3-D shape of the surroundings',
  },
  {
    id: 'sonar',
    name: 'Sonar (ultrasonic)',
    proprio: false,
    active: true,
    measures: 'Range to the nearest echo inside a wide cone, by timing a sound pulse.',
    strengths: ['Very cheap and simple', 'Works in the dark and on glass; also underwater'],
    weaknesses: ['Wide beam: poor bearing resolution', 'Specular reflections (smooth walls at an angle vanish), slow, crosstalk between units'],
    uses: ['Bumper-level obstacle detection', 'Parking sensors', 'Underwater ranging'],
    gist: 'says something is roughly that far away, somewhere in its cone',
  },
  {
    id: 'imu',
    name: 'IMU',
    proprio: true,
    active: false,
    measures: 'Linear acceleration and angular rate (often a magnetometer heading too), of the robot itself.',
    strengths: ['High rate (100-1000 Hz), self-contained', 'Works anywhere: no environment or infrastructure needed'],
    weaknesses: ['Integrating to velocity and position drifts quickly (bias, noise)', 'Gravity must be removed; says nothing about the world'],
    uses: ['Attitude estimation (drones, phones)', 'Dead reckoning between GPS fixes', 'Prediction (motion model) step'],
    gist: 'tells you how the robot is accelerating and turning',
  },
  {
    id: 'encoder',
    name: 'Wheel / joint encoders',
    proprio: true,
    active: true,
    classNote: 'Optical encoders shine an LED through a slotted disc (Siegwart counts them as active); the course just calls them proprioceptive.',
    measures: 'Rotation of a wheel or joint (counts per revolution), so wheel travel and joint angles.',
    strengths: ['Cheap, precise, high rate', 'Direct joint angles for an arm; wheel odometry for a mobile robot'],
    weaknesses: ['Odometry drift: wheel slip, uneven floors and wrong wheel radii accumulate', 'Says nothing about the world'],
    uses: ['Odometry for the prediction step', 'Joint-angle feedback in arms', 'Motor speed control'],
    gist: 'tells you how far the wheels or joints have turned',
  },
  {
    id: 'gps',
    name: 'GPS (GNSS)',
    proprio: false,
    active: false,
    classNote: 'The receiver only listens (passive); some texts call GPS active because it relies on beacons that transmit.',
    measures: 'Global position (and time) from the arrival times of satellite signals.',
    strengths: ['Absolute position in a global frame: no drift', 'Cheap and everywhere outdoors'],
    weaknesses: ['Metres of error (unless RTK); multipath in urban canyons', 'No signal indoors, underground, underwater or on the Moon; low rate'],
    uses: ['Outdoor navigation', 'Global localisation', 'Fused with IMU and odometry'],
    gist: 'tells you roughly where you are on Earth',
  },
  {
    id: 'rgbd',
    name: 'Depth camera (RGB-D)',
    proprio: false,
    active: true,
    measures: 'A depth image (per-pixel range by structured light or time of flight), registered with a colour image.',
    strengths: ['Dense 3-D at video rate, cheap', 'Colour and depth together'],
    weaknesses: ['Short range (about 0.3-5 m); noise grows with distance', 'Fails in sunlight (its infrared is washed out) and on shiny, black or transparent surfaces'],
    uses: ['Indoor manipulation and grasping', '3-D reconstruction', 'People tracking'],
    gist: 'gives a dense, short-range 3-D picture with colour',
  },
];

type Arrange = 'all' | 'proprio' | 'active' | 'quad';

function SensorCard({ s, picked, onPick }: { s: Sensor; picked: boolean; onPick: () => void }) {
  return (
    <div className={`vision-sensor ${picked ? 'is-picked' : ''}`}>
      <div className="vision-sensor-head">
        <strong>{s.name}</strong>
        <button type="button" className={`btn btn-sm ${picked ? 'btn-primary' : ''}`} onClick={onPick} aria-pressed={picked}>
          {picked ? 'Comparing' : 'Compare'}
        </button>
      </div>
      <div className="vision-row">
        <Badge tone={s.proprio ? 'm3' : 'm1'}>{s.proprio ? 'proprioceptive' : 'exteroceptive'}</Badge>
        <Badge tone={s.active ? 'm2' : 'm4'}>{s.active ? 'active' : 'passive'}</Badge>
      </div>
      <p className="vision-sensor-meas">{s.measures}</p>
      <ul className="vision-pm">
        {s.strengths.map((x) => (
          <li key={x} className="is-plus">
            {x}
          </li>
        ))}
        {s.weaknesses.map((x) => (
          <li key={x} className="is-minus">
            {x}
          </li>
        ))}
      </ul>
      <p className="vision-sensor-uses">
        <b>Uses:</b> {s.uses.join(' · ')}
      </p>
      {s.classNote && <p className="vision-sensor-note">{s.classNote}</p>}
    </div>
  );
}

function compareText(a: Sensor, b: Sensor): string {
  const kind = (s: Sensor) => `${s.active ? 'active' : 'passive'}, ${s.proprio ? 'proprioceptive' : 'exteroceptive'}`;
  const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const sameAP = a.active === b.active;
  return `**Model answer (3 marks)**

- **${a.name}** (${kind(a)}): ${lc(a.measures)} Strength: ${lc(a.strengths[0])}. Weakness: ${lc(a.weaknesses[0])}. Used for ${lc(a.uses.slice(0, 2).join(' and '))}.
- **${b.name}** (${kind(b)}): ${lc(b.measures)} Strength: ${lc(b.strengths[0])}. Weakness: ${lc(b.weaknesses[0])}. Used for ${lc(b.uses.slice(0, 2).join(' and '))}.
- **Contrast:** the ${lc(a.name)} ${a.gist}; the ${lc(b.name)} ${b.gist}.${sameAP ? '' : ` One emits its own energy (${a.active ? a.name : b.name}), so it works in the dark; the other only receives.`} They are complementary, which is why robots fuse them.

*Marking:* one mark per sensor for what it measures and how (active or passive), one for a fair comparison of strengths and weaknesses with an application each.`;
}

export default function Sensors() {
  const [arrange, setArrange] = useState<Arrange>('quad');
  const [picks, setPicks] = useState<string[]>(['camera', 'lidar2d']);
  const pick = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  const card = (s: Sensor) => <SensorCard key={s.id} s={s} picked={picks.includes(s.id)} onPick={() => pick(s.id)} />;
  const groups: { title: string; items: Sensor[] }[] =
    arrange === 'all'
      ? [{ title: '', items: SENSORS }]
      : arrange === 'proprio'
        ? [
            { title: 'Proprioceptive: the robot’s own state', items: SENSORS.filter((s) => s.proprio) },
            { title: 'Exteroceptive: the world around it', items: SENSORS.filter((s) => !s.proprio) },
          ]
        : arrange === 'active'
          ? [
              { title: 'Passive: only receives', items: SENSORS.filter((s) => !s.active) },
              { title: 'Active: emits and times the return', items: SENSORS.filter((s) => s.active) },
            ]
          : [
              { title: 'Proprioceptive · passive', items: SENSORS.filter((s) => s.proprio && !s.active) },
              { title: 'Proprioceptive · active', items: SENSORS.filter((s) => s.proprio && s.active) },
              { title: 'Exteroceptive · passive', items: SENSORS.filter((s) => !s.proprio && !s.active) },
              { title: 'Exteroceptive · active', items: SENSORS.filter((s) => !s.proprio && s.active) },
            ];
  const [a, b] = picks.map((id) => SENSORS.find((s) => s.id === id)!);
  return (
    <div className="vision-sim">
      <div className="vision-toolbar">
        <Segmented
          label="Arrange"
          value={arrange}
          onChange={setArrange}
          options={[
            { value: 'quad', label: '2 × 2 grid' },
            { value: 'proprio', label: 'Proprio / extero' },
            { value: 'active', label: 'Passive / active' },
            { value: 'all', label: 'All' },
          ]}
        />
        <span className="muted vision-hint">Pick two sensors with “Compare” to build the exam answer.</span>
      </div>
      <div className={`vision-sensor-groups is-${arrange}`}>
        {groups.map((g) => (
          <div key={g.title || 'all'} className="vision-sensor-group">
            {g.title && <h4>{g.title}</h4>}
            <div className="vision-sensor-grid">{g.items.map(card)}</div>
          </div>
        ))}
      </div>
      <Panel title="Compare two sensors" hint="2023 Q27 (an active sensor vs a camera), 2024 Q25 (camera vs 2-D lidar)">
        <div className="vision-compare">
          {a && b ? (
            <>
              <Rich
                text={`$$\\begin{array}{l|l|l} & \\text{${a.name.replace(/[()]/g, '')}} & \\text{${b.name.replace(/[()]/g, '')}} \\\\ \\hline \\text{senses} & \\text{${a.proprio ? 'the robot (proprioceptive)' : 'the world (exteroceptive)'}} & \\text{${b.proprio ? 'the robot (proprioceptive)' : 'the world (exteroceptive)'}} \\\\ \\text{energy} & \\text{${a.active ? 'emits (active)' : 'receives (passive)'}} & \\text{${b.active ? 'emits (active)' : 'receives (passive)'}} \\end{array}$$`}
              />
              <Rich text={compareText(a, b)} />
            </>
          ) : (
            <p className="vision-explain">Pick two sensors (the Compare buttons on the cards).</p>
          )}
        </div>
      </Panel>
      <Panel title="Fiducial markers: is one enough?" hint="2023 Q23 · planar PnP from noisy corners">
        <FiducialPanel />
      </Panel>
    </div>
  );
}
