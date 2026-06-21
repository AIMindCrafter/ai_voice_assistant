import os
import asyncio
from livekit import api
from dotenv import load_dotenv

# Load environmental variables (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(parent_dir, ".env")
load_dotenv(dotenv_path=env_path)

async def trigger_outbound_call(phone_number: str, room_name: str, sip_trunk_address: str):
    """
    Programmatically creates a SIP participant (dials a mobile phone number) 
    and places them into a target LiveKit audio room.
    """
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    
    if not all([url, api_key, api_secret]):
        print("Error: Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET in environment.")
        return

    # Initialize client connection
    lkapi = api.LiveKitAPI(url=url, api_key=api_key, api_secret=api_secret)
    
    try:
        print(f"Initiating outbound SIP call to {phone_number} mapping to room '{room_name}'...")
        
        request = api.CreateSIPParticipantRequest(
            sip_trunk_address=sip_trunk_address,
            sip_number=phone_number,
            room_name=room_name
        )
        
        # Dispatch the call
        response = await lkapi.sip.create_sip_participant(request)
        print(f"SIP Call successfully placed! Participant details: {response}")
        
    except Exception as e:
        print(f"Failed to place SIP call: {e}")
    finally:
        # Graceful cleanup of client connections
        await lkapi.aclose()

if __name__ == "__main__":
    # Example usage:
    # Set target phone number and outbound gateway address
    TARGET_PHONE = "+1234567890" 
    OUTBOUND_SIP_GATEWAY = "sip:your-outbound-trunk.sip.livekit.cloud"
    ROOM_NAME = "phone-call-room"
    
    asyncio.run(trigger_outbound_call(TARGET_PHONE, ROOM_NAME, OUTBOUND_SIP_GATEWAY))
