# Aether Voice - Conversational Voice Agent Dashboard

This project is a state-of-the-art conversational voice agent with a beautiful, responsive HTML5 Canvas wave visualizer and real-time tool/function execution logs. It is powered by LiveKit Cloud, Google Gemini, and a FastAPI backend.

---

## Directory Structure

```
livekit-voice-agent/
├── backend/
│   ├── agent.py          # LiveKit Agent Worker (handles speech-to-text, LLM, text-to-speech)
│   ├── server.py         # FastAPI Token Server & Web Host (serves frontend, generates LiveKit tokens)
│   ├── observability.py  # Extracted OpenTelemetry/Langfuse setup configuration module
│   ├── sip_call.py       # Programmatic SIP participant calling utility
│   ├── Dockerfile        # Docker container definition for deployment
│   └── pyproject.toml    # Backend python project configuration
├── frontend/
│   ├── index.html        # HTML dashboard interface
│   ├── styles.css        # Premium Glassmorphic design and CSS visualizer styles
│   └── app.js            # LiveKit Client connection & AudioContext analyser rendering loop
├── .env                  # Environment configurations (LiveKit API Keys, Gemini API Keys, etc.)
└── README.md             # Running & Deployment documentation
```

---

## Installation & Setup

Ensure you have Python 3.11+ and `uv` package manager installed.

### 1. Install dependencies
From the project root (`livekit-voice-agent/`), run:
```bash
uv pip install -r backend/pyproject.toml
```

### 2. Configure Environment Variables
Confirm your `.env` file at the root contains the valid credentials:
```env
LIVEKIT_URL=wss://your-livekit-url.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
GEMINI_API_KEY=your-gemini-api-key

# Optional: Langfuse Observability
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

---

## Running the Application

To run the complete system, you need to run the **API Web Server** and the **Voice Agent Worker** concurrently.

### Step 1: Start the API & Frontend Server
Run the FastAPI web server:
```bash
python backend/server.py
```
This runs the server at [http://localhost:8000](http://localhost:8000). The frontend will be loaded automatically at this address.

### Step 2: Start the LiveKit Voice Agent Worker
In a separate terminal tab/window, run:
```bash
python backend/agent.py dev
```
This starts the agent in development/worker mode. It connects to your LiveKit room and waits for incoming client sessions.

---

## How it Works

1. **Connection & Authentication**: When you click **Start Conversation** in the frontend, it requests a token from `/api/token` (FastAPI). The server generates a JWT signed with your LiveKit API keys.
2. **Audio Streams & Visualization**: The frontend connects to the LiveKit room. It establishes a Web Audio API `AudioContext` and binds both your microphone track and the agent's incoming audio track to an `AnalyserNode`. The Canvas renders gorgeous overlapping glowing waves responding in real-time to speech amplitudes.
3. **Data Channel Events**: When the agent calls tools (`get_weather` or `book_appointment`), it broadcasts a custom payload via LiveKit's low-latency data channel. The frontend intercepts this to display card logs in the dashboard side panel immediately.
