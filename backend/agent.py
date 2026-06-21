import os
import sys
import logging
from dotenv import load_dotenv

# Configure logging first
logging.basicConfig(level=logging.INFO)

from livekit import agents, rtc
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, TurnHandlingOptions, llm, tts, stt, inference, room_io
from livekit.agents.inference import TurnDetector
from livekit.agents import mcp as agents_mcp
from livekit.plugins import noise_cancellation

# Load env variables from root folder
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(parent_dir, ".env")
load_dotenv(dotenv_path=env_path)

# Setup OpenTelemetry / Langfuse Tracing
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from observability import setup_observability
    setup_observability()
except Exception as e:
    logging.warning(f"Could not load or execute observability module: {e}")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are a friendly, witty, and highly helpful voice assistant. "
                "You must detect the user's language and respond in the same language "
                "(e.g., English, Spanish, German, French, Urdu, Arabic, Hindi, etc.). "
                "Since this is a spoken conversation, keep your responses brief, conversational, "
                "and natural. Avoid reading long lists, markdown formatting, or structural code blocks "
                "unless explicitly requested. "
                "You have access to real-time tools: live weather lookup, current time, "
                "unit conversion, and a calculator. Use them whenever helpful."
            )
        )


server = AgentServer()

@server.rtc_session(agent_name="voice_assistant")
async def entrypoint(ctx: JobContext):
    # Path to the local MCP server script
    mcp_server_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "local_mcp_server.py")

    # Build the MCP server connection (spawns local_mcp_server.py as a subprocess over stdio)
    local_mcp = agents_mcp.MCPServerStdio(
        command=sys.executable,
        args=[mcp_server_script],
    )

    # Wrap in a toolset that LiveKit agents can consume
    mcp_toolset = agents_mcp.MCPToolset(id="local-tools", mcp_server=local_mcp)

    session = AgentSession(
        stt=stt.FallbackAdapter(
            stt=[
                inference.STT(model="deepgram/nova-3", language="multi"),
                inference.STT(model="assemblyai/universal-streaming"),
            ]
        ),
        tts=tts.FallbackAdapter(
            tts=[
                inference.TTS(model="cartesia/sonic-3"),
                inference.TTS(model="elevenlabs/multilingual-v2"),
            ]
        ),
        llm=llm.FallbackAdapter(
            llm=[
                inference.LLM(model="openai/gpt-4o-mini"),
                inference.LLM(model="google/gemini-1.5-flash"),
            ]
        ),
        tools=[mcp_toolset],
        turn_handling=TurnHandlingOptions(
            turn_detection=TurnDetector()
        ),
    )

    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
        ),
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    agents.cli.run_app(server)
