# AI Physique Analyzer

A local browser-based fitness app served by Python. It includes body composition scan capture, SQLite workout logging, animated workout programs, gym streak tracking, and an AI coach that can use OpenAI from backend-only configuration.

## Run

Double-click `run_app.bat`, or run:

```powershell
python main.py
```

The app opens at `http://127.0.0.1:8000` by default. If that port is busy, it automatically chooses the next free port.

## Optional AI

Set an OpenAI key on the backend before launching:

```powershell
$env:OPENAI_API_KEY="your-key-here"
python main.py
```

Alternatively, put the key in `.env`, `.openai_api_key`, or `openai_api_key.txt` in the project folder. These files are ignored by git. The browser UI never asks for or sends an API key. Without a backend key, scans and coaching use local fallback logic.

## Data

Workout logs, scan summaries, coach history, and gym visit streak data are stored locally in `physique_analyzer.db`. Workout data can be exported from the Workout Logger screen as CSV.
