const state = {
  summary: null,
  currentView: "home",
  scanStream: null,
  coachStream: null,
  scanImages: [],
  poseIndex: 0,
  workouts: [],
  programs: {},
  selectedPart: "Chest",
  selectedProgramIndex: 0,
  selectedExerciseIndex: 0,
  attachedCoachImage: "",
  movementFrame: 0,
};

const poses = [
  { label: "Front relaxed", pose: "front", cue: "Face the camera, arms slightly away from torso." },
  { label: "Left side", pose: "left", cue: "Turn left, keep posture tall and relaxed." },
  { label: "Back relaxed", pose: "back", cue: "Face away from camera, shoulders level." },
  { label: "Right side", pose: "right", cue: "Turn right, same distance from camera." },
];

const programData = {
  Chest: [
    {
      name: "Push Strength",
      level: "Intermediate",
      schedule: "2 days/week",
      exercises: ["Barbell bench press", "Incline dumbbell press", "Cable fly", "Push-up finisher"],
      cues: ["Retract shoulder blades", "Touch chest under control", "Drive evenly through both hands"],
    },
    {
      name: "Chest Hypertrophy",
      level: "Beginner friendly",
      schedule: "1-2 days/week",
      exercises: ["Machine press", "Incline press", "Pec deck", "Slow push-up"],
      cues: ["Keep ribs down", "Pause the stretched position", "Stop 1-2 reps before form breaks"],
    },
  ],
  Back: [
    {
      name: "Width and Posture",
      level: "All levels",
      schedule: "2 days/week",
      exercises: ["Lat pulldown", "Chest-supported row", "Straight-arm pulldown", "Face pull"],
      cues: ["Pull elbows toward pockets", "Keep neck long", "Avoid swinging reps"],
    },
    {
      name: "Pull Strength",
      level: "Intermediate",
      schedule: "1-2 days/week",
      exercises: ["Pull-up", "Barbell row", "Single-arm row", "Back extension"],
      cues: ["Brace before pulling", "Own the top position", "Control the eccentric"],
    },
  ],
  Legs: [
    {
      name: "Lower Body Base",
      level: "All levels",
      schedule: "2 days/week",
      exercises: ["Squat", "Romanian deadlift", "Leg press", "Calf raise"],
      cues: ["Tripod foot pressure", "Knees track toes", "Keep bracing through the hard reps"],
    },
    {
      name: "Glute and Hamstring",
      level: "Intermediate",
      schedule: "1-2 days/week",
      exercises: ["Hip thrust", "Bulgarian split squat", "Leg curl", "Cable pull-through"],
      cues: ["Full hip lockout", "Slow lower", "Keep pelvis square"],
    },
  ],
  Shoulders: [
    {
      name: "Shoulder Cap",
      level: "All levels",
      schedule: "2 days/week",
      exercises: ["Overhead press", "Lateral raise", "Rear delt fly", "Cable Y raise"],
      cues: ["Do not shrug early", "Lead raises with elbows", "Use controlled partials at the end"],
    },
  ],
  Arms: [
    {
      name: "Arm Growth",
      level: "All levels",
      schedule: "2 days/week",
      exercises: ["EZ-bar curl", "Incline curl", "Rope pressdown", "Overhead triceps extension"],
      cues: ["Keep upper arms steady", "Use full elbow extension", "Chase tension before load"],
    },
  ],
  Core: [
    {
      name: "Brace and Control",
      level: "Beginner friendly",
      schedule: "3 short blocks/week",
      exercises: ["Dead bug", "Cable crunch", "Side plank", "Pallof press"],
      cues: ["Exhale into the brace", "Move slowly", "Do not let hips rotate"],
    },
  ],
  "Full body": [
    {
      name: "3-Day Full Body",
      level: "Beginner to intermediate",
      schedule: "Mon/Wed/Fri",
      exercises: ["Squat pattern", "Press pattern", "Pull pattern", "Hinge pattern", "Carry or core"],
      cues: ["Repeat lifts weekly", "Add reps before load", "Leave one strong rep in reserve"],
    },
  ],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  state.programs = programData;
  initializeDates();
  bindNavigation();
  bindHome();
  bindScan();
  bindLogger();
  bindPrograms();
  bindCoach();
  openInitialView();
  loadDashboard();
  renderPrograms();
  requestAnimationFrame(drawMovement);
  setInterval(updateLiveCue, 2200);
});

function initializeDates() {
  const today = new Date().toISOString().slice(0, 10);
  const workoutDate = document.querySelector("#workoutForm [name='date']");
  if (workoutDate) workoutDate.value = today;
}

function bindNavigation() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  $$("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });
  $("#refreshBtn").addEventListener("click", loadDashboard);
  window.addEventListener("hashchange", () => {
    const next = cleanHash();
    if (next && next !== state.currentView) showView(next);
  });
}

function openInitialView() {
  const initial = cleanHash();
  if (initial) showView(initial);
}

function cleanHash() {
  const view = window.location.hash.replace("#", "");
  return ["home", "scan", "logger", "programs", "coach"].includes(view) ? view : "";
}

function showView(view) {
  state.currentView = view;
  if (window.location.hash !== `#${view}`) {
    history.replaceState(null, "", `#${view}`);
  }
  $$(".view").forEach((section) => section.classList.toggle("active-view", section.id === view));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const titles = {
    home: "Dashboard",
    scan: "Body Composition Analysis",
    logger: "Workout Logger",
    programs: "Workout Programs",
    coach: "AI Coach",
  };
  $("#viewTitle").textContent = titles[view] || "Dashboard";
  if (view === "logger") loadWorkouts();
  if (view === "coach") loadCoachHistory();
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
}

function bindHome() {
  $("#markVisitBtn").addEventListener("click", async () => {
    await api("/api/gym-visits", {
      method: "POST",
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }),
    });
    toast("Gym visit marked. Streak updated.");
    loadDashboard();
  });
}

function bindScan() {
  $("#startCameraBtn").addEventListener("click", startScanCamera);
  $("#captureBtn").addEventListener("click", captureScanImage);
  $("#imageUpload").addEventListener("change", handleImageUpload);
  $("#scanForm").addEventListener("submit", submitScan);
  updatePosePrompt();
}

function bindLogger() {
  $("#workoutForm").addEventListener("submit", saveWorkout);
}

function bindPrograms() {
  $("#nextExerciseBtn").addEventListener("click", () => {
    const program = currentProgram();
    if (!program) return;
    state.selectedExerciseIndex = (state.selectedExerciseIndex + 1) % program.exercises.length;
    renderMovementInfo();
  });
}

function bindCoach() {
  $("#startCoachVideoBtn").addEventListener("click", startCoachVideo);
  $("#coachSnapshotBtn").addEventListener("click", attachCoachSnapshot);
  $("#coachForm").addEventListener("submit", sendCoachMessage);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(data.error || data || "Request failed");
  }
  return data;
}

async function loadDashboard() {
  try {
    state.summary = await api("/api/summary");
    renderDashboard();
    renderRecentWorkouts();
    drawProgressChart($("#homeProgressChart"), state.summary.progress || []);
  } catch (error) {
    toast(error.message);
  }
}

function renderDashboard() {
  const summary = state.summary;
  if (!summary) return;
  const streak = summary.streak || {};
  const totals = summary.totals || {};
  $("#homeDate").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  $("#homeSummary").textContent = streak.count
    ? `You are on a ${streak.count}-visit streak. Keep the gap under 3 days to preserve it.`
    : "No active streak yet. Log today's workout or mark a gym visit to start.";
  $("#sideStreak").textContent = streak.count || 0;
  $("#homeStreak").textContent = streak.count || 0;
  $("#sideStreakCopy").textContent = streak.last_visit
    ? `Last visit ${formatDate(streak.last_visit)}`
    : "Log a visit to start.";
  $("#totalWorkouts").textContent = number(totals.total_workouts);
  $("#totalVolume").textContent = `${number(Math.round(totals.total_volume || 0))} kg`;
  $("#totalMinutes").textContent = `${number(totals.total_minutes || 0)} min`;
  const lastScan = summary.last_scan?.result?.body_fat_percent;
  $("#lastScanMetric").textContent = lastScan ? `${lastScan}%` : "None";
  $("#aiStatus").textContent = summary.has_backend_api_key ? `Backend AI: ${summary.model}` : "Backend AI: local fallback";
}

function renderRecentWorkouts() {
  const target = $("#recentWorkouts");
  const workouts = state.summary?.recent_workouts || [];
  if (!workouts.length) {
    target.className = "timeline empty-state";
    target.textContent = "No workouts logged yet.";
    return;
  }
  target.className = "timeline";
  target.innerHTML = workouts
    .map(
      (workout) => `
        <article class="timeline-item">
          <strong>${escapeHtml(workout.exercise)}</strong>
          <div class="meta-row">
            <span>${formatDate(workout.date)}</span>
            <span>${escapeHtml(workout.body_part)}</span>
            <span>${workout.sets} x ${workout.reps}</span>
            <span>${number(workout.weight)} kg</span>
          </div>
        </article>
      `,
    )
    .join("");
}

async function startScanCamera() {
  try {
    state.scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    $("#scanVideo").srcObject = state.scanStream;
    $("#cameraStatus").textContent = "Camera live";
    toast("Camera started.");
  } catch (error) {
    $("#cameraStatus").textContent = "Camera blocked";
    toast("Camera unavailable. You can still add images from files.");
  }
}

function captureScanImage() {
  const video = $("#scanVideo");
  if (!video.srcObject || !video.videoWidth) {
    toast("Start the camera first, or add images from files.");
    return;
  }
  const image = captureVideoFrame(video, $("#scanCanvas"), 960, 0.82);
  addScanImage(image, poses[state.poseIndex].label);
  state.poseIndex = (state.poseIndex + 1) % poses.length;
  updatePosePrompt();
}

function handleImageUpload(event) {
  const files = Array.from(event.target.files || []);
  files.slice(0, 8).forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = () => addScanImage(reader.result, `Upload ${index + 1}`);
    reader.readAsDataURL(file);
  });
  event.target.value = "";
}

function addScanImage(dataUrl, label) {
  state.scanImages.push({ dataUrl, label });
  if (state.scanImages.length > 8) state.scanImages.shift();
  renderScanShots();
}

function renderScanShots() {
  const target = $("#scanShots");
  target.innerHTML = state.scanImages
    .map(
      (shot, index) => `
        <button class="shot-card" type="button" data-remove-shot="${index}" title="Remove image">
          <img src="${shot.dataUrl}" alt="">
          <span>${escapeHtml(shot.label)}</span>
        </button>
      `,
    )
    .join("");
  $$("[data-remove-shot]").forEach((button) => {
    button.addEventListener("click", () => {
      state.scanImages.splice(Number(button.dataset.removeShot), 1);
      renderScanShots();
    });
  });
}

function updatePosePrompt() {
  const pose = poses[state.poseIndex];
  $("#posePrompt").textContent = pose.label;
  $("#poseInstruction").textContent = pose.cue;
  $("#poseAvatar").dataset.pose = pose.pose;
}

async function submitScan(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const profile = Object.fromEntries(form.entries());
  const payload = {
    profile,
    images: state.scanImages.map((item) => item.dataUrl),
    use_ai: $("#useAiScan").checked,
  };
  $("#scanResults").className = "result-grid empty-state";
  $("#scanResults").textContent = "Analyzing scan...";
  try {
    const data = await api("/api/scans", { method: "POST", body: JSON.stringify(payload) });
    renderScanResults(data.result);
    toast("Body composition estimate saved.");
    loadDashboard();
  } catch (error) {
    $("#scanResults").textContent = error.message;
    toast(error.message);
  }
}

function renderScanResults(result) {
  const cards = [
    ["Body fat", `${result.body_fat_percent}%`, `+/- ${result.uncertainty_percent}% uncertainty`],
    ["Confidence", `${result.confidence}%`, result.method],
    ["Fat mass", valueOrDash(result.fat_mass_kg, "kg"), "Estimated adipose mass"],
    ["Lean mass", valueOrDash(result.lean_mass_kg, "kg"), "Everything outside fat mass"],
    ["BMI", valueOrDash(result.bmi, ""), "Height and weight ratio"],
    ["FFMI", valueOrDash(result.ffmi, ""), "Lean mass adjusted for height"],
    ["Category", capitalize(result.classification), result.recommendation],
    ["Inputs", `${result.image_count} images`, `${result.measurements_used} measurements used`],
  ];
  $("#scanResults").className = "result-grid";
  $("#scanResults").innerHTML =
    cards
      .map(
        ([label, value, copy]) => `
          <article class="result-card">
            <span>${label}</span>
            <strong>${value}</strong>
            <p>${escapeHtml(copy || "")}</p>
          </article>
        `,
      )
      .join("") +
    `<article class="result-card notes"><span>AI / analysis notes</span><p>${escapeHtml(result.ai_notes || "")}</p></article>
     <article class="result-card notes"><span>Limits</span><p>${escapeHtml(result.disclaimer || "")}</p></article>`;
}

async function saveWorkout(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  try {
    await api("/api/workouts", { method: "POST", body: JSON.stringify(payload) });
    event.currentTarget.reset();
    initializeDates();
    toast("Workout saved.");
    await loadWorkouts();
    await loadDashboard();
  } catch (error) {
    toast(error.message);
  }
}

async function loadWorkouts() {
  try {
    const [workouts, progress] = await Promise.all([
      api("/api/workouts"),
      api("/api/workouts/progress"),
    ]);
    state.workouts = workouts.workouts || [];
    renderWorkoutList();
    drawProgressChart($("#loggerChart"), progress || []);
  } catch (error) {
    toast(error.message);
  }
}

function renderWorkoutList() {
  const target = $("#workoutList");
  if (!state.workouts.length) {
    target.className = "workout-list empty-state";
    target.textContent = "No workouts yet.";
    return;
  }
  target.className = "workout-list";
  target.innerHTML = state.workouts
    .map(
      (workout) => `
        <article class="workout-item">
          <div>
            <strong>${escapeHtml(workout.exercise)}</strong>
            <div class="meta-row">
              <span>${formatDate(workout.date)}</span>
              <span>${escapeHtml(workout.body_part)}</span>
              <span>${workout.sets} sets</span>
              <span>${workout.reps} reps</span>
              <span>${number(workout.weight)} kg</span>
              <span>RPE ${workout.rpe}</span>
              <span>${workout.duration} min</span>
            </div>
            ${workout.notes ? `<p>${escapeHtml(workout.notes)}</p>` : ""}
          </div>
          <button class="delete-btn" data-delete-workout="${workout.id}" type="button" title="Delete workout">X</button>
        </article>
      `,
    )
    .join("");
  $$("[data-delete-workout]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/workouts/${button.dataset.deleteWorkout}`, { method: "DELETE" });
      toast("Workout deleted.");
      loadWorkouts();
      loadDashboard();
    });
  });
}

function drawProgressChart(canvas, data) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#101316";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = 24 + i * ((height - 58) / 4);
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
  }

  if (!data.length) {
    ctx.fillStyle = "#9da9a5";
    ctx.font = "16px Segoe UI, sans-serif";
    ctx.fillText("No progress data yet", 42, height / 2);
    return;
  }

  const values = data.map((item) => Number(item.volume || 0));
  const max = Math.max(...values, 1);
  const barArea = width - 70;
  const barWidth = Math.max(8, Math.min(30, barArea / data.length - 6));
  data.forEach((item, index) => {
    const x = 46 + index * (barArea / data.length);
    const barHeight = (Number(item.volume || 0) / max) * (height - 72);
    const y = height - 36 - barHeight;
    const gradient = ctx.createLinearGradient(0, y, 0, height - 36);
    gradient.addColorStop(0, "#71d08b");
    gradient.addColorStop(1, "#4db6ac");
    ctx.fillStyle = gradient;
    roundedRect(ctx, x, y, barWidth, barHeight, 5);
    ctx.fill();
  });

  ctx.fillStyle = "#9da9a5";
  ctx.font = "12px Segoe UI, sans-serif";
  const first = data[0]?.date ? formatShortDate(data[0].date) : "";
  const last = data[data.length - 1]?.date ? formatShortDate(data[data.length - 1].date) : "";
  ctx.fillText(first, 42, height - 12);
  ctx.fillText(last, width - 70, height - 12);
  ctx.fillText(`${number(Math.round(max))} kg volume`, 42, 18);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function renderPrograms() {
  const parts = Object.keys(state.programs);
  $("#bodyPartTabs").innerHTML = parts
    .map((part) => `<button type="button" data-part="${part}" class="${part === state.selectedPart ? "active" : ""}">${part}</button>`)
    .join("");
  $$("[data-part]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPart = button.dataset.part;
      state.selectedProgramIndex = 0;
      state.selectedExerciseIndex = 0;
      renderPrograms();
    });
  });

  const programs = state.programs[state.selectedPart] || [];
  $("#programList").innerHTML = programs
    .map(
      (program, index) => `
        <article class="program-card ${index === state.selectedProgramIndex ? "active" : ""}" data-program="${index}">
          <strong>${escapeHtml(program.name)}</strong>
          <div class="meta-row">
            <span>${escapeHtml(program.level)}</span>
            <span>${escapeHtml(program.schedule)}</span>
          </div>
          <ul>${program.exercises.map((item, exerciseIndex) => `<li><button type="button" data-exercise-program="${index}" data-exercise="${exerciseIndex}" class="${index === state.selectedProgramIndex && exerciseIndex === state.selectedExerciseIndex ? "active" : ""}">${escapeHtml(item)}</button></li>`).join("")}</ul>
        </article>
      `,
    )
    .join("");
  $$("[data-program]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedProgramIndex = Number(card.dataset.program);
      state.selectedExerciseIndex = 0;
      renderPrograms();
    });
  });
  $$("[data-exercise]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedProgramIndex = Number(button.dataset.exerciseProgram);
      state.selectedExerciseIndex = Number(button.dataset.exercise);
      renderPrograms();
    });
  });
  renderMovementInfo();
}

function currentProgram() {
  return (state.programs[state.selectedPart] || [])[state.selectedProgramIndex];
}

function renderMovementInfo() {
  const program = currentProgram();
  if (!program) return;
  const exercise = program.exercises[state.selectedExerciseIndex] || program.exercises[0];
  $("#movementTitle").textContent = exercise;
  $("#movementCues").innerHTML = program.cues.map((cue) => `<div class="cue">${escapeHtml(cue)}</div>`).join("");
}

function drawMovement() {
  const canvas = $("#movementCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cycleLength = 80;
    state.movementFrame = (state.movementFrame + 1) % cycleLength;
    const t = (state.movementFrame / cycleLength) * Math.PI * 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#101316";
    ctx.fillRect(0, 0, w, h);
    drawFloor(ctx, w, h);
    drawExerciseDemo(ctx, w, h, t);
  }
  requestAnimationFrame(drawMovement);
}

function drawFloor(ctx, w, h) {
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, h - 80);
  ctx.lineTo(w - 60, h - 80);
  ctx.stroke();
}

function drawExerciseDemo(ctx, w, h, t) {
  const exercise = (currentProgram()?.exercises[state.selectedExerciseIndex] || "").toLowerCase();
  const rep = repProgress(t);

  if (exercise.includes("deadlift") || exercise.includes("hinge") || exercise.includes("pull-through")) {
    drawHinge(ctx, w, h, rep);
  } else if (exercise.includes("hip thrust")) {
    drawHipThrust(ctx, w, h, rep);
  } else if (exercise.includes("bulgarian") || exercise.includes("split squat")) {
    drawSplitSquat(ctx, w, h, rep);
  } else if (exercise.includes("leg curl")) {
    drawLegCurl(ctx, w, h, rep);
  } else if (exercise.includes("calf raise")) {
    drawCalfRaise(ctx, w, h, rep);
  } else if (exercise.includes("row") || exercise.includes("pull-up") || exercise.includes("pulldown") || exercise.includes("face pull")) {
    drawPull(ctx, w, h, rep, exercise);
  } else if (exercise.includes("squat") || exercise.includes("leg press")) {
    drawSquat(ctx, w, h, rep);
  } else if (exercise.includes("crunch")) {
    drawCrunch(ctx, w, h, rep);
  } else if (exercise.includes("plank") || exercise.includes("dead bug") || exercise.includes("pallof")) {
    drawCore(ctx, w, h, rep, exercise);
  } else if (exercise.includes("curl") || exercise.includes("pressdown") || exercise.includes("triceps")) {
    drawArmIsolation(ctx, w, h, rep, exercise);
  } else if (exercise.includes("push-up")) {
    drawPushUp(ctx, w, h, rep);
  } else if (exercise.includes("fly") || exercise.includes("pec") || exercise.includes("lateral raise") || exercise.includes("rear delt") || exercise.includes("y raise")) {
    drawRaiseOrFly(ctx, w, h, rep, exercise);
  } else if (exercise.includes("bench") || exercise.includes("chest")) {
    drawBenchPress(ctx, w, h, rep, exercise);
  } else {
    drawOverheadPress(ctx, w, h, rep);
  }
}

function repProgress(t) {
  return (1 - Math.cos(t)) / 2;
}

function easeJoint(value) {
  return value * value * (3 - 2 * value);
}

function point(x, y) {
  return { x, y };
}

function drawStickFigure(ctx, joints, scale = 1) {
  ctx.strokeStyle = "#dce5df";
  ctx.lineWidth = 12 * scale;
  ctx.lineCap = "round";
  [
    ["headBase", "shoulder"],
    ["shoulder", "hip"],
    ["shoulder", "elbowL"],
    ["elbowL", "handL"],
    ["shoulder", "elbowR"],
    ["elbowR", "handR"],
    ["hip", "kneeL"],
    ["kneeL", "footL"],
    ["hip", "kneeR"],
    ["kneeR", "footR"],
  ].forEach(([a, b]) => {
    if (joints[a] && joints[b]) line(ctx, joints[a].x, joints[a].y, joints[b].x, joints[b].y);
  });

  if (joints.head) {
    ctx.fillStyle = "#f5b84b";
    ctx.beginPath();
    ctx.arc(joints.head.x, joints.head.y, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSquat(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const floor = h - 86;
  const hip = point(w / 2 - 18 * d, floor - 126 + 58 * d);
  const shoulder = point(w / 2 + 10 - 38 * d, floor - 224 + 48 * d);
  const joints = {
    head: point(shoulder.x + 7, shoulder.y - 43),
    headBase: point(shoulder.x + 4, shoulder.y - 18),
    shoulder,
    hip,
    kneeL: point(w / 2 - 66 + 34 * d, floor - 58 + 32 * d),
    footL: point(w / 2 - 78, floor),
    kneeR: point(w / 2 + 66 + 34 * d, floor - 58 + 32 * d),
    footR: point(w / 2 + 86, floor),
    elbowL: point(shoulder.x - 48, shoulder.y + 28),
    handL: point(shoulder.x - 72, shoulder.y + 66),
    elbowR: point(shoulder.x + 48, shoulder.y + 28),
    handR: point(shoulder.x + 72, shoulder.y + 66),
  };
  drawStickFigure(ctx, joints, 1.03);
  drawLabel(ctx, "Squat path: hips sit between heels, knees bend with toes, torso stays braced");
}

function drawHinge(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const floor = h - 86;
  const hip = point(w / 2 - 8 - 46 * d, floor - 116 + 8 * d);
  const shoulder = point(hip.x + 28 + 112 * d, hip.y - 112 + 72 * d);
  const handL = point(shoulder.x - 42 - 8 * d, shoulder.y + 70 + 38 * d);
  const handR = point(shoulder.x - 14 - 8 * d, shoulder.y + 70 + 38 * d);
  const joints = {
    head: point(shoulder.x + 24, shoulder.y - 25),
    headBase: point(shoulder.x + 8, shoulder.y - 7),
    shoulder,
    hip,
    kneeL: point(w / 2 - 55, floor - 48 + 10 * d),
    footL: point(w / 2 - 70, floor),
    kneeR: point(w / 2 + 43, floor - 46 + 10 * d),
    footR: point(w / 2 + 62, floor),
    elbowL: point((shoulder.x + handL.x) / 2, (shoulder.y + handL.y) / 2),
    handL,
    elbowR: point((shoulder.x + handR.x) / 2, (shoulder.y + handR.y) / 2),
    handR,
  };
  drawStickFigure(ctx, joints, 1.03);
  ctx.strokeStyle = "#7bb7ff";
  ctx.lineWidth = 8;
  line(ctx, handL.x - 42, handL.y, handR.x + 42, handR.y);
  drawLabel(ctx, "Hinge path: hips move back, shins nearly vertical, spine stays neutral");
}

function drawPull(ctx, w, h, rep, exercise) {
  const isVertical = exercise.includes("pull-up") || exercise.includes("pulldown");
  if (isVertical) {
    const d = easeJoint(rep);
    const x = w / 2;
    const shoulderY = h - 238 + 34 * d;
    const joints = {
      head: point(x, shoulderY - 42),
      headBase: point(x, shoulderY - 18),
      shoulder: point(x, shoulderY),
      hip: point(x, shoulderY + 92),
      kneeL: point(x - 36, shoulderY + 154),
      footL: point(x - 48, shoulderY + 204),
      kneeR: point(x + 36, shoulderY + 154),
      footR: point(x + 48, shoulderY + 204),
      elbowL: point(x - 74 + 30 * d, shoulderY - 34 + 56 * d),
      handL: point(x - 112, h - 326),
      elbowR: point(x + 74 - 30 * d, shoulderY - 34 + 56 * d),
      handR: point(x + 112, h - 326),
    };
    drawStickFigure(ctx, joints, 1);
    ctx.strokeStyle = "#7bb7ff";
    ctx.lineWidth = 8;
    line(ctx, x - 132, h - 326, x + 132, h - 326);
    drawLabel(ctx, "Vertical pull: elbows drive down, ribs stay stacked, no swinging");
    return;
  }

  const d = easeJoint(rep);
  const hip = point(w / 2 - 62, h - 196);
  const shoulder = point(hip.x + 138, hip.y - 36);
  const elbowX = shoulder.x - 14 - 78 * d;
  const joints = {
    head: point(shoulder.x + 31, shoulder.y - 26),
    headBase: point(shoulder.x + 10, shoulder.y - 8),
    shoulder,
    hip,
    kneeL: point(hip.x - 26, h - 124),
    footL: point(hip.x - 56, h - 86),
    kneeR: point(hip.x + 42, h - 124),
    footR: point(hip.x + 94, h - 86),
    elbowL: point(elbowX, shoulder.y + 34 + 14 * d),
    handL: point(elbowX - 50 + 10 * d, shoulder.y + 74 + 6 * d),
    elbowR: point(elbowX, shoulder.y + 34 + 14 * d),
    handR: point(elbowX - 50 + 10 * d, shoulder.y + 74 + 6 * d),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, "Row path: hinge stays fixed, elbows travel toward hips, torso does not twist");
}

function drawBenchPress(ctx, w, h, rep, exercise) {
  const d = easeJoint(rep);
  const benchY = h - 148;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 12;
  line(ctx, w / 2 - 165, benchY + 28, w / 2 + 145, benchY + 28);
  line(ctx, w / 2 - 112, benchY + 28, w / 2 - 128, h - 86);
  line(ctx, w / 2 + 96, benchY + 28, w / 2 + 112, h - 86);

  const barY = benchY - 88 + 70 * d;
  const shoulder = point(w / 2 - 62, benchY - 8);
  const hip = point(w / 2 + 62, benchY + 3);
  const joints = {
    head: point(w / 2 - 128, benchY - 18),
    headBase: point(w / 2 - 105, benchY - 10),
    shoulder,
    hip,
    kneeL: point(w / 2 + 142, h - 124),
    footL: point(w / 2 + 166, h - 86),
    kneeR: point(w / 2 + 90, h - 124),
    footR: point(w / 2 + 72, h - 86),
    elbowL: point(w / 2 - 88, barY + 32 * d),
    handL: point(w / 2 - 96, barY),
    elbowR: point(w / 2 + 22, barY + 32 * d),
    handR: point(w / 2 + 44, barY),
  };
  drawStickFigure(ctx, joints, 1);
  ctx.strokeStyle = "#7bb7ff";
  ctx.lineWidth = 8;
  line(ctx, w / 2 - 132, barY, w / 2 + 92, barY);
  drawLabel(ctx, "Bench path: shoulders pinned, elbows tuck slightly, bar lowers to lower chest");
}

function drawPushUp(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const floor = h - 86;
  const shoulder = point(w / 2 - 110, floor - 112 + 58 * d);
  const hip = point(w / 2 + 48, floor - 94 + 50 * d);
  const joints = {
    head: point(shoulder.x - 42, shoulder.y - 10),
    headBase: point(shoulder.x - 18, shoulder.y + 2),
    shoulder,
    hip,
    kneeL: point(w / 2 + 126, floor - 42),
    footL: point(w / 2 + 210, floor - 8),
    kneeR: point(w / 2 + 122, floor - 50),
    footR: point(w / 2 + 204, floor - 16),
    elbowL: point(shoulder.x - 26, floor - 46 + 30 * d),
    handL: point(shoulder.x - 56, floor - 2),
    elbowR: point(shoulder.x + 32, floor - 48 + 30 * d),
    handR: point(shoulder.x + 54, floor - 2),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, "Push-up path: rigid body line, elbows bend back, chest moves as one unit");
}

function drawRaiseOrFly(ctx, w, h, rep, exercise) {
  const d = easeJoint(rep);
  const x = w / 2;
  const floor = h - 86;
  const shoulder = point(x, floor - 186);
  const hip = point(x, floor - 94);
  const isFly = exercise.includes("fly") || exercise.includes("pec");
  const armLift = isFly ? 1 - d : d;
  const handY = shoulder.y + (isFly ? 32 - 64 * armLift : 82 - 118 * armLift);
  const reach = isFly ? 92 - 34 * armLift : 46 + 76 * armLift;
  const joints = {
    head: point(x, shoulder.y - 42),
    headBase: point(x, shoulder.y - 18),
    shoulder,
    hip,
    kneeL: point(x - 34, floor - 48),
    footL: point(x - 46, floor),
    kneeR: point(x + 34, floor - 48),
    footR: point(x + 46, floor),
    elbowL: point(x - reach * 0.56, shoulder.y + (handY - shoulder.y) * 0.55),
    handL: point(x - reach, handY),
    elbowR: point(x + reach * 0.56, shoulder.y + (handY - shoulder.y) * 0.55),
    handR: point(x + reach, handY),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, isFly ? "Fly path: soft elbows, arms arc around the chest, shoulders stay set" : "Raise path: elbows lead, torso quiet, shoulders do not shrug early");
}

function drawHipThrust(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const benchY = h - 168;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 12;
  line(ctx, w / 2 - 178, benchY, w / 2 - 64, benchY);
  line(ctx, w / 2 - 160, benchY, w / 2 - 170, h - 86);
  const hip = point(w / 2 + 16, h - 114 - 48 * (1 - d));
  const shoulder = point(w / 2 - 88, benchY - 8);
  const joints = {
    head: point(w / 2 - 148, benchY - 28),
    headBase: point(w / 2 - 124, benchY - 15),
    shoulder,
    hip,
    kneeL: point(w / 2 + 98, h - 132),
    footL: point(w / 2 + 150, h - 86),
    kneeR: point(w / 2 + 58, h - 128),
    footR: point(w / 2 + 106, h - 86),
    elbowL: point(w / 2 - 36, hip.y - 18),
    handL: point(w / 2 + 8, hip.y - 20),
    elbowR: point(w / 2 - 10, hip.y - 18),
    handR: point(w / 2 + 34, hip.y - 20),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, "Hip thrust: ribs down, pelvis rises to lockout, shins finish nearly vertical");
}

function drawSplitSquat(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const floor = h - 86;
  const hip = point(w / 2 - 12, floor - 134 + 54 * d);
  const shoulder = point(hip.x + 4, hip.y - 102);
  const joints = {
    head: point(shoulder.x, shoulder.y - 42),
    headBase: point(shoulder.x, shoulder.y - 18),
    shoulder,
    hip,
    kneeL: point(w / 2 - 78, floor - 72 + 46 * d),
    footL: point(w / 2 - 120, floor),
    kneeR: point(w / 2 + 82, floor - 52 + 34 * d),
    footR: point(w / 2 + 148, floor),
    elbowL: point(shoulder.x - 44, shoulder.y + 54),
    handL: point(shoulder.x - 54, shoulder.y + 100),
    elbowR: point(shoulder.x + 44, shoulder.y + 54),
    handR: point(shoulder.x + 54, shoulder.y + 100),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, "Split squat: front knee tracks toes, back knee drops, pelvis stays square");
}

function drawLegCurl(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const benchY = h - 162;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 12;
  line(ctx, w / 2 - 172, benchY + 20, w / 2 + 142, benchY + 20);
  const kneeY = benchY + 16;
  const heelY = kneeY + 76 - 118 * d;
  const joints = {
    head: point(w / 2 - 160, benchY - 8),
    headBase: point(w / 2 - 132, benchY + 6),
    shoulder: point(w / 2 - 82, benchY + 14),
    hip: point(w / 2 + 44, benchY + 18),
    kneeL: point(w / 2 + 128, kneeY),
    footL: point(w / 2 + 156, heelY),
    kneeR: point(w / 2 + 100, kneeY + 8),
    footR: point(w / 2 + 124, heelY + 8),
    elbowL: point(w / 2 - 116, benchY + 50),
    handL: point(w / 2 - 148, benchY + 68),
    elbowR: point(w / 2 - 66, benchY + 50),
    handR: point(w / 2 - 36, benchY + 68),
  };
  drawStickFigure(ctx, joints, 1);
  drawLabel(ctx, "Leg curl: hips stay down, knees fixed, heels curl toward glutes under control");
}

function drawCalfRaise(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const x = w / 2;
  const floor = h - 86;
  const lift = 26 * (1 - d);
  const shoulder = point(x, floor - 194 - lift);
  const joints = {
    head: point(x, shoulder.y - 42),
    headBase: point(x, shoulder.y - 18),
    shoulder,
    hip: point(x, floor - 98 - lift),
    kneeL: point(x - 32, floor - 48 - lift),
    footL: point(x - 52, floor - 4),
    kneeR: point(x + 32, floor - 48 - lift),
    footR: point(x + 52, floor - 4),
    elbowL: point(x - 42, shoulder.y + 60),
    handL: point(x - 50, shoulder.y + 106),
    elbowR: point(x + 42, shoulder.y + 60),
    handR: point(x + 50, shoulder.y + 106),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, "Calf raise: knees tall, heels lift straight up, pause before lowering");
}

function drawCrunch(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const floor = h - 86;
  const hip = point(w / 2 + 10, floor - 44);
  const shoulder = point(w / 2 - 92 + 48 * d, floor - 58 - 42 * d);
  const joints = {
    head: point(shoulder.x - 34, shoulder.y - 18),
    headBase: point(shoulder.x - 12, shoulder.y - 6),
    shoulder,
    hip,
    kneeL: point(w / 2 + 82, floor - 98),
    footL: point(w / 2 + 148, floor),
    kneeR: point(w / 2 + 46, floor - 92),
    footR: point(w / 2 + 102, floor),
    elbowL: point(shoulder.x - 18, shoulder.y - 40),
    handL: point(shoulder.x - 44, shoulder.y - 34),
    elbowR: point(shoulder.x + 18, shoulder.y - 38),
    handR: point(shoulder.x + 42, shoulder.y - 30),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, "Crunch: ribs curl toward pelvis, hips stay still, neck stays long");
}

function drawOverheadPress(ctx, w, h, rep) {
  const d = easeJoint(rep);
  const x = w / 2;
  const floor = h - 86;
  const shoulder = point(x, floor - 190);
  const hip = point(x, floor - 96);
  const handY = shoulder.y - 34 - 92 * (1 - d);
  const joints = {
    head: point(x, shoulder.y - 42),
    headBase: point(x, shoulder.y - 18),
    shoulder,
    hip,
    kneeL: point(x - 34, floor - 48),
    footL: point(x - 46, floor),
    kneeR: point(x + 34, floor - 48),
    footR: point(x + 46, floor),
    elbowL: point(x - 54, shoulder.y - 8 - 34 * (1 - d)),
    handL: point(x - 58, handY),
    elbowR: point(x + 54, shoulder.y - 8 - 34 * (1 - d)),
    handR: point(x + 58, handY),
  };
  drawStickFigure(ctx, joints, 1.02);
  ctx.strokeStyle = "#7bb7ff";
  ctx.lineWidth = 8;
  line(ctx, x - 88, handY, x + 88, handY);
  drawLabel(ctx, "Overhead press: ribs down, bar stays close, head moves through at lockout");
}

function drawArmIsolation(ctx, w, h, rep, exercise) {
  const d = easeJoint(rep);
  const x = w / 2;
  const floor = h - 86;
  const curl = exercise.includes("curl");
  const shoulder = point(x, floor - 186);
  const elbowY = shoulder.y + 72;
  const handY = curl ? elbowY + 62 - 94 * (1 - d) : elbowY - 58 + 100 * d;
  const joints = {
    head: point(x, shoulder.y - 42),
    headBase: point(x, shoulder.y - 18),
    shoulder,
    hip: point(x, floor - 94),
    kneeL: point(x - 34, floor - 48),
    footL: point(x - 46, floor),
    kneeR: point(x + 34, floor - 48),
    footR: point(x + 46, floor),
    elbowL: point(x - 46, elbowY),
    handL: point(x - 54, handY),
    elbowR: point(x + 46, elbowY),
    handR: point(x + 54, handY),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, curl ? "Curl path: upper arm quiet, elbow flexes only, no torso sway" : "Triceps path: upper arm fixed, elbows extend fully, shoulders stay down");
}

function drawCore(ctx, w, h, rep, exercise) {
  if (exercise.includes("dead bug")) {
    const d = easeJoint(rep);
    const y = h - 166;
    const joints = {
      head: point(w / 2 - 128, y - 18),
      headBase: point(w / 2 - 104, y - 10),
      shoulder: point(w / 2 - 64, y),
      hip: point(w / 2 + 40, y + 4),
      kneeL: point(w / 2 + 92 - 38 * d, y - 64 + 36 * d),
      footL: point(w / 2 + 120 - 72 * d, y - 124 + 88 * d),
      kneeR: point(w / 2 + 104, y - 58),
      footR: point(w / 2 + 132, y - 118),
      elbowL: point(w / 2 - 48 + 46 * d, y - 70 + 34 * d),
      handL: point(w / 2 - 44 + 92 * d, y - 128 + 90 * d),
      elbowR: point(w / 2 - 72, y - 70),
      handR: point(w / 2 - 78, y - 128),
    };
    drawStickFigure(ctx, joints, 1);
    drawLabel(ctx, "Dead bug: low back stays set while opposite arm and leg move slowly");
    return;
  }

  const breathe = Math.sin(rep * Math.PI) * 5;
  const joints = {
    head: point(w / 2 - 164, h - 184 + breathe),
    headBase: point(w / 2 - 138, h - 178 + breathe),
    shoulder: point(w / 2 - 96, h - 166 + breathe),
    hip: point(w / 2 + 66, h - 154 + breathe),
    kneeL: point(w / 2 + 142, h - 122),
    footL: point(w / 2 + 208, h - 96),
    kneeR: point(w / 2 + 138, h - 132),
    footR: point(w / 2 + 200, h - 106),
    elbowL: point(w / 2 - 136, h - 108),
    handL: point(w / 2 - 112, h - 92),
    elbowR: point(w / 2 - 90, h - 110),
    handR: point(w / 2 - 60, h - 94),
  };
  drawStickFigure(ctx, joints, 1.02);
  drawLabel(ctx, "Plank path: ears, ribs, hips, and heels hold one quiet line");
}

function drawLabel(ctx, text) {
  ctx.fillStyle = "#9da9a5";
  ctx.font = "18px Segoe UI, sans-serif";
  ctx.fillText(text, 34, 40);
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

async function startCoachVideo() {
  try {
    state.coachStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    $("#coachVideo").srcObject = state.coachStream;
    $("#coachCameraStatus").textContent = "Video live";
    toast("Live video started.");
  } catch (error) {
    $("#coachCameraStatus").textContent = "Video blocked";
    toast("Video unavailable.");
  }
}

function attachCoachSnapshot() {
  const video = $("#coachVideo");
  if (!video.srcObject || !video.videoWidth) {
    toast("Start coach video before attaching a snapshot.");
    return;
  }
  state.attachedCoachImage = captureVideoFrame(video, $("#coachCanvas"), 900, 0.82);
  $("#attachedSnapshot").innerHTML = `<img src="${state.attachedCoachImage}" alt="Attached coaching snapshot">`;
  toast("Snapshot attached to your next message.");
}

async function loadCoachHistory() {
  try {
    const data = await api("/api/coach/history");
    renderMessages(data.messages || []);
  } catch (error) {
    toast(error.message);
  }
}

async function sendCoachMessage(event) {
  event.preventDefault();
  const input = $("#coachInput");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  appendMessage("user", message);
  const payload = {
    message,
    use_ai: $("#useAiCoach").checked,
    image: state.attachedCoachImage,
  };
  state.attachedCoachImage = "";
  $("#attachedSnapshot").innerHTML = "";
  appendMessage("assistant", "Thinking...");
  try {
    const data = await api("/api/coach", { method: "POST", body: JSON.stringify(payload) });
    const messages = $$("#chatMessages .message");
    messages[messages.length - 1].querySelector("p").textContent = data.reply;
  } catch (error) {
    const messages = $$("#chatMessages .message");
    messages[messages.length - 1].querySelector("p").textContent = error.message;
  }
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}

function renderMessages(messages) {
  const target = $("#chatMessages");
  if (!messages.length) {
    target.innerHTML = `
      <article class="message assistant">
        <small>Coach</small>
        <p>Log a workout, run a scan, or ask for a plan. I can use your local progress data to guide the next step.</p>
      </article>`;
    return;
  }
  target.innerHTML = messages
    .map(
      (message) => `
        <article class="message ${message.role}">
          <small>${message.role === "user" ? "You" : "Coach"}</small>
          <p>${escapeHtml(message.content)}</p>
        </article>
      `,
    )
    .join("");
  target.scrollTop = target.scrollHeight;
}

function appendMessage(role, content) {
  const target = $("#chatMessages");
  target.insertAdjacentHTML(
    "beforeend",
    `<article class="message ${role}"><small>${role === "user" ? "You" : "Coach"}</small><p>${escapeHtml(content)}</p></article>`,
  );
  target.scrollTop = target.scrollHeight;
}

function updateLiveCue() {
  const videoLive = Boolean($("#coachVideo").srcObject);
  if (!videoLive) return;
  const cues = [
    "Keep the camera side-on for form checks.",
    "Finish the rep before turning your head.",
    "Brace before the hard part of the lift.",
    "Use consistent lighting for better visual feedback.",
    "Pause the top or bottom position for clearer analysis.",
  ];
  $("#liveCue").textContent = cues[Math.floor(Math.random() * cues.length)];
}

function captureVideoFrame(video, canvas, maxWidth, quality) {
  const ratio = video.videoWidth / video.videoHeight;
  const width = Math.min(maxWidth, video.videoWidth);
  const height = Math.round(width / ratio);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -width, 0, width, height);
  ctx.restore();
  return canvas.toDataURL("image/jpeg", quality);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function number(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function valueOrDash(value, suffix) {
  if (value === null || value === undefined || value === "") return "--";
  return `${value}${suffix ? ` ${suffix}` : ""}`;
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function toast(message) {
  const target = $("#toast");
  target.textContent = message;
  target.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => target.classList.remove("visible"), 3300);
}
