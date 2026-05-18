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
          <ul>${program.exercises.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
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
    const t = state.movementFrame / 40;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#101316";
    ctx.fillRect(0, 0, w, h);
    drawFloor(ctx, w, h);
    const part = state.selectedPart;
    if (part === "Legs") drawSquat(ctx, w, h, t);
    else if (part === "Back") drawRow(ctx, w, h, t);
    else if (part === "Shoulders") drawPress(ctx, w, h, t);
    else if (part === "Core") drawPlank(ctx, w, h, t);
    else drawPress(ctx, w, h, t, part === "Chest");
    state.movementFrame += 1;
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

function drawPersonBase(ctx, x, y, scale, phase, mode) {
  ctx.strokeStyle = "#dce5df";
  ctx.lineWidth = 12 * scale;
  ctx.lineCap = "round";
  ctx.fillStyle = "#f5b84b";
  const bob = Math.sin(phase) * 8 * scale;
  const headY = y - 148 * scale + bob;
  ctx.beginPath();
  ctx.arc(x, headY, 18 * scale, 0, Math.PI * 2);
  ctx.fill();
  const shoulderY = y - 112 * scale + bob;
  const hipY = y - 50 * scale + bob;
  line(ctx, x, shoulderY, x, hipY);
  if (mode === "squat") {
    const kneeY = y - 8 * scale + Math.abs(Math.sin(phase)) * 26 * scale;
    line(ctx, x, hipY, x - 44 * scale, kneeY);
    line(ctx, x - 44 * scale, kneeY, x - 72 * scale, y);
    line(ctx, x, hipY, x + 44 * scale, kneeY);
    line(ctx, x + 44 * scale, kneeY, x + 72 * scale, y);
    line(ctx, x - 38 * scale, shoulderY, x + 38 * scale, shoulderY);
    line(ctx, x - 38 * scale, shoulderY, x - 74 * scale, shoulderY + 36 * scale);
    line(ctx, x + 38 * scale, shoulderY, x + 74 * scale, shoulderY + 36 * scale);
  } else if (mode === "row") {
    line(ctx, x, shoulderY, x + 66 * scale, shoulderY + 42 * scale);
    line(ctx, x + 66 * scale, shoulderY + 42 * scale, x + 118 * scale + Math.sin(phase) * 38 * scale, shoulderY + 16 * scale);
    line(ctx, x, hipY, x - 58 * scale, y);
    line(ctx, x, hipY, x + 38 * scale, y);
  } else if (mode === "plank") {
    line(ctx, x - 130 * scale, y - 44 * scale, x + 88 * scale, y - 58 * scale);
    line(ctx, x - 116 * scale, y - 44 * scale, x - 150 * scale, y - 4 * scale);
    line(ctx, x + 88 * scale, y - 58 * scale, x + 152 * scale, y - 18 * scale);
  } else {
    const handY = shoulderY - 58 * scale - Math.sin(phase) * 46 * scale;
    line(ctx, x - 36 * scale, shoulderY, x - 54 * scale, handY);
    line(ctx, x + 36 * scale, shoulderY, x + 54 * scale, handY);
    line(ctx, x, hipY, x - 42 * scale, y);
    line(ctx, x, hipY, x + 42 * scale, y);
    ctx.strokeStyle = "#7bb7ff";
    line(ctx, x - 78 * scale, handY, x + 78 * scale, handY);
  }
}

function drawSquat(ctx, w, h, t) {
  const depth = Math.abs(Math.sin(t));
  drawPersonBase(ctx, w / 2, h - 86 + depth * 36, 1.05, t, "squat");
  drawLabel(ctx, "Squat path: hips down, chest steady, knees track toes");
}

function drawRow(ctx, w, h, t) {
  drawPersonBase(ctx, w / 2 - 40, h - 86, 1.05, t, "row");
  drawLabel(ctx, "Row path: brace, pull elbow back, pause without twisting");
}

function drawPress(ctx, w, h, t, chest = false) {
  drawPersonBase(ctx, w / 2, h - 86, 1.05, t, "press");
  drawLabel(ctx, chest ? "Press path: shoulder blades set, smooth bar path" : "Press path: ribs down, lock out cleanly");
}

function drawPlank(ctx, w, h, t) {
  drawPersonBase(ctx, w / 2, h - 92, 1.08, t, "plank");
  drawLabel(ctx, "Core path: straight line, quiet hips, steady breathing");
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
