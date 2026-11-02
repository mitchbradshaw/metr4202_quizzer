// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'vision'.
// Covers every perception MCQ of 2023–2025 (2023 Q13–Q15, 2024 Q13–Q15, 2025 Q13–Q15) plus originals; the short
// answers cover 2023 Q23, Q27, Q33(c), 2024 Q25, Q30(c, d), 2025 Q30(d) and the review deck's questions (slides 21–24).
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ perspective
  {
    id: 'vision-q-perspective-not',
    style: 'incorrect',
    stem: 'A pinhole camera photographs a scene. Which of these is NOT an effect of perspective projection on the image?',
    options: [
      {
        text: 'Angles between lines in the scene are preserved',
        correct: true,
        why: 'This is the one that does not happen: a square seen at an angle images as a general quadrilateral, so its right angles change. Dividing by depth distorts angles whenever the points involved are at different depths.',
      },
      {
        text: 'Straight lines in the scene remain straight',
        correct: false,
        why: 'This does happen: a line and the pinhole span a plane, and that plane cuts the image plane in a straight line.',
      },
      {
        text: 'Conics remain conics (a circle may image as an ellipse)',
        correct: false,
        why: 'This does happen: the projection of a conic is a conic, which is why a round wheel seen from the side looks elliptical.',
      },
      {
        text: 'Far-away objects appear smaller',
        correct: false,
        why: 'This does happen: the image height is $fh/Z$, so it shrinks as the depth $Z$ grows.',
      },
    ],
    source: 'Recurring: 2023 Q13 (2024 Q13 asks for an effect instead)',
    trapId: 'read-the-stem',
    difficulty: 1,
  },
  {
    id: 'vision-q-perspective-effect',
    style: 'correct',
    stem: 'Which of these is an effect of perspective projection?',
    options: [
      {
        text: 'Receding parallel lines meet at a vanishing point',
        correct: true,
        why: 'Dividing by depth sends every line with direction $D$ towards the same image point $(fD_x/D_z,\\ fD_y/D_z)$, so railway tracks converge. Only lines parallel to the image plane ($D_z = 0$) stay parallel.',
      },
      {
        text: 'Angles between lines in the scene are preserved',
        correct: false,
        why: 'Angles change with the viewing angle and depth: a tilted square images as a general quadrilateral.',
      },
      {
        text: 'Straight lines near the image edges bow outwards',
        correct: false,
        why: 'That is radial (barrel) distortion, a property of the lens that is modelled with the intrinsics. Perspective itself keeps straight lines straight.',
      },
      {
        text: 'Every pair of parallel lines stays parallel',
        correct: false,
        why: 'Only lines parallel to the image plane stay parallel; lines that recede from the camera converge.',
      },
    ],
    source: 'Recurring: 2024 Q13 (mirror of 2023 Q13)',
    difficulty: 1,
  },
  {
    id: 'vision-q-single-image',
    style: 'most-correct',
    stem: 'With no other information about the scene or the camera, which of these can be measured from a single camera image?',
    options: [
      {
        text: 'the relative sizes of objects in the image',
        correct: true,
        why: 'Sizes and positions in pixels can be compared directly. Everything else needs a scale: $f(kh)/(kZ) = fh/Z$, so an object twice as big and twice as far away looks identical.',
      },
      {
        text: 'the absolute size of an object',
        correct: false,
        why: 'A large, far object and a small, near one give the same image: absolute size needs the depth or a reference of known size.',
      },
      {
        text: 'the distance from the camera to each object',
        correct: false,
        why: 'Depth is exactly what one image loses. Recovering it needs a known size, a second view, a known camera height or an active range sensor.',
      },
      {
        text: 'the true angle between two edges of a box',
        correct: false,
        why: 'Perspective does not preserve angles: a box’s right-angled corner can image at almost any angle, depending on the view.',
      },
    ],
    source: 'Recurring: 2025 Q13',
    difficulty: 2,
  },
  {
    id: 'vision-q-statue',
    style: 'most-correct',
    stem: 'In one photograph, a person 1.8 m tall and a statue 3.6 m tall appear exactly the same height. Both stand upright, facing the camera. What can you conclude?',
    options: [
      {
        text: 'The statue is twice as far away',
        correct: true,
        why: 'Equal image heights mean $f h_1/Z_1 = f h_2/Z_2$, so $Z_2/Z_1 = h_2/h_1 = 3.6/1.8 = 2$. The focal length cancels in the ratio.',
      },
      {
        text: 'Nothing, because the focal length of the lens is not known',
        correct: false,
        why: 'Both objects are in the same photo, so $f$ is common and cancels: the ratio of their depths follows from the ratio of their true heights. (Their absolute depths would need $f$.)',
      },
      {
        text: 'The statue is half as far from the camera as the person',
        correct: false,
        why: 'Upside down: at half the distance, the taller statue would image four times as tall as the person.',
      },
      {
        text: 'They are both at the same distance from the camera',
        correct: false,
        why: 'At the same depth the statue would image twice as tall as the person, since $h^{\\prime} \\propto h$.',
      },
    ],
    source: 'Notes §7 (scale ambiguity); original',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ pinhole
  {
    id: 'vision-q-jwst',
    style: 'value',
    stem: 'The JWST, with a focal length of 131.4 m, photographs Saturn from about $1.2\\times10^{9}$ km away. Saturn’s rings are about 282 000 km across. Assuming a pinhole camera, how large are the rings in the image?',
    options: [
      {
        text: '0.0309 m',
        correct: true,
        why: '$h^{\\prime} = fh/Z = 131.4 \\times 2.82\\times10^{8} / 1.2\\times10^{12} = 0.0309$ m, with $h$ and $Z$ both in metres: about 3 cm of the focal plane (review deck slide 24).',
      },
      {
        text: '30.9 m',
        correct: false,
        why: 'A factor of 1000 too big: $h$ converted to metres but $Z$ left in kilometres.',
      },
      {
        text: '$3.09\\times10^{-5}$ m',
        correct: false,
        why: 'A factor of 1000 too small: $h$ left in kilometres but $Z$ converted to metres.',
      },
      {
        text: '$5.59\\times10^{5}$ m',
        correct: false,
        why: 'That is $fZ/h$, the ratio upside down. An image hundreds of kilometres across cannot fit in a telescope.',
      },
    ],
    source: 'Review deck slides 23–24',
    trapId: 'unit-scale',
    difficulty: 1,
  },
  {
    id: 'vision-q-farther',
    style: 'value',
    stem: 'A camera images an object 12 mm tall. The camera then backs away until the object is three times as far away (same lens). How tall is the image now?',
    options: [
      { text: '4 mm', correct: true, why: 'Image height is $fh/Z$: three times the depth gives a third of the height, $12/3 = 4$ mm.' },
      { text: '1.33 mm', correct: false, why: 'That is $12/9$, treating image height as $1/Z^2$. Only the image **area** falls as $1/Z^2$.' },
      { text: '36 mm', correct: false, why: 'The image shrinks with distance; it does not grow.' },
      { text: '12 mm', correct: false, why: 'The object has not changed, but its image has: perspective makes far things small.' },
    ],
    source: 'Similar to 2024 Q30(d)',
    difficulty: 1,
  },
  {
    id: 'vision-q-zoom',
    style: 'correct',
    stem: 'A camera zooms in, doubling its focal length, while the scene and the camera stay where they are. Which statement is correct?',
    options: [
      {
        text: 'Images double in height; the field of view narrows',
        correct: true,
        why: '$h^{\\prime} = fh/Z$ is proportional to $f$, and the same sensor of width $w$ now covers a smaller angle, $2\\arctan(w/2f)$.',
      },
      {
        text: 'Images double in height, and the field of view widens',
        correct: false,
        why: 'A longer lens magnifies, so the same sensor covers a **smaller** part of the scene.',
      },
      {
        text: 'Images are unchanged, since nothing has moved',
        correct: false,
        why: 'The scene is unchanged, but the image is not: the magnification $f/Z$ is set by the focal length.',
      },
      {
        text: 'Images grow four times taller, as they scale with $f^2$',
        correct: false,
        why: 'Heights scale with $f$, not $f^2$. It is the image **area** that grows four times.',
      },
    ],
    source: 'Notes §7 (pinhole model); original',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ intrinsics and extrinsics
  {
    id: 'vision-q-intrinsic',
    style: 'most-correct',
    stem: 'Which of these is one of a camera’s intrinsic parameters?',
    options: [
      {
        text: 'Its focal length',
        correct: true,
        why: 'The focal length (in pixels, $\\alpha_u = f/\\rho_w$) belongs to the lens and sensor: it stays the same however the camera is moved.',
      },
      {
        text: 'Its 3-D position in the world',
        correct: false,
        why: 'Extrinsic: position is part of $t$ in $[R \\mid t]$ and changes whenever the camera moves.',
      },
      {
        text: 'Its 3-D orientation in the world',
        correct: false,
        why: 'Extrinsic: orientation is $R$ in $[R \\mid t]$.',
      },
      {
        text: 'Its range to the object being imaged',
        correct: false,
        why: 'Range belongs to the scene, not the camera: it is neither intrinsic nor extrinsic (and it is often what you want to measure).',
      },
    ],
    source: 'Recurring: 2023 Q14',
    trapId: 'extrinsic-pose',
    difficulty: 1,
  },
  {
    id: 'vision-q-extrinsic',
    style: 'most-correct',
    stem: 'A camera’s extrinsic parameters include its:',
    options: [
      {
        text: '3-D position',
        correct: true,
        why: 'The extrinsics are the camera’s pose, $R$ and $t$: where it is and which way it points. They change whenever the camera moves.',
      },
      { text: 'focal length', correct: false, why: 'Intrinsic: it is set by the lens.' },
      { text: 'range to the target', correct: false, why: 'A property of the scene, not of the camera.' },
      {
        text: 'pixel size',
        correct: false,
        why: 'Intrinsic: it is set by the sensor, and with $f$ it gives the focal length in pixels, $\\alpha_u = f/\\rho_w$.',
      },
    ],
    source: 'Recurring: 2024 Q14',
    trapId: 'extrinsic-pose',
    difficulty: 1,
  },
  {
    id: 'vision-q-intrinsic-neither',
    style: 'most-correct',
    stem: 'A camera’s intrinsic parameters include its:',
    options: [
      {
        text: '3-D orientation in the world',
        correct: false,
        why: 'Extrinsic: orientation is $R$, which changes whenever the camera turns.',
      },
      {
        text: '3-D position in the world',
        correct: false,
        why: 'Extrinsic: position comes from $t$, which changes whenever the camera moves.',
      },
      {
        text: 'Both (a) and (b)',
        correct: false,
        why: 'Both are extrinsic: together they make up the camera’s pose $[R \\mid t]$.',
      },
      {
        text: 'Neither (a) nor (b)',
        correct: true,
        why: 'Position and orientation are both extrinsic. The intrinsics are the focal length, pixel size, principal point, skew and distortion: properties of the camera itself.',
      },
    ],
    source: 'Recurring: 2025 Q14',
    fixedOrder: true,
    trapId: 'extrinsic-pose',
    difficulty: 1,
  },
  {
    id: 'vision-q-principal',
    style: 'most-correct',
    stem: 'In the intrinsic matrix $K$, the entries $(u_0, v_0)$ are:',
    options: [
      {
        text: 'where the optical axis pierces the image',
        correct: true,
        why: 'The principal point. Pixel coordinates are counted from the top-left corner, so a point on the optical axis ($X_c = Y_c = 0$) lands at $(u_0, v_0)$, usually near the image centre.',
      },
      {
        text: 'the top-left corner pixel of the image',
        correct: false,
        why: 'That is the origin of pixel coordinates, $(0, 0)$; the principal point is offset from it by $(u_0, v_0)$.',
      },
      {
        text: 'the camera’s position, in pixels, relative to the world origin',
        correct: false,
        why: 'Position is extrinsic (it lives in $t$); $K$ holds only properties of the camera itself.',
      },
      {
        text: 'the focal lengths in pixels along $u$ and $v$',
        correct: false,
        why: 'Those are $\\alpha_u$ and $\\alpha_v$, on the diagonal of $K$.',
      },
    ],
    source: 'Review deck slide 22; notes §7',
    difficulty: 1,
  },
  {
    id: 'vision-q-alpha',
    style: 'value',
    stem: 'A lens of focal length 8 mm sits in front of a sensor whose pixels are 4 µm wide. What is $\\alpha_u$, the focal length in pixels?',
    options: [
      { text: '2000 px', correct: true, why: '$\\alpha_u = f/\\rho_w = (8\\times10^{-3}\\ \\text{m}) / (4\\times10^{-6}\\ \\text{m}) = 2000$.' },
      { text: '2 px', correct: false, why: 'That is $8/4$, treating millimetres and micrometres as the same unit.' },
      { text: '0.0005 px', correct: false, why: 'That is $\\rho_w/f$, the ratio upside down.' },
      { text: '$2\\times10^{6}$ px', correct: false, why: 'Focal length in millimetres divided by pixel width in metres: a $10^3$ unit slip.' },
    ],
    source: 'Notes §7 (intrinsics); review deck slide 22',
    trapId: 'unit-scale',
    difficulty: 2,
  },
  {
    id: 'vision-q-pipeline',
    style: 'most-correct',
    stem: 'A point is given in world coordinates. In which order is it turned into a pixel?',
    options: [
      {
        text: 'extrinsics, divide by depth, intrinsics',
        correct: true,
        why: 'The extrinsics $X_c = RX_w + t$ bring the point into the camera frame; dividing by $Z_c$ projects it; $K$ then scales to pixels and shifts to the principal point. (In homogeneous form, applying $K[R \\mid t]$ first and dividing by $\\lambda = Z_c$ last gives the same pixel.)',
      },
      {
        text: 'intrinsics, extrinsics, divide by depth',
        correct: false,
        why: '$K$ acts on image-plane coordinates, which do not exist until the point is in the camera frame.',
      },
      {
        text: 'divide by depth, extrinsics, intrinsics',
        correct: false,
        why: 'The depth to divide by is $Z_c$, the depth in the camera frame, which is only known after the extrinsics.',
      },
      {
        text: 'intrinsics, divide by depth, extrinsics',
        correct: false,
        why: 'The extrinsics map world coordinates into the camera frame, so they must come first; applied last they would act on pixels.',
      },
    ],
    source: 'Notes §7 (image formation); review deck slide 21 (world to pixel)',
    difficulty: 1,
  },
  {
    id: 'vision-q-project',
    style: 'value',
    stem: 'A camera has $\\alpha_u = \\alpha_v = 800$ px, principal point $(u_0, v_0) = (320, 240)$ px and no skew. A point is at $(X_c, Y_c, Z_c) = (0.2, -0.1, 2.0)$ m in the camera frame. Which pixel $(u, v)$ does it land on?',
    options: [
      {
        text: '(400, 200)',
        correct: true,
        why: '$u = 800 \\times 0.2/2.0 + 320 = 400$ and $v = 800 \\times (-0.1)/2.0 + 240 = 200$.',
      },
      { text: '(480, 160)', correct: false, why: 'The perspective division was skipped: $800 \\times 0.2 + 320 = 480$. Divide by $Z_c$ first.' },
      { text: '(80, −40)', correct: false, why: 'The principal point was left out: pixels are counted from the top-left corner, so add $(u_0, v_0)$.' },
      { text: '(240, 280)', correct: false, why: 'The projected offsets were subtracted from the principal point instead of added (a sign slip).' },
    ],
    source: 'Notes §7 (image formation); review deck slide 22',
    difficulty: 2,
  },
  {
    id: 'vision-q-calibration',
    style: 'incorrect',
    stem: 'About calibrating a camera with a printed checkerboard:',
    options: [
      {
        text: 'One square-on photo of the board is enough to find $K$ and the distortion',
        correct: true,
        why: 'This is the false one. Square-on, a longer focal length looks exactly like a closer board, and each view gives only 2 constraints on the 5 intrinsics. Several tilted views at different distances are needed.',
      },
      {
        text: 'The known square size fixes the scale of each view’s translation $t$',
        correct: false,
        why: 'True: without a known length, the board could be twice as big and twice as far away; the square size sets the metric scale.',
      },
      {
        text: 'Each extra photo adds six unknowns, its own $R$ and $t$',
        correct: false,
        why: 'True: the board sits at a different pose in every photo, so each view brings its own extrinsics alongside the shared intrinsics.',
      },
      {
        text: 'The parameters are refined by minimising the reprojection error',
        correct: false,
        why: 'True: nonlinear least squares adjusts $K$, the distortion and every view’s pose until the projected corners land as close as possible to the detected ones.',
      },
    ],
    source: 'Notes §7 (calibration); review deck slides 21–22',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ sensors
  {
    id: 'vision-q-passive',
    style: 'most-correct',
    stem: 'Which of these sensors is both exteroceptive and passive?',
    options: [
      { text: 'an RGB camera', correct: true, why: 'It measures the world (exteroceptive) and only collects ambient light (passive).' },
      { text: 'a 2-D lidar', correct: false, why: 'Exteroceptive but active: it emits laser pulses and times their return.' },
      { text: 'an ultrasonic sonar', correct: false, why: 'Exteroceptive but active: it emits a ping and listens for the echo.' },
      { text: 'a wheel encoder', correct: false, why: 'Proprioceptive: it measures the robot’s own wheel rotation, not the world.' },
    ],
    source: 'Notes §7 (sensors); review deck slide 21; original',
    difficulty: 1,
  },
  {
    id: 'vision-q-lidar-camera',
    style: 'incorrect',
    stem: 'Comparing an optical camera with a 2-D lidar scanner:',
    options: [
      {
        text: 'The camera measures range directly, while the lidar only gives bearings',
        correct: true,
        why: 'This is the false one, the wrong way round: the lidar times its own laser pulse, so it measures range and bearing directly; a single camera gives bearings and appearance but no direct depth.',
      },
      {
        text: 'The lidar works in complete darkness because it supplies its own light',
        correct: false,
        why: 'True: it is an active sensor.',
      },
      {
        text: 'A 2-D lidar can miss a table top that lies above its scan plane',
        correct: false,
        why: 'True: it sees only one horizontal slice of the world.',
      },
      {
        text: 'The camera’s colour and texture make it better for recognising objects',
        correct: false,
        why: 'True: a lidar’s sparse range points carry no colour, so recognition is the camera’s job.',
      },
    ],
    source: 'Similar to 2023 Q27 and 2024 Q25 (short answers)',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ visual servoing
  {
    id: 'vision-q-ibvs-name',
    style: 'most-correct',
    stem: 'A camera is mounted on a robot arm’s gripper (eye-in-hand). The arm is driven so that the features in the camera image move to where they appear in a stored reference image. This is called:',
    options: [
      {
        text: 'image-based visual servoing',
        correct: true,
        why: 'The error is defined directly on image features (their pixel positions against the reference view), and the arm moves to shrink it: IBVS.',
      },
      {
        text: 'position-based visual servoing',
        correct: false,
        why: 'PBVS would first estimate the target’s 3-D pose and control the pose error; here the goal is stated in the image itself.',
      },
      {
        text: 'feature extraction',
        correct: false,
        why: 'Feature extraction finds the corners or blobs in each image. It is one step inside the loop, not the control scheme.',
      },
      {
        text: 'motion planning',
        correct: false,
        why: 'Motion planning searches a map for a collision-free path in advance; visual servoing is feedback control from each new image.',
      },
    ],
    source: 'Recurring: 2023 Q15',
    difficulty: 1,
  },
  {
    id: 'vision-q-pbvs-needs',
    style: 'most-correct',
    stem: 'Position-based visual servoing requires:',
    options: [
      {
        text: 'a known camera-to-end-effector transform',
        correct: true,
        why: 'PBVS estimates the target’s pose in the camera frame and must turn that pose error into an end-effector motion, which needs the hand–eye transform. Any error in it shifts the final pose directly.',
      },
      {
        text: 'a motion planner',
        correct: false,
        why: 'Servoing is feedback control from images; no path search is involved.',
      },
      {
        text: 'two or more cameras',
        correct: false,
        why: 'One calibrated camera and a model of the target (such as a marker of known size) are enough to estimate its pose (PnP).',
      },
      {
        text: 'an eye-in-hand set-up',
        correct: false,
        why: 'PBVS also works eye-to-hand, with a fixed camera watching the arm; what it needs is the known transform, not a particular mounting.',
      },
    ],
    source: 'Recurring: 2024 Q15 (2025 Q15 asks the same about IBVS)',
    difficulty: 2,
  },
  {
    id: 'vision-q-ibvs-needs',
    style: 'most-correct',
    stem: 'Image-based visual servoing requires:',
    options: [
      {
        text: 'a camera-to-end-effector transform that stays fixed',
        correct: true,
        why: 'IBVS measures its error in the image, where the goal is also defined, so a rough estimate of the hand–eye transform still converges to the right view. What it cannot tolerate is the camera shifting on its mount during the motion.',
      },
      {
        text: 'a camera-to-end-effector transform that is known accurately',
        correct: false,
        why: 'That is PBVS’s requirement (2024 Q15). IBVS tolerates calibration error: a wrong transform bends the path, not the final view.',
      },
      {
        text: 'two or more cameras',
        correct: false,
        why: 'One camera is the usual set-up. IBVS needs a depth estimate for each feature, not stereo.',
      },
      {
        text: 'fiducial markers on the target',
        correct: false,
        why: 'Any features that can be tracked will do (corners, blobs, edges); markers just make detection easy.',
      },
    ],
    source: 'Recurring: 2025 Q15 (contrast with 2024 Q15)',
    trapId: 'read-the-stem',
    difficulty: 3,
  },
  {
    id: 'vision-q-servo-false',
    style: 'incorrect',
    stem: 'About position-based (PBVS) and image-based (IBVS) visual servoing:',
    options: [
      {
        text: 'IBVS must first estimate the target’s 3-D pose from each image',
        correct: true,
        why: 'This is the false one: estimating the pose is PBVS. IBVS works directly on feature positions in the image; it needs only a rough depth for each feature, for its image Jacobian.',
      },
      {
        text: 'PBVS moves in a straight 3-D line but can lose the target from view',
        correct: false,
        why: 'True: it controls the pose with no regard for where the features are in the image.',
      },
      {
        text: 'IBVS converges despite moderate calibration errors',
        correct: false,
        why: 'True: the error is measured in the image, where the goal is also defined, so calibration errors bend the path but do not move the end point.',
      },
      {
        text: 'IBVS needs an estimate of each feature’s depth',
        correct: false,
        why: 'True: the image Jacobian has $1/Z$ terms, because a sideways camera motion moves near points across the image faster than far ones.',
      },
    ],
    source: 'Review deck slide 22; notes §7 (visual servoing)',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ fiducials
  {
    id: 'vision-q-markers',
    style: 'most-correct',
    stem: 'A robot’s calibrated camera can detect square fiducial markers whose poses in the map and sizes are known. In theory, how many markers must it observe to localise itself?',
    options: [
      {
        text: 'One, since its four corners fix all six pose parameters',
        correct: true,
        why: 'Each corner gives a pixel $(u, v)$, two equations; four corners give 8 equations for the 6 unknowns of the camera pose (PnP). The marker’s known size supplies the scale.',
      },
      {
        text: 'Two, since a single image cannot recover depth',
        correct: false,
        why: 'In general one image cannot, but a marker of known size can: how big it looks gives its distance.',
      },
      {
        text: 'Three, to triangulate its position from their centres',
        correct: false,
        why: 'Triangulation is for beacons that give only a bearing or a range. A marker’s four corners carry far more than its centre.',
      },
      {
        text: 'Six, one marker for each degree of freedom of the pose',
        correct: false,
        why: 'One marker already supplies 8 equations, more than the 6 unknowns.',
      },
    ],
    source: 'Similar to 2023 Q23 (short answer)',
    difficulty: 2,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'vision-g-params',
    title: 'Intrinsic, extrinsic or neither?',
    prompt: 'Calibration solves for two kinds of camera parameter (review deck slide 22). Sort each quantity: does it describe the camera itself (**intrinsic**), where the camera is (**extrinsic**), or is it not a camera parameter at all?',
    buckets: [
      { id: 'intrinsic', label: 'Intrinsic (inside the camera: $K$ and distortion)' },
      { id: 'extrinsic', label: 'Extrinsic (the camera’s pose: $R$ and $t$)' },
      { id: 'neither', label: 'Neither (a property of the scene)' },
    ],
    items: [
      { id: 'i1', text: 'Focal length $f$', bucket: 'intrinsic', why: 'Set by the lens; it does not change when the camera moves (2023 Q14).' },
      { id: 'i2', text: 'Pixel width and height $\\rho_w$, $\\rho_h$', bucket: 'intrinsic', why: 'Set by the sensor; with $f$ they give the focal length in pixels, $\\alpha_u = f/\\rho_w$ (pixel size is a distractor in 2024 Q14).' },
      { id: 'i3', text: 'Principal point $(u_0, v_0)$', bucket: 'intrinsic', why: 'Where the optical axis meets the sensor: fixed by how the lens sits over the sensor.' },
      { id: 'i4', text: 'Skew $s$ between the pixel axes', bucket: 'intrinsic', why: 'A property of the sensor’s pixel grid (0 when the axes are perpendicular).' },
      { id: 'i5', text: 'Radial distortion coefficients $k_1$, $k_2$', bucket: 'intrinsic', why: 'They describe how the lens bends rays, so they are estimated with $K$ during calibration.' },
      { id: 'e1', text: 'The camera’s 3-D position in the world', bucket: 'extrinsic', why: 'Where the camera is: part of $t$ (the key of 2024 Q14).' },
      { id: 'e2', text: 'The camera’s 3-D orientation', bucket: 'extrinsic', why: 'Which way it points: $R$. With position, the reason 2025 Q14’s answer is “Neither”.' },
      { id: 'e3', text: 'The transform from a gripper to the camera mounted on it', bucket: 'extrinsic', why: 'The camera’s pose relative to the robot, found by hand–eye calibration; PBVS needs it known (2024 Q15).' },
      { id: 'e4', text: 'The tilt angle of a camera on a pan–tilt head', bucket: 'extrinsic', why: 'Tilting changes which way the camera points, i.e. $R$; the lens is untouched.' },
      { id: 'n1', text: 'The range from the camera to the object', bucket: 'neither', why: 'A property of the scene (and often the unknown you want), not of the camera: the distractor in 2023 Q14 and 2024 Q14.' },
      { id: 'n2', text: 'The true height of the object being photographed', bucket: 'neither', why: 'The $h$ of the pinhole equation belongs to the object, not to the camera.' },
    ],
    source: 'Notes §7; 2023 Q14, 2024 Q14, 2025 Q14; review deck slide 22',
  },
  {
    kind: 'sort',
    id: 'vision-g-sensors',
    title: 'Proprioceptive, active or passive?',
    prompt: '**Proprioceptive** sensors measure the robot’s own state. **Exteroceptive** sensors measure the world: they are **active** if they emit their own energy and measure what comes back, **passive** if they only receive what is already there. Sort each sensor.',
    buckets: [
      { id: 'proprio', label: 'Proprioceptive (the robot’s own state)' },
      { id: 'active', label: 'Exteroceptive and active (emits, measures the return)' },
      { id: 'passive', label: 'Exteroceptive and passive (only receives)' },
    ],
    items: [
      { id: 'p1', text: 'Wheel encoder', bucket: 'proprio', why: 'Counts the robot’s own wheel rotation: the input to odometry and the prediction step.' },
      { id: 'p2', text: 'Joint encoder on an arm', bucket: 'proprio', why: 'Measures the arm’s own joint angle, which forward kinematics turns into the end-effector pose.' },
      { id: 'p3', text: 'IMU (accelerometer and gyroscope)', bucket: 'proprio', why: 'Measures the robot’s own acceleration and rotation rate; integrating them drifts.' },
      { id: 'p4', text: 'Motor current sensor', bucket: 'proprio', why: 'Measures the robot’s internal state (how much torque each motor is producing).' },
      { id: 'a1', text: '2-D lidar', bucket: 'active', why: 'Emits laser pulses and times their return: range and bearing, even in the dark.' },
      { id: 'a2', text: 'Ultrasonic sonar', bucket: 'active', why: 'Emits a ping and times the echo; cheap, but with a wide beam and specular reflections.' },
      { id: 'a3', text: 'Time-of-flight depth camera', bucket: 'active', why: 'Emits its own infrared light, which is how it measures depth per pixel, and why strong sunlight swamps it.' },
      { id: 'a4', text: 'Radar', bucket: 'active', why: 'Emits radio waves and measures the echo; it sees through fog and rain.' },
      { id: 's1', text: 'RGB camera', bucket: 'passive', why: 'Collects ambient light only: “optical cameras are passive sensors” (2023 Q27).' },
      { id: 's2', text: 'Thermal (infrared) camera', bucket: 'passive', why: 'Receives the heat radiation that objects give off; it emits nothing.' },
      { id: 's3', text: 'Bumper contact switch', bucket: 'passive', why: 'Closes when the robot touches something: it senses the world and emits nothing.' },
      { id: 's4', text: 'Microphone', bucket: 'passive', why: 'Only listens to sound that is already there, unlike a sonar, which makes its own.' },
    ],
    source: 'Notes §7 (sensors); review deck slide 21; 2023 Q27',
  },
  {
    kind: 'match',
    id: 'vision-g-servo',
    title: 'What does each scheme need?',
    prompt: 'Match each visual-servoing scheme or set-up (and the two vision steps they rely on) to what it needs.',
    pairs: [
      {
        id: 'm1',
        left: 'Position-based visual servoing (PBVS)',
        right: 'The target’s estimated 3-D pose and a known camera-to-end-effector transform',
        why: 'PBVS controls a 3-D pose error: it estimates the target pose (needing $K$ and a model of the target) and maps the error into end-effector motion through the hand–eye transform (2024 Q15).',
      },
      {
        id: 'm2',
        left: 'Image-based visual servoing (IBVS)',
        right: 'Desired feature positions, and an image Jacobian with a depth estimate per feature',
        why: 'IBVS drives $s - s^{*}$ to zero through $L_s$, which contains $1/Z$. The camera mount must stay fixed but need not be known precisely (2025 Q15).',
      },
      {
        id: 'm3',
        left: 'Eye-in-hand set-up',
        right: 'A camera rigidly mounted on the end-effector, so its view moves with the arm',
        why: 'The set-up of 2023 Q15: the camera rides on the gripper.',
      },
      {
        id: 'm4',
        left: 'Eye-to-hand set-up',
        right: 'A fixed camera that can see both the gripper and the target',
        why: 'The camera stays put and watches the arm; servoing drives the gripper’s image features towards the target’s.',
      },
      {
        id: 'm5',
        left: 'Pose of a target from one square marker (PnP)',
        right: 'Calibrated intrinsics $K$, the marker’s side length and its four detected corners',
        why: 'Eight pixel equations for six pose unknowns; the side length fixes the scale (2023 Q23).',
      },
      {
        id: 'm6',
        left: 'Camera calibration',
        right: 'Many views of a known pattern, solved by minimising the reprojection error',
        why: 'A checkerboard at many tilted poses gives the corner correspondences that pin down $K$, the distortion and each view’s pose (review deck slide 22).',
      },
    ],
    source: 'Notes §7; 2023 Q15, 2024 Q15, 2025 Q15, 2023 Q23; review deck slide 22',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'vision-sa-active-sensor',
    prompt: '**(3 marks)** Optical cameras are passive sensors. In no more than 120 words: name an active sensor used in robotics, and compare its function and use cases with those of an optical camera.',
    wordLimit: 120,
    model: 'Active sensor: a **lidar** (laser range finder). It emits laser pulses and times their reflection, $r = c\\Delta t/2$, so it measures range and bearing directly, works in the dark and gives accurate metric geometry. Its data are sparse and colourless, and it is costly. Uses: occupancy mapping, SLAM, localisation, obstacle detection, safety scanners.\n\nAn optical **camera** is passive: it records ambient light intensity and colour over a dense pixel grid, giving a bearing per pixel but no direct depth. It is cheap and rich in texture and semantics, but depends on lighting. Uses: object recognition, reading fiducials and signs, lane following, visual servoing.\n\nThey are complementary: the lidar says **where** surfaces are; the camera says **what** they are.',
    keyPoints: [
      'names a valid active sensor (lidar, sonar, radar, depth camera) and why it is active: it emits and times the return',
      'lidar: accurate range and bearing, works in the dark; but sparse, no colour, costly',
      'camera: dense colour and texture, bearings but no direct depth, cheap, lighting-dependent',
      'an application for each that uses its strength',
      'a direct contrast: where surfaces are vs what things are (complementary)',
    ],
    source: 'Similar to 2023 Q27',
    marks: 3,
  },
  {
    id: 'vision-sa-camera-lidar',
    prompt: '**(3 marks)** In no more than 120 words: compare optical cameras with 2-D lidar scanners in terms of the data they collect and the applications each suits.',
    wordLimit: 120,
    model: '**Data.** A camera is passive: it records a dense 2-D grid of light intensity and colour, i.e. the bearing of each pixel’s scene point but no direct depth. It is high-resolution, cheap and rich in texture and semantics, but sensitive to lighting. A 2-D lidar is active: it sweeps a laser in a single plane and returns sparse but accurate range and bearing points. It works in the dark, carries no colour, and sees only that one slice.\n\n**Applications.** Camera: object recognition, reading fiducials and signs, lane following, visual servoing. 2-D lidar: occupancy-grid mapping and SLAM, indoor localisation, obstacle avoidance, safety scanners.\n\nIn short, the camera tells you what things are; the lidar tells you precisely where surfaces are, in one plane.',
    keyPoints: [
      'camera data: dense intensity and colour image, bearings only (no direct depth), passive, lighting-dependent',
      '2-D lidar data: sparse but accurate metric range and bearing, active, works in the dark, one plane only, no colour',
      'camera applications: recognition, fiducials and signs, lane following, visual servoing',
      'lidar applications: 2-D mapping and SLAM, localisation, obstacle avoidance, safety scanning',
      'the contrast in one line: what things are vs where surfaces are',
    ],
    source: 'Similar to 2024 Q25',
    marks: 3,
  },
  {
    id: 'vision-sa-markers',
    prompt: '**(2 marks)** A robot works in a building fitted with fiducial markers (such as ArUco markers or AprilTags) whose poses and sizes are known. In no more than 80 words: in theory, how many markers must it observe to localise itself, and why might it be a good idea to observe more?',
    wordLimit: 80,
    model: 'In theory **one**. With the marker’s pose and size known (and the camera calibrated), its four detected corners give eight pixel equations for the six unknowns of the camera pose, a perspective-n-point (PnP) problem; chaining with the marker’s known pose gives the robot’s pose.\n\nMore markers help because every detection is noisy (errors average out), one small or distant marker can be ambiguous in tilt, spread-out markers constrain the pose better, and redundancy survives occlusion or a misread marker.',
    keyPoints: [
      'one marker, in theory',
      'its four corners (of known size) fix the full 6-DOF pose: PnP, 8 equations for 6 unknowns',
      'more markers: noise averages out, and a wider spread conditions the pose better',
      'more markers: resolve a single marker’s pose ambiguity, and redundancy against occlusion or misdetection',
    ],
    source: 'Similar to 2023 Q23',
    marks: 2,
  },
  {
    id: 'vision-sa-servoing',
    prompt: '**(3 marks)** In no more than 120 words: describe the difference between position-based (PBVS) and image-based (IBVS) visual servoing, including what each needs and one consequence of the difference.',
    wordLimit: 120,
    model: 'Both close a control loop through the camera, moving the robot to drive an error to zero.\n\n**PBVS** estimates the target’s 3-D pose from the image (needing calibrated intrinsics and a model of the target) and controls the pose error in Cartesian space. It needs accurate calibration, including a known camera-to-end-effector transform. Its 3-D path is straight, but the target can leave the field of view, and calibration errors shift the final pose.\n\n**IBVS** defines the error directly on image features, $e = s - s^{*}$, and maps it to a camera velocity through the image Jacobian, which needs a depth estimate for each feature. It is robust to calibration error and keeps the features in view, but its 3-D path can be odd (it may retreat during large rotations).',
    keyPoints: [
      'PBVS: the error is the target’s 3-D pose, estimated from the image and controlled in Cartesian space',
      'PBVS needs accurate calibration, including a known camera-to-end-effector transform; straight 3-D path, but the target can leave the view',
      'IBVS: the error is defined directly on image features ($s - s^{*}$), through the image Jacobian',
      'IBVS needs a depth estimate; robust to calibration error and keeps features in view, but odd 3-D paths',
    ],
    source: 'Review deck slide 22; notes §7',
    marks: 3,
  },
  {
    id: 'vision-sa-calibration',
    prompt: '**(3 marks)** In no more than 130 words: explain the purpose of camera calibration, describe the process, and state which parameters it solves for.',
    wordLimit: 130,
    model: '**Purpose.** To find the camera’s intrinsic parameters (and lens distortion) so that pixels can be turned into rays and metric measurements: pose estimation from markers, measuring with the pinhole model, undistorting images, visual servoing.\n\n**Parameters.** Intrinsics: the focal length in pixels $\\alpha_u$, $\\alpha_v$, the principal point $(u_0, v_0)$, the skew and the distortion coefficients. Extrinsics: the rotation $R$ and translation $t$ of the camera relative to the pattern, one set per image.\n\n**Process.** Photograph a checkerboard of known square size at many poses (tilted, at several distances, covering the whole image) and detect its corners. Compute an initial estimate from the board-to-image homographies, then refine every parameter by nonlinear least squares, minimising the reprojection error between the detected corners and those the model predicts.',
    keyPoints: [
      'purpose: turn pixels into metric rays and measurements (pose estimation, measurement, undistortion, servoing)',
      'intrinsics solved for: $\\alpha_u$, $\\alpha_v$ (focal length over pixel size), principal point, skew, distortion',
      'extrinsics: $R$ and $t$ of each view',
      'process: a known pattern (checkerboard) at many poses; detect its corners',
      'minimise the reprojection error (closed-form first guess, then nonlinear least squares)',
    ],
    source: 'Review deck slides 21–22 (learning outcome and practice question); notes §7',
    marks: 3,
  },
  {
    id: 'vision-sa-world-pixel',
    prompt: '**(3 marks)** In no more than 110 words: describe how a point with known world coordinates is mapped to pixel coordinates in an image. Name the parameters used at each step.',
    wordLimit: 110,
    model: '1. **Extrinsics** (the camera’s pose, $R$ and $t$): transform the point into the camera frame, $X_c = RX_w + t$.\n2. **Perspective projection**: divide by the depth along the optical axis, $x = X_c/Z_c$ and $y = Y_c/Z_c$. This is where far objects shrink and depth is lost.\n3. **Intrinsics** $K$: scale by the focal length in pixels and shift to the principal point, $u = \\alpha_u x + u_0$ and $v = \\alpha_v y + v_0$ (plus skew and lens distortion, if modelled).\n\nIn one line: $\\lambda\\,(u, v, 1)^T = K\\,[R \\mid t]\\,(X_w, Y_w, Z_w, 1)^T$, with $\\lambda = Z_c$.',
    keyPoints: [
      'extrinsics $R$, $t$ take world coordinates into the camera frame',
      'perspective division by the depth $Z_c$',
      'intrinsics $K$: focal length in pixels and principal point (with skew and distortion) give pixel coordinates',
      'the compact form $\\lambda (u, v, 1)^T = K[R \\mid t](X_w, 1)^T$',
    ],
    source: 'Review deck slide 21 (learning outcome) and slide 22; notes §7',
    marks: 3,
  },
  {
    id: 'vision-sa-jwst',
    prompt: '**(2 marks)** The James Webb Space Telescope photographed Saturn when it was about 1.2 billion km from Earth. Saturn’s rings are about 282 000 km across, and the telescope’s focal length is 131.4 m. How large do the rings appear in the image? State your assumptions.',
    wordLimit: 60,
    model: 'Assuming an ideal pinhole camera, with the image in focus and the rings’ full diameter lying across the line of sight:\n\n$$h^{\\prime} = \\frac{f h}{Z} = \\frac{131.4 \\times 2.82\\times10^{8}}{1.2\\times10^{12}} = 0.0309\\ \\text{m} \\approx \\textbf{30.9 mm}$$\n\n($h$ and $Z$ are both converted to metres: only their ratio matters.)',
    keyPoints: [
      'the pinhole model $h^{\\prime} = fh/Z$',
      'consistent units: $h = 2.82\\times10^{8}$ m and $Z = 1.2\\times10^{12}$ m',
      '$h^{\\prime} \\approx 0.0309$ m, about 3 cm',
      'an assumption stated (ideal pinhole, rings across the line of sight, in focus)',
    ],
    source: 'Review deck slides 23–24',
    marks: 2,
  },
  {
    id: 'vision-sa-person',
    prompt: '**(3 marks)** A camera at the end-effector frame {b} of an arm sits at $p = (0.3, -0.5, 1.2)$ m in {s} and looks along $\\hat z_b = +\\hat x_s$. A person 1.8 m tall stands upright at $(6.3, -0.5, 0)$ m. The camera’s focal length is 40 mm. Assuming the person is in focus and entirely in the image, how tall are they in the image plane? List any additional assumptions you make.',
    wordLimit: 80,
    model: 'The camera looks along $+\\hat x_s$ and the person has the same $y$, so they are straight ahead. The depth is measured **from the camera** along the optical axis: $Z = 6.3 - 0.3 = 6.0$ m (using 6.3 m, from the base, would give 11.4 mm).\n\n$$h^{\\prime} = \\frac{fh}{Z} = \\frac{0.040 \\times 1.8}{6.0} = 0.012\\ \\text{m} = \\textbf{12 mm}$$\n\nAssumptions: ideal pinhole camera with no lens distortion; optical axis along $\\hat z_b$; the person stands upright in a plane perpendicular to the optical axis, so their whole body is at depth 6.0 m.',
    keyPoints: [
      'camera position and viewing direction from {b}: $p = (0.3, -0.5, 1.2)$ m, looking along $+\\hat x_s$',
      'depth from the camera: $Z = 6.3 - 0.3 = 6.0$ m',
      '$h^{\\prime} = 0.040 \\times 1.8 / 6.0 = 0.012$ m = 12 mm (lengths in metres)',
      'assumptions: ideal pinhole, no distortion, person perpendicular to the optical axis at one depth',
    ],
    source: 'Similar to 2023 Q33(c)',
    marks: 3,
  },
  {
    id: 'vision-sa-distance',
    prompt: '**(3 + 2 marks)** A camera boom holds its camera 2.0 m in front of the boom’s base, looking straight ahead along the boom, away from the base. Through a 35 mm lens, a 30 m tall lighthouse appears 25 mm tall in the image. (c) How far is the base of the boom from the lighthouse? List any assumptions you make. (d) The camera is then moved 12 m closer to the lighthouse. How tall does the lighthouse appear now?',
    wordLimit: 110,
    model: '(c) Pinhole: $Z = \\dfrac{fh}{h^{\\prime}} = \\dfrac{0.035 \\times 30}{0.025} = 42$ m from the **camera**. The camera is 2.0 m in front of the base along the line of sight, so the base is $42 + 2.0 =$ **44 m** from the lighthouse. Assumptions: ideal pinhole with no distortion; the lighthouse in focus, centred on and perpendicular to the optical axis; any sideways or height offset of the camera negligible at this range.\n\n(d) $Z^{\\prime} = 42 - 12 = 30$ m, so $h^{\\prime\\prime} = \\dfrac{0.035 \\times 30}{30} = 0.035$ m = **35 mm**. Check: image size goes as $1/Z$, and $25 \\times 42/30 = 35$ mm.',
    keyPoints: [
      '$Z = fh/h^{\\prime} = 0.035 \\times 30 / 0.025 = 42$ m, measured from the camera',
      'base distance $= 42 + 2.0 = 44$ m (the camera is in front of the base, looking away from it)',
      'assumptions: ideal pinhole, lighthouse centred on and perpendicular to the optical axis, offsets negligible',
      '(d) new depth 30 m, so $h^{\\prime\\prime} = 35$ mm (inverse-proportion check: $25 \\times 42/30$)',
    ],
    source: 'Similar to 2024 Q30(c) and (d)',
    marks: 5,
  },
  {
    id: 'vision-sa-focal',
    prompt: '**(3 marks)** An inspection camera with an adjustable focal length photographs a valve 1.5 m away along its optical axis. The valve is 0.24 m tall and its image is 9.6 mm tall. Compute the focal length used, and list any assumptions you make.',
    wordLimit: 80,
    model: 'Pinhole: $h^{\\prime} = fh/Z$, so\n\n$$f = \\frac{h^{\\prime} Z}{h} = \\frac{0.0096 \\times 1.5}{0.24} = 0.060\\ \\text{m} = \\textbf{60 mm}$$\n\nAssumptions: ideal pinhole with no lens distortion and the image in focus (the image distance is then about $f$, since $Z \\gg f$); the camera points straight at the valve, whose face is perpendicular to the optical axis at a single depth of 1.5 m.',
    keyPoints: [
      'the rearranged pinhole equation $f = h^{\\prime}Z/h$',
      'consistent units: $0.0096 \\times 1.5 / 0.24$',
      '$f = 0.060$ m = 60 mm',
      'assumptions: ideal pinhole, in focus, valve perpendicular to the optical axis at one depth',
    ],
    source: 'Similar to 2025 Q30(d)',
    marks: 3,
  },
];
