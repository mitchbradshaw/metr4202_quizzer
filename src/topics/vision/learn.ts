// Concept cards and flashcards for 'vision' (summary notes §7; 2023 Q13–Q15, Q23, Q27, Q33(c); 2024 Q13–Q15, Q25,
// Q30(c, d); 2025 Q13–Q15, Q30(d); review deck slides 21–24). Card ids are fixed: sims, generators and Home link to them.
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ sensors
  {
    id: 'vision-sensors',
    title: 'Robot sensors: what each measures, and the 3-mark comparison',
    lecture: 'Notes §7 (sensors); review deck slide 21; 2023 Q27; 2024 Q25',
    formulas: [
      '$$\\begin{array}{l|l|c|c} \\text{sensor} & \\text{what it measures} & \\text{energy} & \\text{about} \\\\ \\hline \\text{optical camera} & \\text{light intensity and colour per pixel (a bearing each)} & \\text{passive} & \\text{the world} \\\\ \\text{2-D or 3-D lidar} & \\text{range and bearing, by laser time of flight} & \\text{active} & \\text{the world} \\\\ \\text{sonar} & \\text{range, by ultrasound time of flight} & \\text{active} & \\text{the world} \\\\ \\text{depth camera} & \\text{range per pixel, from its own infrared light} & \\text{active} & \\text{the world} \\\\ \\text{wheel or joint encoder} & \\text{rotation of a wheel or joint} & \\text{--} & \\text{itself} \\\\ \\text{IMU} & \\text{acceleration and rotation rate} & \\text{--} & \\text{itself} \\end{array}$$',
      '$$r = \\frac{c\\,\\Delta t}{2} \\qquad \\text{(an active sensor times its own pulse out and back; } c = 3\\times10^{8}\\ \\text{m/s for lidar, about } 343\\ \\text{m/s for sonar)}$$',
      '$$\\begin{array}{l|l|l} & \\text{strengths} & \\text{weaknesses} \\\\ \\hline \\text{camera} & \\text{cheap; colour, texture, semantics} & \\text{no direct depth; needs light} \\\\ \\text{lidar} & \\text{accurate range; works in the dark} & \\text{sparse, no colour, costly; 2-D sees one plane} \\\\ \\text{sonar} & \\text{very cheap} & \\text{wide beam; specular reflections} \\\\ \\text{IMU, encoders} & \\text{high rate; need nothing outside} & \\text{drift accumulates} \\end{array}$$',
      '$$\\begin{array}{l|l} & \\text{typical use} \\\\ \\hline \\text{camera} & \\text{recognition, fiducials and signs, visual servoing} \\\\ \\text{lidar} & \\text{occupancy maps, SLAM, localisation, obstacle detection} \\\\ \\text{sonar} & \\text{close-range obstacle sensing} \\\\ \\text{IMU, encoders} & \\text{odometry, the prediction step} \\end{array}$$',
    ],
    what: 'Every sensor sits on two axes. **Proprioceptive** sensors measure the robot’s own state (wheel and joint encoders, an IMU); **exteroceptive** sensors measure the world around it (camera, lidar, sonar, GPS). **Passive** sensors only receive energy that is already there (a camera collects ambient light); **active** sensors emit their own energy and measure what comes back (lidar, sonar, radar, depth cameras).\n\nEmitting is what lets an active sensor time its own pulse, so it measures **range** directly and works in the dark. A passive camera instead gets a dense image of **bearings and appearance**, with no direct depth. Hence the one-line contrast that scores well in the comparison questions: a camera tells you *what* things are; a lidar tells you *where* surfaces are.',
    when: '- “Optical cameras are passive sensors. Identify an active sensor and compare its function and use cases to an optical camera” (2023 Q27, 3 marks).\n- “Compare optical cameras to 2D lidar scanners in terms of the data they collect and their application areas” (2024 Q25, 3 marks).\n- “Identify different robot sensing modalities” (review deck slide 21), and MCQs or sorts that ask which sensors are active, passive, proprioceptive or exteroceptive.',
    how: [
      'Classify each sensor first: active or passive (does it emit?), proprioceptive or exteroceptive (does it measure the robot or the world?). One phrase each, and it is usually the first mark.',
      'Say what each measures and how: the camera records light intensity and colour on a dense pixel grid (a bearing per pixel, no depth); the lidar emits laser pulses and times the echo, $r = c\\Delta t/2$, giving accurate range and bearing points in one plane (2-D) or many (3-D).',
      'Give one strength and one weakness each, and tie them to how the sensor works: the camera is cheap and rich in texture and meaning but needs light and cannot see depth; the lidar is metric and works in the dark but is sparse, colourless and costly, and a 2-D lidar sees a single slice.',
      'Give an application each that uses the strength: camera for object recognition, reading fiducials and signs, lane following, visual servoing; lidar for occupancy-grid mapping, SLAM, localisation, obstacle avoidance and safety scanners.',
      'Finish with the contrast in one line (“what” versus “where”) and say they are complementary, which is why many robots fuse both.',
    ],
    traps: [
      {
        title: 'Calling a camera active',
        detail: 'An ordinary camera emits nothing: it collects ambient light. Depth cameras (structured light, time of flight) are active because they project their own infrared light; that is also why they struggle in sunlight.',
        source: '2023 Q27',
      },
      {
        title: 'Saying a single camera measures distance',
        detail: 'One image gives bearings and appearance. Depth needs extra information: a known object size, a second view, or an active sensor. A lidar measures range directly.',
        source: 'Notes §7; 2025 Q13',
      },
      {
        title: 'Two descriptions instead of a comparison',
        detail: 'The marks are for contrasts on the same points (what it measures, active or passive, strength, weakness, use). Describing each sensor separately and never comparing them leaves marks behind.',
        source: 'Notes §7 (how to answer the 3-mark question)',
      },
      {
        title: 'Forgetting that a 2-D lidar sees one plane',
        detail: 'It scans one horizontal slice, so a table top above the plane or a drop below it is invisible. Say so when you list its weaknesses.',
        source: '2024 Q25 solution',
      },
      {
        title: 'Treating encoders and IMUs as position sensors',
        detail: 'They measure increments and rates. Integrating them gives a position whose error grows without bound (drift), which is why they drive the prediction step and need exteroceptive corrections.',
        source: 'Notes §7 (sensor table)',
      },
    ],
    more: '**Why the strengths follow from the physics.** A lidar knows when its pulse left and when it came back, so range is a stopwatch reading ($r = c\\Delta t/2$; 66.7 ns means 10 m). A camera only knows which direction light arrived from, so every pixel is a bearing; depth has to be inferred. A sonar’s ping travels at 343 m/s, so the echo from a wall 10 m away takes about 58 ms: it is slow, and its wide cone (roughly 20–30°) blurs bearings. Smooth walls hit at a shallow angle reflect the ping away (specular reflection), so it reads maximum range.\n\n**Other sensors worth one line each.** Radar: active, sees through fog and rain, coarse resolution. Depth camera (structured light or time of flight): active, dense depth indoors, fails in sunlight and on black or shiny surfaces. GPS: exteroceptive position outdoors, metres of error, multipath between tall buildings, nothing indoors. Interference: two active sensors of the same kind can hear each other’s pulses (crosstalk); passive sensors cannot interfere.\n\n**A full-mark answer (2024 Q25 style).** Camera: passive; a dense 2-D grid of light intensity and colour, i.e. a bearing per pixel but no direct depth; cheap, high resolution, rich in texture and semantics, sensitive to lighting; used for recognition, fiducials, signs, lane following, visual servoing. 2-D lidar: active; sweeps a laser in one plane and returns accurate range and bearing points; sparse, colourless, works in the dark, sees only one slice; used for 2-D occupancy mapping, SLAM, indoor localisation, obstacle avoidance and safety scanners. In short: the camera tells you what things are, the lidar precisely where surfaces are.\n\n**Where sensors meet the rest of the course.** Exteroceptive readings drive the correction step $p(z \\mid x)$ (the beam model for range sensors, notes §3); proprioceptive ones drive the prediction step through the motion model.',
    exploreIds: ['sensors', 'models/beam'],
  },

  // ------------------------------------------------------------------ pinhole
  {
    id: 'vision-pinhole',
    title: 'The pinhole model: h′ = f h / Z',
    lecture: 'Notes §7 (pinhole calculations); review deck slides 23–24; 2023 Q33(c); 2024 Q30(c, d); 2025 Q30(d)',
    formulas: [
      '$$h^{\\prime} = \\frac{f\\,h}{Z} \\qquad\\Longleftrightarrow\\qquad Z = \\frac{f\\,h}{h^{\\prime}}, \\qquad f = \\frac{h^{\\prime} Z}{h}, \\qquad h = \\frac{h^{\\prime} Z}{f}$$',
      '$$\\text{camera at } p, \\text{ looking along } \\hat z_b: \\qquad Z = (x_{\\text{object}} - p)\\cdot \\hat z_b \\qquad \\text{(depth from the camera, along the optical axis)}$$',
      '$$\\begin{array}{l|c|c|c|c} \\text{question} & f & h & Z \\text{ (from the camera)} & h^{\\prime} \\\\ \\hline \\text{JWST, review deck} & 131.4\\ \\text{m} & 2.82\\times10^{8}\\ \\text{m} & 1.2\\times10^{12}\\ \\text{m} & \\mathbf{0.0309\\ m} \\\\ \\text{2023 Q33(c)} & 50\\ \\text{mm} & 1.7\\ \\text{m} & 5 - 0.4 = 4.6\\ \\text{m} & \\mathbf{18.5\\ mm} \\\\ \\text{2024 Q30(c)} & 50\\ \\text{mm} & 60\\ \\text{m} & \\mathbf{78.95\\ m} & 38\\ \\text{mm} \\\\ \\text{2024 Q30(d)} & 50\\ \\text{mm} & 60\\ \\text{m} & 78.95 - 20 = 58.95\\ \\text{m} & \\mathbf{50.9\\ mm} \\\\ \\text{2025 Q30(d)} & \\mathbf{80\\ mm} & 163\\ \\text{mm} & 1.85\\ \\text{m} & 7.06\\ \\text{mm} \\end{array}$$',
    ],
    what: 'Light from each point of the scene travels in a straight line through the pinhole to the image plane, a distance $f$ behind it. The object (height $h$, at depth $Z$) and its image (height $h^{\\prime}$) form two similar triangles with the same apex angle, so $h^{\\prime}/f = h/Z$. Image size is **proportional to $f$** and **inversely proportional to $Z$** (not to $Z^2$).\n\nEvery arm question from 2023 to 2025 ends with this equation. Once the arm has told you where the camera is and which way it looks, three of $f$, $h$, $Z$ and $h^{\\prime}$ are known and you solve for the fourth. The bold entries in the table are what each paper asked for.',
    when: '- “How tall will the person be in the image plane? List any additional assumptions you make” (2023 Q33(c), 3 marks).\n- “How far away is the base of the robot arm to the Wheel?” and “If the camera is moved 20 m closer, how tall will the Wheel now appear?” (2024 Q30(c) and (d), 3 + 2 marks).\n- “Compute the focal length used … List any assumptions you make” (2025 Q30(d), 3 marks).\n- “How large do the rings appear in the image?” (review deck slides 23–24, the JWST photo of Saturn).',
    how: [
      'Find the camera: its position is $p$ in $M$ (or the pose you are given) and it looks along $\\hat z_b$, the optical axis (the third column of $R$).',
      'Find the depth $Z$: the distance **from the camera** along that axis to the object, not from the base. When the object is straight ahead it is one coordinate difference (2023: $5 - 0.4 = 4.6$ m).',
      'Convert every length to metres (focal lengths and image heights come in mm, astronomical distances in km), then rearrange $h^{\\prime} = fh/Z$ for the unknown.',
      'Sanity-check: a 50 mm lens imaging something metres away gives millimetres; image size goes as $1/Z$, so in 2024 (d) $38 \\times 78.95/58.95 = 50.9$ mm agrees with the direct calculation.',
      'Answer the distance that was asked: if it is from the robot’s base, add or subtract the camera’s offset along the line of sight at the end (2024 (c): $78.95 + 1.5 \\approx 80.4$ m).',
      'State the assumptions: ideal pinhole (no lens distortion), object in focus, and the object in a plane perpendicular to the optical axis so all of it is at depth $Z$ (and centred, so it is fully in view).',
    ],
    traps: [
      {
        title: 'Measuring Z from the base',
        detail: 'In 2023 Q33(c) the person stands 5 m from the base along $\\hat y_s$, but the camera is already at $y = 0.4$ m: $Z = 4.6$ m gives 18.5 mm, while $Z = 5$ m gives 17.0 mm.',
        trapId: 'depth-from-camera',
        source: '2023 Q33(c)',
      },
      {
        title: 'Mixing millimetres and metres',
        detail: 'With $h$ and $Z$ in metres, $f$ = 50 mm must be entered as 0.050 m (or work entirely in mm). An answer off by exactly $10^3$ is the tell-tale sign.',
        trapId: 'unit-scale',
        source: '2024 Q30(c); review deck slide 24',
      },
      {
        title: 'Using the slant distance',
        detail: 'The pinhole equation divides by depth along the optical axis. The straight-line distance from the camera to the person’s feet in 2023 (4.84 m) gives 17.6 mm, which is wrong.',
        trapId: 'depth-from-camera',
        source: '2023 Q33(c)',
      },
      {
        title: 'Size as 1/Z²',
        detail: 'Heights scale as $1/Z$: twice as far means half as tall. Image **area** (and the light collected from the object) goes as $1/Z^2$.',
        source: '2024 Q30(d)',
      },
      {
        title: 'Giving the camera distance when the base was asked for',
        detail: '2024 Q30(c) asked how far the **base** is from the Wheel: 78.95 m is from the camera, and the camera sits $L_3 = 1.5$ m further along the line of sight, so about 80.4 m.',
        source: '2024 Q30(c)',
      },
    ],
    more: '**Why only depth matters.** In camera coordinates a point $(X, Y, Z)$ lands at $x = fX/Z$, $y = fY/Z$. Two points at the same depth $Z$ and a height $h$ apart land $fh/Z$ apart wherever they are in the view. So the assumption that really matters is that the object lies in a plane perpendicular to the optical axis (one depth); “centred” keeps it in view and away from the lens distortion near the edges.\n\n**Why “in focus” matters.** A real lens focuses an object at distance $Z$ at a distance $z_i$ behind it, with $1/f = 1/Z + 1/z_i$. For $Z \\gg f$, $z_i \\approx f$ and the pinhole model holds: at 4.6 m a 50 mm lens focuses at 50.5 mm, a 1 % difference.\n\n**Field of view.** A sensor of width $w$ sees $\\text{FOV} = 2\\arctan\\dfrac{w}{2f}$. A longer focal length enlarges the image and narrows the view: with a 36 mm sensor, about 40° at $f$ = 50 mm and 20° at 100 mm.\n\n**In pixels.** Divide by the pixel size: $h^{\\prime}_{\\text{px}} = \\alpha_v h/Z$ with $\\alpha_v = f/\\rho_h$ (see the intrinsics card).\n\n**Worked (review deck slides 23–24).** $h^{\\prime} = \\dfrac{131.4 \\times 2.82\\times10^{8}}{1.2\\times10^{12}} = 0.0309$ m: Saturn’s rings, 282 000 km across, span about 3 cm of the JWST focal plane.\n\n**Worked (2025 Q30(d)).** $f = \\dfrac{h^{\\prime}Z}{h} = \\dfrac{0.00706 \\times 1.847}{0.163} = 0.0800$ m = 80 mm, with $Z = 1.85$ m from part (c).',
    exploreIds: ['pinhole', 'kin/build-m'],
    solveIds: ['vision-pinhole', 'vision-measure'],
  },

  // ------------------------------------------------------------------ intrinsics, extrinsics, calibration
  {
    id: 'vision-intrinsics',
    title: 'Intrinsics, extrinsics and camera calibration',
    lecture: 'Notes §7 (image formation, calibration); review deck slides 21–22; 2023 Q14; 2024 Q14; 2025 Q14',
    formulas: [
      '$$\\lambda\\begin{bmatrix} u \\\\ v \\\\ 1 \\end{bmatrix} = \\underbrace{\\begin{bmatrix} \\alpha_u & s & u_0 \\\\ 0 & \\alpha_v & v_0 \\\\ 0 & 0 & 1 \\end{bmatrix}}_{K\\ \\text{(intrinsic)}} \\underbrace{\\begin{bmatrix} R & t \\end{bmatrix}}_{\\text{extrinsic}} \\begin{bmatrix} X_w \\\\ Y_w \\\\ Z_w \\\\ 1 \\end{bmatrix}, \\qquad \\lambda = Z_c$$',
      '$$\\alpha_u = \\frac{f}{\\rho_w}, \\quad \\alpha_v = \\frac{f}{\\rho_h} \\ \\text{(focal length in pixels)}, \\qquad u = \\alpha_u \\frac{X_c}{Z_c} + u_0, \\quad v = \\alpha_v \\frac{Y_c}{Z_c} + v_0 \\quad (s = 0)$$',
      '$$\\begin{array}{l|l|l} & \\text{intrinsic: the camera itself} & \\text{extrinsic: where the camera is} \\\\ \\hline \\text{parameters} & \\alpha_u, \\alpha_v\\ (f \\text{ and pixel size}),\\ (u_0, v_0),\\ s,\\ \\text{distortion} & R \\text{ (3-D orientation)},\\ t \\text{ (3-D position)} \\\\ \\text{how many} & 5 + \\text{distortion coefficients} & 6 \\text{ per image} \\\\ \\text{they change when} & \\text{you zoom, refocus or change the lens} & \\text{the camera moves} \\end{array}$$',
      '$$\\min_{K,\\ k,\\ \\{R_i,\\, t_i\\}} \\ \\sum_{i=1}^{\\text{images}} \\ \\sum_{j=1}^{\\text{corners}} \\big\\| \\mathbf{p}_{ij} - \\hat{\\mathbf{p}}(K, k, R_i, t_i, \\mathbf{P}_j) \\big\\|^2 \\qquad \\text{(total reprojection error, in pixels)}$$',
    ],
    what: 'Turning a world point into a pixel takes two sets of parameters. The **extrinsics** $[R \\mid t]$ say where the camera is: its 3-D orientation and position, written as the transform from world to camera coordinates. They are 6 numbers and change whenever the camera moves. The **intrinsics** describe the camera itself: the focal length in pixels $\\alpha_u = f/\\rho_w$ and $\\alpha_v = f/\\rho_h$ (focal length over pixel width and height), the principal point $(u_0, v_0)$ where the optical axis meets the image, the skew $s$ (usually 0), and the lens distortion coefficients. The lens and the sensor fix these, not the camera’s position.\n\n**Calibration** estimates them: photograph a pattern of known geometry (a checkerboard) from many poses, detect its corners, and choose the parameters whose predicted corners land closest to the detected ones (minimum **reprojection error**). Its purpose is to turn pixels into metric geometry: rays, poses and measurements.',
    when: '- “The intrinsic parameters of a camera include its …” (2023 Q14: focal length; 2025 Q14: neither 3-D orientation nor 3-D position) and “The extrinsic parameters include its …” (2024 Q14: 3-D position).\n- “What parameters are you solving for when calibrating your camera?” (review deck slide 22).\n- “Explain the purpose of camera calibration and describe its process” and “describe how to get from world to pixel coordinates” (review deck slide 21, learning outcomes).',
    how: [
      'Sort a parameter by asking what changes it: if moving the camera changes it, it is extrinsic (3-D position $t$, 3-D orientation $R$); if only a new lens, zoom or sensor changes it, it is intrinsic ($f$, pixel size, principal point, skew, distortion). The range to an object or its size is neither: that is the scene.',
      'World to pixel, in order: into the camera frame with the extrinsics, $X_c = RX_w + t$; divide by the depth $Z_c$ (perspective division); then apply $K$: $u = \\alpha_u X_c/Z_c + u_0$ and $v = \\alpha_v Y_c/Z_c + v_0$.',
      'Calibration set-up: print a checkerboard with a known square size; photograph it at 10–20 poses (tilted, near and far, covering the corners of the frame); detect every corner to sub-pixel accuracy.',
      'Calibration solve: a closed-form first guess of $K$ and of each image’s $[R_i \\mid t_i]$ from the board-to-image homographies, then nonlinear least squares over $K$, the distortion coefficients and every $[R_i \\mid t_i]$ to minimise the total reprojection error.',
      'Check and use it: the RMS reprojection error should be a fraction of a pixel and straight edges should look straight once the image is undistorted. $K$ then turns any pixel into a ray, which pose estimation (PnP), measurement and visual servoing all rely on.',
    ],
    traps: [
      {
        title: 'Calling 3-D position or orientation intrinsic',
        detail: 'Both describe where the camera is, so they are extrinsic. They are the distractors in 2023 Q14, the key of 2024 Q14, and the reason the answer to 2025 Q14 is “Neither”.',
        trapId: 'extrinsic-pose',
        source: '2023 Q14, 2024 Q14, 2025 Q14',
      },
      {
        title: 'Range as a camera parameter',
        detail: 'The distance to an object belongs to the scene, and it is what you might want to measure. It is neither intrinsic nor extrinsic.',
        source: '2023 Q14, 2024 Q14',
      },
      {
        title: 'Focal length in millimetres inside K',
        detail: '$K$ holds $\\alpha_u = f/\\rho_w$ in **pixels**: an 8 mm lens with 4 µm pixels gives 2000 px. Mixing mm, µm and pixels is an error of $10^3$ or more.',
        trapId: 'unit-scale',
        source: 'Notes §7',
      },
      {
        title: 'Calibrating from one square-on photo',
        detail: 'Viewed square-on, a bigger focal length looks just like a closer board ($f$ and $Z$ appear only as $f/Z$). Tilted views at several distances separate them, and corners near the frame edges pin down the distortion.',
        source: 'Notes §7 (calibration)',
      },
      {
        title: 'Distortion as a perspective effect',
        detail: 'Radial distortion is a lens imperfection, estimated with the intrinsics. Perspective projection itself keeps straight lines straight.',
        source: '2024 Q13 solution',
      },
    ],
    more: '**Why the extrinsics are the camera pose “inverted”.** $[R \\mid t]$ maps world coordinates into camera coordinates, so it is the pose of the world in the camera frame, $T_{cw} = T_{wc}^{-1}$. The camera’s position in the world is where $X_c = 0$: $X_w = -R^{T} t$. On an arm whose camera sits at {b}, $T_{sb}$ comes from the product of exponentials and the extrinsics are $T_{sb}^{-1}$.\n\n**Why λ.** The third row of the projection gives $\\lambda = Z_c$, so dividing by $\\lambda$ is the perspective division: it is what makes far objects small.\n\n**What calibration can and cannot separate.** Only the ratio $\\alpha_u = f/\\rho_w$ affects the image, so calibration finds the focal length in pixels, not $f$ and the pixel size separately. Each view of a flat board gives a homography, which yields 2 constraints on the 5 intrinsics; hence at least 3 views (2 if the skew is assumed 0), and in practice 10–20 for accuracy. Every extra view also adds its own 6 extrinsic unknowns.\n\n**Distortion.** Radial distortion scales points by $1 + k_1 r^2 + k_2 r^4 + \\dots$, where $r$ is the distance from the image centre: barrel ($k_1 < 0$) bows straight lines outwards, pincushion ($k_1 > 0$) inwards. Tangential terms model a lens not quite parallel to the sensor.\n\n**Hand–eye calibration.** For a camera on a gripper, the camera-to-end-effector transform is an extrinsic calibration of its own (solved from several arm poses, the $AX = XB$ problem). Position-based visual servoing needs it.\n\n**Worked.** $f$ = 4 mm and 2 µm pixels give $\\alpha_u = \\alpha_v = 2000$ px; with $(u_0, v_0) = (640, 360)$, the camera-frame point $(0.3, 0.15, 3.0)$ m projects to $u = 2000(0.1) + 640 = 840$, $v = 2000(0.05) + 360 = 460$.',
    exploreIds: ['intrinsics', 'pipeline'],
    solveIds: ['vision-project'],
  },

  // ------------------------------------------------------------------ perspective
  {
    id: 'vision-perspective',
    title: 'Perspective: what one image keeps and what it loses',
    lecture: 'Notes §7 (image formation); 2023 Q13; 2024 Q13; 2025 Q13',
    formulas: [
      '$$x = f\\,\\frac{X}{Z}, \\qquad y = f\\,\\frac{Y}{Z} \\qquad \\text{(dividing by depth causes every effect below)}$$',
      '$$\\begin{array}{l|l} \\text{preserved} & \\text{not preserved} \\\\ \\hline \\text{straight lines stay straight} & \\text{lengths, and ratios of lengths} \\\\ \\text{conics stay conics (e.g. a circle as an ellipse)} & \\text{angles} \\\\ \\text{lines that meet still meet} & \\text{parallelism: receding parallel lines meet at a vanishing point} \\\\ & \\text{absolute size and depth} \\end{array}$$',
      '$$\\frac{f\\,(k h)}{k Z} = \\frac{f h}{Z} \\quad \\text{for every } k > 0 \\qquad \\text{(scale ambiguity: twice as big and twice as far looks identical)}$$',
      '$$\\text{line } A + \\lambda D: \\quad \\lim_{\\lambda \\to \\infty} \\left( f\\frac{A_x + \\lambda D_x}{A_z + \\lambda D_z},\\ f\\frac{A_y + \\lambda D_y}{A_z + \\lambda D_z} \\right) = \\left( f\\frac{D_x}{D_z},\\ f\\frac{D_y}{D_z} \\right) \\quad (D_z \\neq 0)$$',
    ],
    what: 'Perspective projection divides by depth, and that one division explains everything on the list. Far objects look smaller. Parallel lines that recede from the camera converge at a **vanishing point**, which depends only on their direction. Lengths, ratios and angles change with depth and viewing angle. What survives is straight lines (they stay straight) and conics (a circle images as an ellipse).\n\nBecause a big, far object and a small, near one can give exactly the same image, one image cannot tell absolute size or depth (**scale ambiguity**). It does give relative sizes and positions in the image and, once the camera is calibrated, the bearing of every pixel, but not distance.',
    when: '- “Which of the following is NOT an effect of visual perspective?” (2023 Q13: angles are preserved).\n- “Which of the following is an effect of visual perspective?” (2024 Q13: parallel lines meet at a vanishing point).\n- “Which of the following can be measured in a single camera image?” (2025 Q13: the relative size of objects in the image frame).',
    how: [
      'Read the stem: the three papers ask the same idea three ways (NOT an effect, an effect, measurable from one image).',
      'Run each option through “divide by depth”: anything that needs points at a common depth (lengths, ratios, angles, parallelism) is lost; straight lines and conics survive; far things shrink.',
      'Separate lens effects from perspective: radial distortion bends straight lines, so it is the lens (an intrinsic), not perspective, which keeps lines straight.',
      'For “measurable from one image”, keep only what needs no scale: relative sizes and positions in the image (and bearings, if $K$ is known). Absolute size, depth and true distances need extra information.',
      'If asked how to recover depth, name what supplies the scale: a known object size ($Z = fh/h^{\\prime}$), a second view a known baseline away (stereo), a known camera height above a flat floor, or an active depth sensor.',
    ],
    traps: [
      {
        title: '“Angles are preserved”',
        detail: 'False: a square seen at an angle images as a general quadrilateral, so its right angles change. It is the key of 2023 Q13 (NOT an effect) and a distractor in 2024 Q13.',
        trapId: 'read-the-stem',
        source: '2023 Q13, 2024 Q13',
      },
      {
        title: '“All parallel lines stay parallel”',
        detail: 'Only lines parallel to the image plane do ($D_z = 0$ in the formula box). Lines that recede, like railway tracks, meet at a vanishing point.',
        source: '2024 Q13',
      },
      {
        title: 'Radial distortion as an effect of perspective',
        detail: 'Barrel or pincushion distortion comes from the lens and is modelled with the intrinsics; it bends straight lines, which perspective never does.',
        source: '2024 Q13 solution',
      },
      {
        title: 'Reading distance off one image',
        detail: 'Depth and absolute size are unknown up to a common scale: a 3.6 m statue twice as far away as a 1.8 m person images at exactly the same height.',
        source: '2025 Q13',
      },
    ],
    more: '**Why straight lines stay straight.** A line in the scene and the pinhole together span a plane; that plane cuts the image plane in a straight line. (Lens distortion breaks this, which is how calibration detects it.)\n\n**Why vanishing points exist.** Walk along a line $A + \\lambda D$: as $\\lambda \\to \\infty$ its image tends to $(fD_x/D_z,\\ fD_y/D_z)$, which depends only on the direction $D$. Every line with that direction heads for the same point. Lines on the floor vanish on the horizon; lines parallel to the image plane ($D_z = 0$) never meet.\n\n**The exception: a plane facing the camera.** Every point of a flat object parallel to the image plane has the same $Z$, so its image is just a copy scaled by $f/Z$: its angles and length ratios survive. That is exactly why the pinhole size questions assume the object is perpendicular to the optical axis.\n\n**The one ratio that survives.** Simple ratios such as “the midpoint” are not preserved, but the cross-ratio of four collinear points is. That is what lets surveyors measure along a road from a single photograph.\n\n**Bearings need the intrinsics.** With $K$ known, pixel $(u, v)$ is the ray direction $K^{-1}(u, v, 1)^T$, which is why the notes call a calibrated camera a bearing sensor. Without $K$, an image gives positions in pixels only; the safe answer to 2025 Q13 is therefore the relative size of objects in the image.\n\n**Getting absolute scale back.** A known object size: $Z = fh/h^{\\prime}$ (the pinhole questions). Two views: stereo depth $Z = f b/d$ from the baseline $b$ and the disparity $d$. A known camera height above a flat floor. A fiducial of known size (see the fiducials card). Or an active sensor that measures range directly.',
    exploreIds: ['pipeline', 'pinhole'],
    solveIds: ['vision-measure'],
  },

  // ------------------------------------------------------------------ visual servoing
  {
    id: 'vision-servoing',
    title: 'Visual servoing: PBVS vs IBVS',
    lecture: 'Notes §7 (visual servoing); review deck slides 21–22; 2023 Q15; 2024 Q15; 2025 Q15',
    formulas: [
      '$$\\begin{aligned} \\text{PBVS:}&\\quad \\text{image} \\ \\to\\ \\hat T_{c,\\text{target}} \\text{ (pose estimate)} \\ \\to\\ e = \\text{pose error in 3-D} \\ \\to\\ \\text{Cartesian velocity} \\\\ \\text{IBVS:}&\\quad \\text{image} \\ \\to\\ s \\text{ (feature pixels)} \\ \\to\\ e = s - s^{*} \\ \\to\\ v_c = -\\lambda\\, \\hat L_s^{+}\\, e \\end{aligned}$$',
      '$$\\dot s = L_s v_c, \\qquad L_s = \\begin{bmatrix} -\\dfrac{1}{Z} & 0 & \\dfrac{x}{Z} & xy & -(1 + x^2) & y \\\\[6pt] 0 & -\\dfrac{1}{Z} & \\dfrac{y}{Z} & 1 + y^2 & -xy & -x \\end{bmatrix} \\quad \\text{(one point } (x, y) \\text{ at depth } Z\\text{)}$$',
      '$$\\begin{array}{l|l|l} & \\text{PBVS (position-based)} & \\text{IBVS (image-based)} \\\\ \\hline \\text{error defined in} & \\text{3-D: the pose of the target} & \\text{the image: feature pixels} \\\\ \\text{needs} & K,\\ \\text{a target model, a known camera-to-gripper } T & \\text{an image Jacobian with depth estimates} \\\\ \\text{3-D path} & \\text{straight line} & \\text{can be odd (may retreat)} \\\\ \\text{image path} & \\text{target can leave the view} & \\text{features move straight, stay in view} \\\\ \\text{calibration error} & \\text{shifts the final pose} & \\text{tolerated} \\end{array}$$',
    ],
    what: 'Visual servoing closes the control loop through the camera: every new image gives an error, and the robot moves to drive it to zero. **Position-based (PBVS)** first estimates the target’s 3-D pose from the image (which needs $K$ and a model of the target) and then controls the pose error in Cartesian space. It therefore needs accurate calibration, including a **known** camera-to-end-effector transform. **Image-based (IBVS)** skips the pose: it moves the camera so the image features slide to where they appear in the desired view, through the image Jacobian $L_s$.\n\nBecause the IBVS error is measured in the image itself, calibration errors bend the path but do not move the end point, and the features stay in view. The price is a 3-D motion that can look odd, and a depth estimate for each feature, since $Z$ appears in $L_s$. The camera can ride on the gripper (**eye-in-hand**) or watch from a fixed spot (**eye-to-hand**).',
    when: '- “For an eye-in-hand setup, controlling a robot arm so the features in its camera image align with a desired view is known as …” (2023 Q15: image-based visual servoing).\n- “Position-based visual servoing requires …” (2024 Q15: a known camera-to-end-effector transform) and “Image-based visual servoing requires …” (2025 Q15: a fixed camera-to-end-effector transform).\n- “Describe the difference between position-based and image-based visual servoing” (review deck slide 22) and “Describe the process of visual servoing” (slide 21).',
    how: [
      'Ask where the error lives: a 3-D pose (PBVS) or pixel positions of features (IBVS). “Make the features align with a desired view” is IBVS.',
      'List what each needs. PBVS: calibrated intrinsics, a 3-D model of the target (e.g. a marker for PnP) and a known camera-to-end-effector transform. IBVS: the desired feature positions, an image Jacobian with a rough depth per feature, and a camera fixed rigidly to the gripper (the transform need not be known precisely).',
      'Describe the loop for “the process” question: capture an image, extract features, form the error (pose or pixels), compute a camera velocity that shrinks it, map it to joint velocities with the robot Jacobian, move, repeat until the error is near zero.',
      'Compare behaviour: PBVS gives a straight 3-D path but the target can leave the field of view, and its accuracy is only as good as the calibration; IBVS keeps features moving straight in the image and tolerates calibration error, but its 3-D path can be odd (it may back away during a large rotation about the optical axis).',
      'For the “requires” MCQs, match the word exactly: **known** transform is PBVS, **fixed** transform is IBVS. Neither needs several cameras, fiducial markers or a motion planner, and both work eye-in-hand or eye-to-hand.',
    ],
    traps: [
      {
        title: 'IBVS needs a precisely known camera-to-end-effector transform',
        detail: 'It needs the transform to stay **fixed** (a rigid mount). An error in its value changes the path, not where the features end up. “Known” is PBVS’s requirement: the 2024 Q15 and 2025 Q15 keys differ by exactly this word.',
        trapId: 'read-the-stem',
        source: '2024 Q15, 2025 Q15',
      },
      {
        title: 'PBVS requires an eye-in-hand set-up',
        detail: 'A fixed camera watching the arm (eye-to-hand) works too. What PBVS needs is the known transform between the camera and the robot.',
        source: '2024 Q15',
      },
      {
        title: 'IBVS follows a straight 3-D path',
        detail: 'It is the **image** paths that are straight. Rotating the target 180° about the optical axis makes the features cut straight through the image centre, so the camera retreats along its axis, possibly into a joint limit.',
        source: 'Notes §7',
      },
      {
        title: 'Visual servoing is motion planning',
        detail: 'Servoing is feedback control from images, cycle by cycle, with no map and no path search.',
        source: '2023 Q15',
      },
    ],
    more: '**Why IBVS tolerates calibration error.** The loop stops when the measured features equal the desired ones, $s = s^{*}$, and both are measured by the same camera. A wrong $K$ or hand–eye transform only distorts $\\hat L_s$, which changes the path taken (and, if very wrong, can make it unstable), not where it ends. PBVS stops when the **estimated** pose equals the goal, so any error in $K$, the target model or the hand–eye transform moves the final pose directly.\n\n**Why IBVS needs depth.** Moving the camera sideways by 1 cm shifts a near point across the image much more than a far one, hence the $1/Z$ terms in $L_s$. In practice $Z$ is estimated, or fixed at its value in the goal view.\n\n**The control law.** With $v_c = -\\lambda \\hat L_s^{+} e$, the error decays roughly exponentially, $\\dot e \\approx -\\lambda e$: the gain $\\lambda$ trades speed for overshoot and noise. At least 3 points (6 equations) are needed to control all 6 camera velocities; 4 are used in practice to avoid ambiguous configurations.\n\n**Which to choose.** PBVS when the calibration is good and a straight Cartesian path matters (avoiding obstacles near the tool); IBVS when calibration is rough, the target must stay in view, or the goal is defined as a picture (“make it look like this”).',
    exploreIds: ['servoing'],
  },

  // ------------------------------------------------------------------ fiducials
  {
    id: 'vision-fiducials',
    title: 'Fiducial markers: pose from one image (PnP)',
    lecture: 'Notes §7 (fiducials); 2023 Q23',
    formulas: [
      '$$\\underbrace{6}_{\\text{unknowns: } R,\\ t} \\ \\le\\ \\underbrace{4 \\times 2 = 8}_{\\text{equations: } (u, v) \\text{ for each corner}} \\qquad \\text{(one square marker of known size, camera with known } K\\text{)}$$',
      '$$\\lambda_j \\begin{bmatrix} u_j \\\\ v_j \\\\ 1 \\end{bmatrix} = K \\begin{bmatrix} R & t \\end{bmatrix} \\begin{bmatrix} \\mathbf{P}_j \\\\ 1 \\end{bmatrix}, \\quad j = 1, \\ldots, 4 \\qquad \\text{(PnP: given } K, \\mathbf{P}_j, (u_j, v_j)\\text{, solve for } R, t\\text{)}$$',
      '$$T_{w,\\text{robot}} = T_{w,\\text{marker}} \\ \\big(T_{c,\\text{marker}}\\big)^{-1} \\ T_{c,\\text{robot}}$$',
      '$$\\delta Z \\approx \\frac{Z^2}{\\alpha\\, s}\\,\\delta \\qquad \\text{(depth error from a corner error of } \\delta \\text{ pixels, marker side } s\\text{)}$$',
    ],
    what: 'A fiducial marker (ArUco, AprilTag) is a printed square with a unique binary code, easy to detect and to identify. If the marker’s pose in the map and its size are known, **one marker is enough in theory**: its four corners give eight pixel equations for the six unknowns of the camera pose, a perspective-n-point (PnP) problem, provided $K$ is known from calibration. Chaining that with the marker’s known pose and the camera’s mounting on the robot gives the robot’s pose.\n\nObserving **more markers** is still a good idea: every detection is noisy, one small or distant marker can be ambiguous (two tilts fit almost equally well), and several well-spread markers average the noise, constrain the pose much better, and keep working if one is hidden or misread.',
    when: '- “If the pose and size of the markers are known, in theory, how many markers does the robot need to observe to localise itself? Why might it be a good idea to observe more markers?” (2023 Q23, 2 marks).\n- Landmark localisation with coded tags (the code solves data association), e.g. a warehouse forklift reading tags on the racks.\n- Estimating a target’s pose for position-based visual servoing.',
    how: [
      'Count the unknowns: the camera pose has 6 (3 for position, 3 for orientation).',
      'Count the equations: each detected corner gives a pixel $(u, v)$, i.e. 2 equations; a square marker has 4 corners, so 8 ≥ 6. One marker suffices, given a calibrated $K$ and the marker’s side length (the size sets the scale; without it the distance is ambiguous).',
      'Solve PnP for the marker’s pose in the camera frame, invert it, and chain it with the marker’s known pose in the map and the camera-to-robot transform (formula box).',
      'Say why more markers help: noise averages down, a single small marker’s tilt ambiguity is resolved, a wider spread of points conditions the pose better, and redundancy survives occlusion and misdetections (outliers can be rejected).',
      'For 2 marks, two sentences: “One, because its four known corners fix all six pose parameters (PnP). More, because …” with two of the reasons above.',
    ],
    traps: [
      {
        title: 'Three markers, as if triangulating',
        detail: 'Triangulation is for beacons that give only a range or a bearing. A marker of known size and pose already fixes the full 6-DOF pose through its four corners.',
        source: '2023 Q23',
      },
      {
        title: 'One point landmark fixes the pose',
        detail: 'A single point (say only the marker’s centre) gives just a bearing, or a range and a bearing, leaving the robot anywhere on a circle around it. The four known corners are what fix the full pose.',
        source: 'Notes §3 (landmark model), §7',
      },
      {
        title: 'Ignoring the marker’s size',
        detail: 'Without the side length the pose is known only up to scale: a marker twice as big and twice as far away looks identical.',
        source: 'Notes §7 (scale ambiguity)',
      },
      {
        title: '“More markers only add redundancy”',
        detail: 'They also add accuracy: independent errors average down roughly as $1/\\sqrt{N}$, and points spread across the image constrain rotation far better than the corners of one small square.',
        source: '2023 Q23 solution',
      },
    ],
    more: '**Why three points are not quite enough.** Three corners give 6 equations for 6 unknowns, but the equations are nonlinear and allow up to four poses (the P3P problem); a fourth point picks the right one. A square marker supplies four, which is why one marker works.\n\n**The flip ambiguity.** Four coplanar corners seen nearly face-on, or from far away, fit two poses whose tilts are mirror images almost equally well; pixel noise decides which wins, so the reported orientation can flip between frames. A second marker in another plane, or a closer and bigger marker, removes it.\n\n**Why accuracy falls with distance.** A marker of side $s$ at depth $Z$ spans $\\alpha s/Z$ pixels, so a corner error of $\\delta$ pixels gives a depth error of about $Z^2\\delta/(\\alpha s)$. With $\\alpha$ = 800 px, $s$ = 0.1 m and $\\delta$ = 0.5 px: 2.5 cm at 2 m, but 10 cm at 4 m. Bigger, closer and more markers all help.\n\n**Where it is used.** Warehouse robots localise from tags on racks (a known map of markers, so localisation, not SLAM); arms use a marker on a part to estimate its pose for grasping or for PBVS; calibration boards (ChArUco) combine a checkerboard with markers.',
    exploreIds: ['pipeline'],
    solveIds: ['vision-project'],
  },
];

export const flashcards: Flashcard[] = [
  // Sensors
  {
    id: 'vision-f-proprio',
    front: 'Proprioceptive vs exteroceptive: what is the difference, with two examples of each?',
    back: 'Proprioceptive sensors measure the robot’s **own** state: wheel and joint encoders, IMU (and motor currents). Exteroceptive sensors measure the **world**: camera, lidar, sonar, GPS.',
    tags: ['sensors'],
  },
  {
    id: 'vision-f-active',
    front: 'Active vs passive sensors: the difference, and why it matters?',
    back: 'Active sensors **emit** energy and measure the return (lidar, sonar, radar, depth cameras); passive ones only **receive** what is there (a camera). Emitting lets an active sensor time its pulse, $r = c\\Delta t/2$, so it measures range directly and works in the dark.',
    tags: ['sensors', 'mcq'],
  },
  {
    id: 'vision-f-camera-lidar',
    front: 'Camera vs lidar in one line each?',
    back: 'Camera: passive, dense colour and texture, a bearing per pixel, no direct depth, cheap, needs light; it tells you **what** things are. Lidar: active, sparse but accurate range and bearing, works in the dark, no colour, costly; it tells you **where** surfaces are.',
    tags: ['sensors'],
  },
  {
    id: 'vision-f-compare',
    front: 'How do you score all 3 marks on “compare sensor A with sensor B”?',
    back: 'Contrast them point by point: (1) what each measures and how, with active or passive; (2) a strength and a weakness of each, tied to how it works; (3) an application each that uses the strength. Close with one line: the camera says what things are, the lidar where they are (2023 Q27, 2024 Q25).',
    tags: ['sensors', 'short'],
  },
  {
    id: 'vision-f-2d-lidar',
    front: 'The main limitation of a 2-D lidar compared with a camera or a 3-D lidar?',
    back: 'It scans **one plane**: anything above or below the slice (a table top, an overhanging shelf, a step down) is invisible. It also gives no colour or texture, so it cannot recognise objects.',
    tags: ['sensors'],
  },
  {
    id: 'vision-f-sonar',
    front: 'Sonar: why cheap, and why unreliable?',
    back: 'Cheap transducers, simple timing. Unreliable because the cone is wide (roughly 20–30°, so bearings are blurred), smooth walls hit at a shallow angle reflect the ping away (specular reflection, read as maximum range), and sound is slow (about 58 ms to hear the echo from a wall 10 m away).',
    tags: ['sensors'],
  },
  {
    id: 'vision-f-imu',
    front: 'Encoders and IMUs: strength, weakness, and where they enter the Bayes filter?',
    back: 'High rate and need nothing outside the robot, but they measure increments and rates, so integrated position **drifts** without bound. They drive the **prediction** step (motion model); exteroceptive sensors correct the drift.',
    tags: ['sensors'],
  },
  // Pinhole
  {
    id: 'vision-f-pinhole',
    front: 'The pinhole equation, and what each symbol means?',
    back: '$h^{\\prime} = fh/Z$: image height = focal length × object height / depth, where $Z$ is measured **from the camera along its optical axis**. It comes from similar triangles through the pinhole.',
    tags: ['pinhole'],
  },
  {
    id: 'vision-f-rearrange',
    front: 'Rearrange $h^{\\prime} = fh/Z$ for depth, focal length and object height.',
    back: '$$Z = \\frac{fh}{h^{\\prime}}, \\qquad f = \\frac{h^{\\prime}Z}{h}, \\qquad h = \\frac{h^{\\prime}Z}{f}$$\n\n2024 Q30(c) asked for $Z$, 2025 Q30(d) for $f$, 2023 Q33(c) for $h^{\\prime}$.',
    tags: ['pinhole'],
  },
  {
    id: 'vision-f-inverse',
    front: 'An object’s image is 12 mm tall. The object moves to 3 times the distance. How tall is the image now?',
    back: '4 mm. Image height goes as $1/Z$ (not $1/Z^2$). Doubling $f$ instead would double it.',
    tags: ['pinhole', 'effects'],
  },
  {
    id: 'vision-f-depth',
    front: 'Arm question: where does $Z$ come from?',
    back: 'The camera is at $p$ in $M$ and looks along $\\hat z_b$. $Z$ is the distance **from the camera** along $\\hat z_b$ to the object, e.g. $5 - 0.4 = 4.6$ m in 2023 Q33(c), not the 5 m from the base (17.0 mm instead of 18.5 mm).',
    tags: ['pinhole', 'trap'],
  },
  {
    id: 'vision-f-assume',
    front: 'Which assumptions should a pinhole answer list?',
    back: 'Ideal pinhole with no lens distortion; object in focus; object in a plane perpendicular to the optical axis, so all of it is at one depth $Z$ (and centred, so it is fully in view); depth measured from the camera.',
    tags: ['pinhole', 'short'],
  },
  {
    id: 'vision-f-jwst',
    front: 'JWST ($f$ = 131.4 m) photographs Saturn’s rings, 282 000 km across, from 1.2 billion km. How big is the image of the rings?',
    back: '$$h^{\\prime} = \\frac{131.4 \\times 2.82\\times10^{8}}{1.2\\times10^{12}} = 0.0309\\ \\text{m} \\approx 3.1\\ \\text{cm}$$\n\nPut $h$ and $Z$ in the same unit (both m, or both km: the ratio $h/Z$ is what matters); $f$ in metres then gives $h^{\\prime}$ in metres. Review deck slides 23–24.',
    tags: ['pinhole'],
  },
  // Intrinsics, extrinsics, calibration
  {
    id: 'vision-f-intrinsic',
    front: 'List the intrinsic parameters of a camera.',
    back: 'Focal length (in pixels: $\\alpha_u = f/\\rho_w$, $\\alpha_v = f/\\rho_h$, i.e. focal length and pixel size), principal point $(u_0, v_0)$, skew $s$, and lens distortion coefficients. They belong to the lens and sensor, not to where the camera is.',
    tags: ['calibration', 'mcq'],
  },
  {
    id: 'vision-f-extrinsic',
    front: 'What are the extrinsic parameters, and the classic MCQ trap?',
    back: 'Rotation $R$ and translation $t$: the camera’s **3-D orientation and position** (6 numbers), written as the world-to-camera transform. Trap: position and orientation are **not** intrinsic (2023 Q14, 2024 Q14, and “Neither” in 2025 Q14). Range is neither.',
    tags: ['calibration', 'mcq', 'trap'],
  },
  {
    id: 'vision-f-K',
    front: 'Write $K$ and say what each entry is.',
    back: '$$K = \\begin{bmatrix} \\alpha_u & s & u_0 \\\\ 0 & \\alpha_v & v_0 \\\\ 0 & 0 & 1 \\end{bmatrix}$$\n\n$\\alpha_u, \\alpha_v$: focal length in pixels; $(u_0, v_0)$: principal point, where the optical axis meets the image; $s$: skew, usually 0 (the review deck’s $K$ has none).',
    tags: ['calibration'],
  },
  {
    id: 'vision-f-alpha',
    front: 'An 8 mm lens on a sensor with 4 µm pixels: what is $\\alpha_u$?',
    back: '$\\alpha_u = f/\\rho_w = 8\\times10^{-3} / 4\\times10^{-6} = 2000$ pixels. A focal length in pixels is a ratio of two lengths: convert both to the same unit first.',
    tags: ['calibration'],
  },
  {
    id: 'vision-f-pipeline',
    front: 'World point to pixel: the three steps, in order?',
    back: '1. Extrinsics: $X_c = RX_w + t$ (into the camera frame).\n2. Perspective division by the depth $Z_c$: $x = X_c/Z_c$, $y = Y_c/Z_c$.\n3. Intrinsics: $u = \\alpha_u x + u_0$, $v = \\alpha_v y + v_0$ (pixels).',
    tags: ['calibration'],
  },
  {
    id: 'vision-f-calibrate',
    front: 'Camera calibration: the process in four steps?',
    back: '1. Photograph a checkerboard of known square size at many poses (tilted, near and far, filling the frame).\n2. Detect its corners to sub-pixel accuracy.\n3. Closed-form first guess of $K$ and each view’s $[R \\mid t]$ from the homographies.\n4. Refine $K$, the distortion and all extrinsics by minimising the reprojection error.',
    tags: ['calibration', 'short'],
  },
  {
    id: 'vision-f-reprojection',
    front: 'What is reprojection error, and what is a good value?',
    back: 'The pixel distance between each detected corner and where the current parameter estimates project that known 3-D corner. Calibration minimises its sum of squares; a good RMS is a fraction of a pixel.',
    tags: ['calibration'],
  },
  {
    id: 'vision-f-views',
    front: 'Why must calibration images be taken at many tilted poses?',
    back: 'Square-on, a longer focal length looks just like a closer board (only $f/Z$ shows), so tilt and varied distances are needed to separate them. Each view of a plane gives only 2 constraints on the 5 intrinsics (so at least 3 views), and corners near the frame edges are what reveal the distortion.',
    tags: ['calibration'],
  },
  // Perspective
  {
    id: 'vision-f-preserved',
    front: 'Perspective projection: what does it preserve, and what does it not?',
    back: 'Preserves: straight lines, conics (a circle becomes an ellipse), lines meeting. Does **not** preserve: lengths and their ratios, **angles**, parallelism (receding parallel lines meet at a vanishing point), absolute size and depth. Far objects look smaller.',
    tags: ['perspective', 'mcq'],
  },
  {
    id: 'vision-f-vanishing',
    front: 'Which parallel lines meet at a vanishing point, and which stay parallel?',
    back: 'Lines that recede from the camera meet at a vanishing point set only by their direction ($fD_x/D_z$, $fD_y/D_z$). Lines parallel to the image plane ($D_z = 0$) stay parallel, so “all parallel lines remain parallel” is false (2024 Q13).',
    tags: ['perspective'],
  },
  {
    id: 'vision-f-distortion',
    front: 'Is radial distortion an effect of perspective?',
    back: 'No. It is a lens imperfection (barrel or pincushion) modelled with the intrinsics. It **bends** straight lines, which perspective never does (the 2024 Q13 distractor).',
    tags: ['perspective', 'calibration', 'mcq'],
  },
  {
    id: 'vision-f-one-image',
    front: 'What can a single image measure, and what can it not?',
    back: 'It can measure relative sizes and positions in the image (and bearings, if $K$ is known). It cannot measure absolute size or depth: $f(kh)/(kZ) = fh/Z$, so twice as big and twice as far looks identical (2025 Q13).',
    tags: ['perspective', 'mcq'],
  },
  {
    id: 'vision-f-scale',
    front: 'Name four ways to recover absolute depth that one image cannot give.',
    back: 'A known object size ($Z = fh/h^{\\prime}$); a second camera a known baseline away (stereo, $Z = fb/d$); a known camera height above a flat floor; an active range sensor (lidar, depth camera). A fiducial of known size is the first one.',
    tags: ['perspective'],
  },
  // Visual servoing
  {
    id: 'vision-f-pbvs',
    front: 'PBVS: what it controls, what it needs, one pro, one con?',
    back: 'It estimates the target’s 3-D pose from the image and controls the **pose error** in Cartesian space. It needs calibrated $K$, a target model and a **known** camera-to-end-effector transform. Pro: a straight 3-D path. Con: sensitive to calibration, and the target can leave the view.',
    tags: ['servoing'],
  },
  {
    id: 'vision-f-ibvs',
    front: 'IBVS: what it controls, what it needs, one pro, one con?',
    back: 'It drives the **image-feature error** $s - s^{*}$ to zero through the image Jacobian. It needs desired feature positions and a depth estimate per feature, with the camera **fixed** to the gripper. Pro: tolerates calibration error and keeps features in view. Con: odd 3-D paths (it can retreat), local minima.',
    tags: ['servoing'],
  },
  {
    id: 'vision-f-servo-mcq',
    front: 'The three servoing MCQ keys (2023–2025 Q15)?',
    back: 'Eye-in-hand, align image features with a desired view: **image-based** visual servoing (2023). PBVS requires a **known** camera-to-end-effector transform (2024). IBVS requires a **fixed** camera-to-end-effector transform (2025).',
    tags: ['servoing', 'mcq'],
  },
  // Fiducials
  {
    id: 'vision-f-markers',
    front: 'Markers of known pose and size: how many must a robot see to localise, and why see more?',
    back: 'One in theory: its 4 corners give 8 pixel equations for the 6 pose unknowns (PnP, with $K$ known). More, because detections are noisy (errors average down), one small marker can be ambiguous in tilt, spread-out markers constrain the pose better, and redundancy survives occlusion or a misread tag (2023 Q23).',
    tags: ['fiducials', 'short'],
  },
];
