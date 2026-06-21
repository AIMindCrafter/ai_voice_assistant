import os
import sys
import logging
import subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from livekit import api
from dotenv import load_dotenv

# Load env variables from root folder
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(parent_dir, ".env")
load_dotenv(dotenv_path=env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("server")

# Subprocess tracker for the LiveKit Agent worker
agent_process = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent_process
    current_dir = os.path.dirname(os.path.abspath(__file__))
    agent_path = os.path.join(current_dir, "agent.py")
    python_executable = sys.executable
    
    logger.info(f"⚡ Automatically launching LiveKit Agent worker: {python_executable} {agent_path} dev")
    try:
        agent_process = subprocess.Popen(
            [python_executable, agent_path, "dev"],
            cwd=parent_dir,
        )
    except Exception as e:
        logger.error(f"❌ Failed to launch LiveKit Agent worker: {e}")
        
    yield
    
    if agent_process:
        logger.info("⚡ Stopping LiveKit Agent worker...")
        agent_process.terminate()
        try:
            agent_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            logger.warning("⚠️ Agent worker did not terminate gracefully, force killing...")
            agent_process.kill()
        logger.info("⚡ LiveKit Agent worker stopped.")

app = FastAPI(title="LiveKit Voice Agent Backend", lifespan=lifespan)

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/token")
async def get_token(room: str = "voice-agent-room", identity: str = "web-client"):
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    url = os.getenv("LIVEKIT_URL")

    if not api_key or not api_secret:
        logger.error("LIVEKIT_API_KEY or LIVEKIT_API_SECRET not found in env.")
        raise HTTPException(
            status_code=500, 
            detail="Server configuration error: LiveKit API credentials are missing."
        )

    try:
        # Create token
        token = api.AccessToken(api_key, api_secret) \
            .with_identity(identity) \
            .with_name(identity) \
            .with_grants(api.VideoGrants(
                room_join=True,
                room=room,
            ))
        
        jwt_token = token.to_jwt()
        logger.info(f"Generated LiveKit token for user identity '{identity}' in room '{room}'")

        # Explicitly dispatch the agent worker to this room in the background
        async def dispatch_agent():
            try:
                # Rest API client requires http/https schema
                api_url = url.replace("wss://", "https://").replace("ws://", "http://")
                lkapi = api.LiveKitAPI(url=api_url, api_key=api_key, api_secret=api_secret)
                
                logger.info(f"Dispatching agent 'voice_assistant' to room '{room}' via: {api_url}")
                await lkapi.agent_dispatch.create_dispatch(
                    api.CreateAgentDispatchRequest(
                        agent_name="voice_assistant",
                        room=room
                    )
                )
                await lkapi.aclose()
                logger.info(f"Successfully dispatched agent 'voice_assistant' to room '{room}'")
            except Exception as dispatch_err:
                logger.error(f"Failed to dispatch agent 'voice_assistant': {dispatch_err}")

        import asyncio
        asyncio.create_task(dispatch_agent())

        return {
            "token": jwt_token,
            "serverUrl": url
        }
    except Exception as e:
        logger.error(f"Error generating token: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")

# Mount frontend static directory at the root
frontend_dir = os.path.join(parent_dir, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    logger.warning(f"Frontend static directory not found at: {frontend_dir}")

if __name__ == "__main__":
    import uvicorn
    # Allow configuring host/port via env, defaulting to 0.0.0.0:8000
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    logger.info(f"Starting API server on {host}:{port}")
    uvicorn.run("server:app", host=host, port=port, reload=True)
