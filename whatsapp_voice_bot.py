import os
import time
from google import genai
from google.genai import types
from gtts import gTTS
from dotenv import load_dotenv

from neonize.client import NewClient
from neonize.events import MessageEv, ConnectedEv
from neonize.utils.enum import ChatPresence, ChatPresenceMedia

# Load environmental variables
load_dotenv()

# Configure Gemini API client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY not found in environment. Please set it in your .env file.")
    ai_client = None
else:
    ai_client = genai.Client(api_key=GEMINI_API_KEY)

# Global dictionary to track conversation history per chat JID
chat_sessions = {}

# Define system prompt for voice personality
SYSTEM_PROMPT = (
    "You are a friendly, witty, and highly helpful voice assistant. "
    "Listen to this user's voice message carefully. Identify the language they are speaking in, "
    "and reply back in the exact same language (e.g., English, Urdu, Spanish, German, French, Arabic, Hindi, etc.). "
    "Keep your response concise, brief, and conversational since this will be converted to a voice note. "
    "Do not include markdown tags, asterisks, bullet points, or complex formatting."
)

# Initialize WhatsApp Web automation client (persisted database)
client = NewClient("whatsapp_session.sqlite3")

@client.event(ConnectedEv)
def on_connected(client: NewClient, event: ConnectedEv):
    print("\n⚡ WhatsApp Bot successfully connected and ready!")
    print("If this is your first run, check your terminal console for the QR code and scan it in your WhatsApp App -> Linked Devices.")

@client.event(MessageEv)
def on_message(client: NewClient, event: MessageEv):
    # Check if incoming message is a voice note or a text message
    is_audio = event.Message.HasField('audioMessage')
    is_text = event.Message.HasField('conversation') or event.Message.HasField('extendedTextMessage')
    
    if not (is_audio or is_text):
        return

    if not ai_client:
        print("Error: Gemini API client is not initialized. Please set GEMINI_API_KEY.")
        return

    chat_jid = event.Info.MessageSource.Chat
    sender_jid = event.Info.MessageSource.Sender
    message_id = event.Info.ID
    
    try:
        if is_audio:
            print(f"\n🎙️ Received voice note from {sender_jid} in chat {chat_jid}")
            # Set presence to "recording audio..."
            client.send_chat_presence(
                chat_jid, 
                ChatPresence.CHAT_PRESENCE_COMPOSING, 
                ChatPresenceMedia.CHAT_PRESENCE_MEDIA_AUDIO
            )
        else:
            print(f"\n💬 Received text message from {sender_jid} in chat {chat_jid}")
            # Set presence to "typing..."
            client.send_chat_presence(
                chat_jid, 
                ChatPresence.CHAT_PRESENCE_COMPOSING, 
                ChatPresenceMedia.CHAT_PRESENCE_MEDIA_TEXT
            )

        # Retrieve or initialize the chat session to preserve context history
        chat_key = chat_jid.User
        if chat_key not in chat_sessions:
            chat_sessions[chat_key] = ai_client.chats.create(
                model="gemini-2.5-flash",
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.7,
                )
            )
        chat_session = chat_sessions[chat_key]

        if is_audio:
            # 1. Download voice note audio bytes directly
            print("Downloading audio file from WhatsApp...")
            audio_bytes = client.download_any(event.Message)
            if not audio_bytes:
                print("Failed to download audio bytes.")
                return

            # Save incoming audio locally
            input_filename = f"whatsapp_in_{message_id}.ogg"
            with open(input_filename, 'wb') as f:
                f.write(audio_bytes)
                
            print(f"Voice note downloaded successfully and saved as: {input_filename}")

            # 2. Upload audio recording directly to Gemini
            print("Uploading audio file to Gemini API...")
            audio_file = ai_client.files.upload(file=input_filename)
            
            # 3. Generate response from Gemini through the active chat session (preserving history)
            print("Generating response from Gemini (with chat memory)...")
            response = chat_session.send_message(audio_file)
            
            text_reply = response.text
            print(f"Gemini voice assistant reply text: {text_reply}")

            # 4. Convert reply text to voice using gTTS (free Text-to-Speech)
            output_filename = f"whatsapp_out_{message_id}.mp3"
            tts = gTTS(text=text_reply, lang='en')
            tts.save(output_filename)
            print(f"Audio response compiled: {output_filename}")

            # 5. Send the audio file back as a WhatsApp Voice Note (ptt=True turns it into a blue mic voice note!)
            print("Sending voice note back to WhatsApp contact...")
            client.send_audio(to=chat_jid, file=output_filename, ptt=True, quoted=event)
            print("Voice note successfully sent!")

            # 6. Cleanup temporary audio files
            os.remove(input_filename)
            os.remove(output_filename)
            ai_client.files.delete(name=audio_file.name) # Delete from Gemini remote storage
            print("Temporary files cleaned up.")
            
        else:
            # Retrieve text content
            if event.Message.HasField('conversation'):
                user_text = event.Message.conversation
            else:
                user_text = event.Message.extendedTextMessage.text
            
            print(f"User message: {user_text}")

            # 1. Generate text response from Gemini through the active chat session (preserving history)
            print("Generating text response from Gemini (with chat memory)...")
            response = chat_session.send_message(user_text)
            
            text_reply = response.text
            print(f"Gemini voice assistant reply text: {text_reply}")

            # 2. Send the text message back to WhatsApp contact
            print("Sending text response back to WhatsApp contact...")
            client.reply_message(to=chat_jid, message=text_reply, quoted=event)
            print("Text response successfully sent!")

    except Exception as e:
        print(f"Error processing message: {e}")
        client.send_message(chat_jid, "Sorry, I had trouble processing that message. Please try again!")

    finally:
        # Clear/stop the typing/recording status indicator
        try:
            if is_audio:
                client.send_chat_presence(
                    chat_jid, 
                    ChatPresence.CHAT_PRESENCE_PAUSED, 
                    ChatPresenceMedia.CHAT_PRESENCE_MEDIA_AUDIO
                )
            else:
                client.send_chat_presence(
                    chat_jid, 
                    ChatPresence.CHAT_PRESENCE_PAUSED, 
                    ChatPresenceMedia.CHAT_PRESENCE_MEDIA_TEXT
                )
        except Exception as pe:
            print(f"Error clearing presence indicator: {pe}")

if __name__ == "__main__":
    print("Starting WhatsApp Voice Agent...")
    # Connect client (if not logged in, this will print the QR code in your console terminal)
    client.connect()
