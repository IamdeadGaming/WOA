from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from datetime import date, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from socket import socket
from typing import Any
from urllib.parse import parse_qs, urlparse


APP_NAME = "AI Physique Analyzer"
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "physique_analyzer.db"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
API_KEY_FILES = (
    BASE_DIR / ".openai_api_key",
    BASE_DIR / "openai_api_key.txt",
)
ENV_FILE = BASE_DIR / ".env"


def utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def console_write(message: str) -> None:
    stream = getattr(sys, "stdout", None)
    if stream and hasattr(stream, "write"):
        try:
            stream.write(message + "\n")
            stream.flush()
        except OSError:
            pass


def local_today() -> str:
    return date.today().isoformat()


def read_backend_secret(name: str) -> str:
    value = os.getenv(name, "").strip()
    if value:
        return value

    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, raw_value = stripped.split("=", 1)
            if key.strip() == name:
                return raw_value.strip().strip('"').strip("'")

    if name == "OPENAI_API_KEY":
        for path in API_KEY_FILES:
            if path.exists():
                return path.read_text(encoding="utf-8").strip()
    return ""


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                exercise TEXT NOT NULL,
                body_part TEXT NOT NULL,
                sets INTEGER NOT NULL DEFAULT 0,
                reps INTEGER NOT NULL DEFAULT 0,
                weight REAL NOT NULL DEFAULT 0,
                duration INTEGER NOT NULL DEFAULT 0,
                rpe INTEGER NOT NULL DEFAULT 7,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS gym_visits (
                date TEXT PRIMARY KEY,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                profile_json TEXT NOT NULL,
                result_json TEXT NOT NULL,
                image_count INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS coach_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def text_response(
    handler: BaseHTTPRequestHandler,
    body: str | bytes,
    content_type: str = "text/plain; charset=utf-8",
    status: int = 200,
) -> None:
    if isinstance(body, str):
        body = body.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def parse_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    if length > 18_000_000:
        raise ValueError("Request body is too large. Capture fewer or smaller images.")
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in ("", None):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def coerce_int(value: Any, default: int = 0) -> int:
    try:
        if value in ("", None):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def round_one(value: float | None) -> float | None:
    if value is None or math.isnan(value) or math.isinf(value):
        return None
    return round(value, 1)


def classify_body_fat(body_fat: float, sex: str) -> str:
    sex = sex.lower()
    if sex == "female":
        ranges = [
            (14, "essential"),
            (21, "athletic"),
            (25, "fitness"),
            (32, "average"),
            (100, "elevated"),
        ]
    else:
        ranges = [
            (6, "essential"),
            (14, "athletic"),
            (18, "fitness"),
            (25, "average"),
            (100, "elevated"),
        ]
    for threshold, label in ranges:
        if body_fat <= threshold:
            return label
    return "elevated"


def estimate_body_composition(profile: dict[str, Any], image_count: int) -> dict[str, Any]:
    sex = str(profile.get("sex", "male")).lower()
    age = coerce_float(profile.get("age"), 30)
    height_cm = coerce_float(profile.get("height_cm"), 0)
    weight_kg = coerce_float(profile.get("weight_kg"), 0)
    waist_cm = coerce_float(profile.get("waist_cm"), 0)
    neck_cm = coerce_float(profile.get("neck_cm"), 0)
    hip_cm = coerce_float(profile.get("hip_cm"), 0)

    estimates: list[tuple[str, float]] = []
    height_m = height_cm / 100 if height_cm > 0 else 0

    if height_cm > 0 and weight_kg > 0 and age > 0:
        bmi = weight_kg / (height_m * height_m)
        bmi_based = 1.2 * bmi + 0.23 * age
        bmi_based -= 5.4 if sex == "female" else 16.2
        estimates.append(("BMI age formula", clamp(bmi_based, 5, 55)))
    else:
        bmi = 0

    if height_cm > 0 and waist_cm > 0 and neck_cm > 0:
        try:
            height_in = height_cm / 2.54
            waist_in = waist_cm / 2.54
            neck_in = neck_cm / 2.54
            if sex == "female" and hip_cm > 0 and waist_in + hip_cm / 2.54 - neck_in > 0:
                hip_in = hip_cm / 2.54
                navy = 163.205 * math.log10(waist_in + hip_in - neck_in)
                navy -= 97.684 * math.log10(height_in)
                navy -= 78.387
                estimates.append(("US Navy tape estimate", clamp(navy, 8, 60)))
            elif waist_in - neck_in > 0:
                navy = 86.010 * math.log10(waist_in - neck_in)
                navy -= 70.041 * math.log10(height_in)
                navy += 36.76
                estimates.append(("US Navy tape estimate", clamp(navy, 4, 50)))
        except (ValueError, ZeroDivisionError):
            pass

    if not estimates:
        body_fat = 20.0
        methods = ["placeholder until height, weight, and tape measurements are added"]
    else:
        # Tape and BMI disagree in real life; a conservative average is clearer than false precision.
        weights = [1.25 if "Navy" in name else 1.0 for name, _ in estimates]
        body_fat = sum(value * weight for (_, value), weight in zip(estimates, weights)) / sum(weights)
        methods = [name for name, _ in estimates]

    measurements_provided = sum(
        1
        for value in (height_cm, weight_kg, waist_cm, neck_cm, hip_cm if sex == "female" else 0)
        if value > 0
    )
    image_bonus = min(image_count, 6) * 0.55
    measurement_bonus = min(measurements_provided, 5) * 0.45
    uncertainty = clamp(10.0 - image_bonus - measurement_bonus, 3.5, 11.5)
    confidence = int(clamp(100 - uncertainty * 7.5, 25, 82))

    fat_mass = weight_kg * body_fat / 100 if weight_kg else None
    lean_mass = weight_kg - fat_mass if weight_kg and fat_mass is not None else None
    ffmi = lean_mass / (height_m * height_m) if lean_mass and height_m else None

    return {
        "body_fat_percent": round_one(body_fat),
        "uncertainty_percent": round_one(uncertainty),
        "confidence": confidence,
        "classification": classify_body_fat(body_fat, sex),
        "bmi": round_one(bmi) if bmi else None,
        "ffmi": round_one(ffmi),
        "fat_mass_kg": round_one(fat_mass),
        "lean_mass_kg": round_one(lean_mass),
        "method": " + ".join(methods),
        "image_count": image_count,
        "measurements_used": measurements_provided,
        "recommendation": build_scan_recommendation(body_fat, sex),
        "disclaimer": "Estimate only. Lighting, pose, hydration, pump, clothing, and camera angle can shift visual analysis.",
    }


def build_scan_recommendation(body_fat: float, sex: str) -> str:
    category = classify_body_fat(body_fat, sex)
    if category in {"essential", "athletic"}:
        return "Prioritize performance, recovery, and stable nutrition. Avoid aggressive cutting unless supervised."
    if category == "fitness":
        return "A lean recomp phase fits well: progressive lifting, high protein, and small calorie changes."
    if category == "average":
        return "Use a measured cut or recomp: track weekly weight averages, strength, waist, and energy."
    return "Begin with sustainable habits: steps, resistance training, protein consistency, and a mild calorie deficit."


def compute_streak(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute("SELECT date FROM gym_visits ORDER BY date DESC").fetchall()
    dates: list[date] = []
    for row in rows:
        try:
            dates.append(date.fromisoformat(row["date"]))
        except (ValueError, TypeError):
            continue
    if not dates:
        return {"count": 0, "last_visit": None, "days_since": None, "resets_in": None}

    today = date.today()
    latest = max(dates)
    days_since = (today - latest).days
    if days_since >= 3:
        return {"count": 0, "last_visit": latest.isoformat(), "days_since": days_since, "resets_in": 0}

    streak = 1
    ordered = sorted(set(dates), reverse=True)
    previous = ordered[0]
    for item in ordered[1:]:
        gap = (previous - item).days
        if 0 < gap <= 3:
            streak += 1
            previous = item
            continue
        break
    return {
        "count": streak,
        "last_visit": latest.isoformat(),
        "days_since": days_since,
        "resets_in": max(0, 3 - days_since),
    }


def workout_progress(conn: sqlite3.Connection, days: int = 30) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT date,
               COUNT(*) AS sessions,
               SUM(sets * reps * weight) AS volume,
               SUM(duration) AS minutes,
               AVG(rpe) AS avg_rpe
        FROM workouts
        GROUP BY date
        ORDER BY date DESC
        LIMIT ?
        """,
        (days,),
    ).fetchall()
    return [row_to_dict(row) for row in reversed(rows)]


def summarize(conn: sqlite3.Connection) -> dict[str, Any]:
    recent_workouts = [
        row_to_dict(row)
        for row in conn.execute(
            "SELECT * FROM workouts ORDER BY date DESC, id DESC LIMIT 8"
        ).fetchall()
    ]
    totals = conn.execute(
        """
        SELECT COUNT(*) AS total_workouts,
               COALESCE(SUM(sets * reps * weight), 0) AS total_volume,
               COALESCE(SUM(duration), 0) AS total_minutes,
               COUNT(DISTINCT date) AS active_days
        FROM workouts
        """
    ).fetchone()
    last_scan_row = conn.execute(
        "SELECT * FROM scans ORDER BY created_at DESC, id DESC LIMIT 1"
    ).fetchone()
    last_scan = None
    if last_scan_row:
        scan = row_to_dict(last_scan_row)
        scan["profile"] = json.loads(scan.pop("profile_json"))
        scan["result"] = json.loads(scan.pop("result_json"))
        last_scan = scan

    return {
        "app": APP_NAME,
        "today": local_today(),
        "has_backend_api_key": bool(openai_api_key()),
        "model": OPENAI_MODEL,
        "streak": compute_streak(conn),
        "totals": row_to_dict(totals),
        "recent_workouts": recent_workouts,
        "progress": workout_progress(conn),
        "last_scan": last_scan,
    }


def insert_gym_visit(conn: sqlite3.Connection, visit_date: str, source: str) -> None:
    conn.execute(
        """
        INSERT INTO gym_visits(date, source, created_at)
        VALUES(?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET source = excluded.source
        """,
        (visit_date, source, utc_now()),
    )


def openai_api_key() -> str:
    return read_backend_secret("OPENAI_API_KEY")


def call_openai(
    prompt: str,
    *,
    instructions: str,
    images: list[str] | None = None,
    api_key: str = "",
    max_output_tokens: int = 700,
) -> str:
    if not api_key:
        raise RuntimeError("No OpenAI API key was provided.")

    content: list[dict[str, Any]] = [{"type": "input_text", "text": prompt}]
    for data_url in images or []:
        if isinstance(data_url, str) and data_url.startswith("data:image"):
            content.append({"type": "input_image", "image_url": data_url, "detail": "low"})

    payload = {
        "model": OPENAI_MODEL,
        "instructions": instructions,
        "input": [{"role": "user", "content": content}],
        "max_output_tokens": max_output_tokens,
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error {exc.code}: {detail[:600]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenAI connection failed: {exc.reason}") from exc

    return extract_response_text(data)


def extract_response_text(data: dict[str, Any]) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"].strip()
    parts: list[str] = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts).strip() or "The AI returned an empty response."


def local_scan_notes(result: dict[str, Any], profile: dict[str, Any]) -> str:
    body_fat = result.get("body_fat_percent")
    uncertainty = result.get("uncertainty_percent")
    classification = result.get("classification")
    return (
        f"Local estimate: {body_fat}% body fat (+/- {uncertainty}%). "
        f"Category: {classification}. Use the same lighting, distance, relaxed posture, "
        "and tape points each time so trends are more useful than any single scan."
    )


def local_coach_reply(message: str, summary: dict[str, Any]) -> str:
    msg = message.lower()
    streak = summary["streak"]["count"]
    recent = summary.get("recent_workouts", [])
    if any(word in msg for word in ("cut", "fat", "lean", "diet")):
        return (
            "For a cut, start with a small calorie deficit, protein at each meal, and keep training loads heavy enough "
            "to protect strength. Track waist, weight average, and gym performance weekly, not daily mood swings."
        )
    if any(word in msg for word in ("bulk", "muscle", "gain")):
        return (
            "For muscle gain, use a modest surplus, 10-20 hard sets per target muscle each week, and add reps or load "
            "when your top sets stop feeling like a grind. Keep the surplus small so the scan trend stays clean."
        )
    if any(word in msg for word in ("form", "video", "squat", "bench", "deadlift", "row")):
        return (
            "Use the live video panel for a set, then compare three things: stable setup, controlled eccentric, and a "
            "repeatable path each rep. Send the movement name here and I can give a tighter checklist."
        )
    if recent:
        return (
            f"You have a {streak}-visit streak and recent training logged. A good next move is to repeat one key lift, "
            "add one rep or a small amount of load, then finish with an accessory that targets the weakest body part."
        )
    return (
        "Start by logging today's workout, then pick a simple 3-day plan. Once I see a few sessions, I can suggest "
        "progression targets and recovery adjustments."
    )


class AppHandler(BaseHTTPRequestHandler):
    server_version = "PhysiqueAnalyzer/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        stream = getattr(sys, "stderr", None)
        if stream and hasattr(stream, "write"):
            try:
                stream.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))
                stream.flush()
            except OSError:
                pass

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/health":
                json_response(self, {"ok": True, "time": utc_now()})
            elif path == "/api/summary":
                with connect_db() as conn:
                    json_response(self, summarize(conn))
            elif path == "/api/workouts":
                self.get_workouts(parsed.query)
            elif path == "/api/workouts/progress":
                with connect_db() as conn:
                    json_response(self, workout_progress(conn, 60))
            elif path == "/api/scans":
                self.get_scans()
            elif path == "/api/coach/history":
                self.get_coach_history()
            elif path == "/api/export/workouts.csv":
                self.export_workouts_csv()
            else:
                self.serve_static(path)
        except Exception as exc:  # noqa: BLE001 - web handler should return JSON errors.
            json_response(self, {"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            payload = parse_json_body(self)
            if parsed.path == "/api/workouts":
                self.create_workout(payload)
            elif parsed.path == "/api/gym-visits":
                self.create_gym_visit(payload)
            elif parsed.path == "/api/scans":
                self.create_scan(payload)
            elif parsed.path == "/api/coach":
                self.create_coach_message(payload)
            else:
                json_response(self, {"error": "Not found"}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # noqa: BLE001
            json_response(self, {"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/workouts/"):
                workout_id = int(parsed.path.rsplit("/", 1)[-1])
                with connect_db() as conn:
                    conn.execute("DELETE FROM workouts WHERE id = ?", (workout_id,))
                    conn.commit()
                json_response(self, {"ok": True})
            else:
                json_response(self, {"error": "Not found"}, HTTPStatus.NOT_FOUND)
        except Exception as exc:  # noqa: BLE001
            json_response(self, {"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def serve_static(self, path: str) -> None:
        routes = {
            "/": "index.html",
            "/index.html": "index.html",
            "/styles.css": "styles.css",
            "/app.js": "app.js",
        }
        file_name = routes.get(path)
        if not file_name:
            json_response(self, {"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return

        file_path = BASE_DIR / file_name
        if not file_path.exists():
            json_response(self, {"error": f"Missing static file: {file_name}"}, HTTPStatus.NOT_FOUND)
            return
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
        }
        text_response(self, file_path.read_bytes(), content_types.get(file_path.suffix, "application/octet-stream"))

    def get_workouts(self, query: str) -> None:
        params = parse_qs(query)
        workout_date = params.get("date", [None])[0]
        with connect_db() as conn:
            if workout_date:
                rows = conn.execute(
                    "SELECT * FROM workouts WHERE date = ? ORDER BY id DESC",
                    (workout_date,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM workouts ORDER BY date DESC, id DESC LIMIT 200"
                ).fetchall()
        json_response(self, {"workouts": [row_to_dict(row) for row in rows]})

    def create_workout(self, payload: dict[str, Any]) -> None:
        exercise = str(payload.get("exercise", "")).strip()
        if not exercise:
            raise ValueError("Exercise is required.")
        workout_date = str(payload.get("date") or local_today())
        body_part = str(payload.get("body_part") or "Full body").strip()
        with connect_db() as conn:
            cursor = conn.execute(
                """
                INSERT INTO workouts(date, exercise, body_part, sets, reps, weight, duration, rpe, notes, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    workout_date,
                    exercise,
                    body_part,
                    coerce_int(payload.get("sets"), 0),
                    coerce_int(payload.get("reps"), 0),
                    coerce_float(payload.get("weight"), 0),
                    coerce_int(payload.get("duration"), 0),
                    coerce_int(payload.get("rpe"), 7),
                    str(payload.get("notes") or "").strip(),
                    utc_now(),
                ),
            )
            insert_gym_visit(conn, workout_date, "workout")
            conn.commit()
            row = conn.execute("SELECT * FROM workouts WHERE id = ?", (cursor.lastrowid,)).fetchone()
        json_response(self, {"workout": row_to_dict(row), "ok": True}, HTTPStatus.CREATED)

    def create_gym_visit(self, payload: dict[str, Any]) -> None:
        visit_date = str(payload.get("date") or local_today())
        with connect_db() as conn:
            insert_gym_visit(conn, visit_date, "manual")
            conn.commit()
            streak = compute_streak(conn)
        json_response(self, {"ok": True, "streak": streak})

    def create_scan(self, payload: dict[str, Any]) -> None:
        profile = payload.get("profile") or {}
        images = payload.get("images") or []
        images = [image for image in images if isinstance(image, str) and image.startswith("data:image")]
        result = estimate_body_composition(profile, len(images))

        ai_notes = ""
        ai_error = ""
        if payload.get("use_ai"):
            try:
                prompt = (
                    "Review this physique scan context. Give concise coaching-oriented notes, "
                    "call out uncertainty, and avoid medical diagnosis. Local numeric estimate:\n"
                    f"{json.dumps(result, ensure_ascii=True)}\nProfile:\n{json.dumps(profile, ensure_ascii=True)}"
                )
                ai_notes = call_openai(
                    prompt,
                    instructions=(
                        "You are a careful physique analysis assistant. You may estimate visible patterns, "
                        "but you must be transparent about uncertainty and avoid diagnosing health conditions."
                    ),
                    images=images[:4],
                    api_key=openai_api_key(),
                )
            except Exception as exc:  # noqa: BLE001
                ai_error = str(exc)

        result["ai_notes"] = ai_notes or local_scan_notes(result, profile)
        result["ai_error"] = ai_error
        with connect_db() as conn:
            cursor = conn.execute(
                "INSERT INTO scans(created_at, profile_json, result_json, image_count) VALUES(?, ?, ?, ?)",
                (utc_now(), json.dumps(profile), json.dumps(result), len(images)),
            )
            conn.commit()
            scan_id = cursor.lastrowid
        json_response(self, {"ok": True, "scan_id": scan_id, "result": result}, HTTPStatus.CREATED)

    def get_scans(self) -> None:
        with connect_db() as conn:
            rows = conn.execute("SELECT * FROM scans ORDER BY created_at DESC LIMIT 30").fetchall()
        scans: list[dict[str, Any]] = []
        for row in rows:
            scan = row_to_dict(row)
            scan["profile"] = json.loads(scan.pop("profile_json"))
            scan["result"] = json.loads(scan.pop("result_json"))
            scans.append(scan)
        json_response(self, {"scans": scans})

    def create_coach_message(self, payload: dict[str, Any]) -> None:
        message = str(payload.get("message") or "").strip()
        if not message:
            raise ValueError("Message is required.")
        with connect_db() as conn:
            conn.execute(
                "INSERT INTO coach_messages(role, content, created_at) VALUES('user', ?, ?)",
                (message, utc_now()),
            )
            summary = summarize(conn)

            reply = ""
            ai_error = ""
            if payload.get("use_ai"):
                try:
                    prompt = (
                        f"User message: {message}\n\n"
                        "Local training and scan context:\n"
                        f"{json.dumps(summary, ensure_ascii=True)[:6500]}"
                    )
                    images = []
                    if isinstance(payload.get("image"), str):
                        images.append(payload["image"])
                    reply = call_openai(
                        prompt,
                        instructions=(
                            "You are an AI workout coach inside a local fitness app. Be practical, concise, "
                            "specific, and safety-aware. For pain, dizziness, injury, or medical concerns, "
                            "tell the user to stop and consult a qualified professional."
                        ),
                        images=images[:1],
                        api_key=openai_api_key(),
                        max_output_tokens=850,
                    )
                except Exception as exc:  # noqa: BLE001
                    ai_error = str(exc)
            if not reply:
                reply = local_coach_reply(message, summary)
                if ai_error:
                    reply += f"\n\nAI fallback note: {ai_error}"
            conn.execute(
                "INSERT INTO coach_messages(role, content, created_at) VALUES('assistant', ?, ?)",
                (reply, utc_now()),
            )
            conn.commit()
        json_response(self, {"ok": True, "reply": reply})

    def get_coach_history(self) -> None:
        with connect_db() as conn:
            rows = conn.execute(
                "SELECT * FROM coach_messages ORDER BY id DESC LIMIT 40"
            ).fetchall()
        messages = [row_to_dict(row) for row in reversed(rows)]
        json_response(self, {"messages": messages})

    def export_workouts_csv(self) -> None:
        with connect_db() as conn:
            rows = conn.execute("SELECT * FROM workouts ORDER BY date ASC, id ASC").fetchall()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["date", "exercise", "body_part", "sets", "reps", "weight", "duration", "rpe", "notes"])
        for row in rows:
            writer.writerow(
                [
                    row["date"],
                    row["exercise"],
                    row["body_part"],
                    row["sets"],
                    row["reps"],
                    row["weight"],
                    row["duration"],
                    row["rpe"],
                    row["notes"],
                ]
            )
        text_response(self, output.getvalue(), "text/csv; charset=utf-8")


def find_free_port(start: int) -> int:
    for port in range(start, start + 50):
        with socket() as sock:
            try:
                sock.bind((DEFAULT_HOST, port))
            except OSError:
                continue
            return port
    raise RuntimeError("No free local port found.")


def run_server(port: int, open_browser: bool) -> None:
    init_db()
    chosen_port = find_free_port(port)
    server = ThreadingHTTPServer((DEFAULT_HOST, chosen_port), AppHandler)
    url = f"http://{DEFAULT_HOST}:{chosen_port}"
    console_write(f"{APP_NAME} running at {url}")
    console_write(f"Database: {DB_PATH}")
    console_write("Set OPENAI_API_KEY, .env, .openai_api_key, or openai_api_key.txt for AI-backed features.")
    if open_browser:
        time.sleep(0.25)
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        console_write("\nStopping server.")
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Starting port for the local web app.")
    parser.add_argument("--no-browser", action="store_true", help="Start the server without opening a browser.")
    parser.add_argument("--init-db", action="store_true", help="Initialize the SQLite database and exit.")
    args = parser.parse_args()
    if args.init_db:
        init_db()
        console_write(f"Initialized {DB_PATH}")
        return
    run_server(args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
