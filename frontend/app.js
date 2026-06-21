// DOM Elements
const btnConnect = document.getElementById('btn-connect');
const btnMute = document.getElementById('btn-mute');
const btnDisconnect = document.getElementById('btn-disconnect');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const stateLabel = document.getElementById('agent-state-label');
const canvas = document.getElementById('audio-canvas');
const transcriptContainer = document.getElementById('transcript-container');
const emptyTranscript = document.getElementById('empty-transcript');
const muteIcon = document.getElementById('mute-icon');

// LiveKit & Web Audio Variables
let room = null;
let audioCtx = null;
let analyser = null;
let visualizerRunning = false;
let currentVolume = 0;
let isMuted = false;

// Transcripts state
const activeTranscripts = new Map();

// Set up Canvas visualizer dimensions
const ctx = canvas.getContext('2d');
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Status Helpers
function updateStatus(dotClass, text, label) {
    statusDot.className = `status-dot ${dotClass}`;
    statusText.textContent = text;
    if (label) stateLabel.textContent = label;
}

// Transcript UI update helper
function updateTranscriptUI(segmentId, text, isAgent, isFinal) {
    if (emptyTranscript) {
        emptyTranscript.style.display = 'none';
    }

    let bubble = activeTranscripts.get(segmentId);
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = `transcript-bubble ${isAgent ? 'bubble-agent' : 'bubble-user'}`;
        
        const sender = document.createElement('span');
        sender.className = 'bubble-sender';
        sender.textContent = isAgent ? 'Agent' : 'You';
        
        const content = document.createElement('div');
        content.className = 'bubble-text';
        
        bubble.appendChild(sender);
        bubble.appendChild(content);
        transcriptContainer.appendChild(bubble);
        activeTranscripts.set(segmentId, bubble);
    }

    const textDiv = bubble.querySelector('.bubble-text');
    textDiv.textContent = text;

    // Scroll to bottom
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

    // Clean up finalized segment mapping so future transcripts don't overwrite it
    if (isFinal) {
        activeTranscripts.delete(segmentId);
    }
}

// Clear transcript box
function clearTranscripts() {
    activeTranscripts.clear();
    const bubbles = transcriptContainer.querySelectorAll('.transcript-bubble');
    bubbles.forEach(b => b.remove());
    if (emptyTranscript) {
        emptyTranscript.style.display = 'flex';
    }
}

// Web Audio Setup
function initAudioAnalyser() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
    }
}

// Connect track to analyser
function analyzeTrack(track) {
    try {
        initAudioAnalyser();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const mediaStreamTrack = track.mediaStreamTrack;
        if (mediaStreamTrack) {
            const stream = new MediaStream([mediaStreamTrack]);
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            console.log(`🎤 Attached track ${track.sid} to visualizer analyser.`);
        }
    } catch (e) {
        console.error("Failed to connect track to analyser:", e);
    }
}

// Particle Sphere variables
const numParticles = 380;
const particles = [];
const baseRadius = 110; // Giant ball base radius
const focalLength = 300;

function initParticles() {
    if (particles.length > 0) return;
    for (let i = 0; i < numParticles; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / numParticles);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.sin(phi) * Math.sin(theta);
        const z = Math.cos(phi);
        
        let colorBase;
        const rand = Math.random();
        if (rand < 0.35) {
            colorBase = '14, 165, 233'; // Vivid Sky Cyan
        } else if (rand < 0.65) {
            colorBase = '37, 99, 235';  // Royal Blue
        } else if (rand < 0.85) {
            colorBase = '124, 58, 237';  // Premium Purple
        } else {
            colorBase = '236, 72, 153';  // Pink/Magenta
        }
        
        particles.push({
            x, y, z,
            colorBase,
            size: Math.random() * 1.6 + 1.2
        });
    }
}

// Visualizer Draw Loop
let phase = 0;
function drawVisualizer() {
    if (!visualizerRunning) return;
    requestAnimationFrame(drawVisualizer);

    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;
    ctx.clearRect(0, 0, width, height);

    let voiceActivity = 0;
    const bufferLength = analyser ? analyser.frequencyBinCount : 0;
    const dataArray = analyser ? new Uint8Array(bufferLength) : null;
    
    if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        voiceActivity = sum / bufferLength;
    }

    currentVolume = currentVolume * 0.8 + voiceActivity * 0.2;

    // Background subtle grid lines (darker for light mode)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.018)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 50) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let i = 0; i < height; i += 50) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }

    const centerX = width / 2;
    const centerY = height / 2;

    // Glowing center core
    let orbRadius = 55 + currentVolume * 0.5;
    let gradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, orbRadius);
    
    let orbColor = 'rgba(0, 242, 254, ';
    if (statusDot.classList.contains('speaking')) {
        orbColor = 'rgba(127, 0, 255, ';
    } else if (statusDot.classList.contains('listening')) {
        orbColor = 'rgba(79, 172, 254, ';
    } else if (statusDot.classList.contains('connecting')) {
        orbColor = 'rgba(255, 145, 0, ';
    }
    
    gradient.addColorStop(0, orbColor + '0.45)');
    gradient.addColorStop(0.5, orbColor + '0.12)');
    gradient.addColorStop(1, orbColor + '0)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Rotations
    const speedY = 0.004 + (currentVolume / 1200);
    phase += speedY;
    
    const angleX = phase * 0.4;
    const angleY = phase;
    
    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);
    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);

    initParticles();

    const projected = particles.map((p, idx) => {
        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.z * cosY + p.x * sinY;
        
        let y2 = p.y * cosX - z1 * sinX;
        let z2 = z1 * cosX + p.y * sinX;
        
        let freqValue = 0;
        if (dataArray && bufferLength > 0) {
            freqValue = dataArray[idx % bufferLength];
        }

        // Giant ball expansion multiplier
        const expansion = (freqValue / 255) * 125 * (currentVolume > 2 ? 1 : 0.05);
        const breath = Math.sin(phase * 1.5 + idx) * 3;
        const currentRadius = baseRadius + expansion + breath;

        const scale = focalLength / (focalLength + z2);
        const screenX = x1 * scale * currentRadius + centerX;
        const screenY = y2 * scale * currentRadius + centerY;

        return { p, rotZ: z2, screenX, screenY, scale, freqValue };
    });

    projected.sort((a, b) => b.rotZ - a.rotZ);

    projected.forEach((pObj, idx) => {
        const depthOpacity = (pObj.rotZ + 1.2) / 2.2;
        const opacity = 0.15 + depthOpacity * 0.75;
        const size = pObj.p.size * pObj.scale * (0.8 + (pObj.freqValue / 255) * 0.6);

        ctx.beginPath();
        ctx.arc(pObj.screenX, pObj.screenY, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pObj.p.colorBase}, ${opacity})`;
        ctx.fill();

        if (currentVolume > 15 && idx < projected.length - 1 && Math.random() < 0.07) {
            const nextP = projected[idx + 1];
            ctx.beginPath();
            ctx.moveTo(pObj.screenX, pObj.screenY);
            ctx.lineTo(nextP.screenX, nextP.screenY);
            ctx.strokeStyle = `rgba(${pObj.p.colorBase}, ${opacity * 0.22})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    });
}

function startVisualizer() {
    if (!visualizerRunning) {
        visualizerRunning = true;
        drawVisualizer();
    }
}

function stopVisualizer() {
    visualizerRunning = false;
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
}

// Main Connection Handler
async function startConversation() {
    // Check for secure context (HTTPS or localhost) required for getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("🔒 Microphone access is blocked in insecure contexts.\n\nPlease open the page via 'http://localhost:8000' or 'http://127.0.0.1:8000' instead of '0.0.0.0'.");
        btnConnect.disabled = false;
        return;
    }
    clearTranscripts();
    updateStatus('connecting', 'Connecting...', 'Retrieving session token...');
    btnConnect.disabled = true;

    try {
        const response = await fetch('/api/token');
        if (!response.ok) {
            throw new Error(`Failed to fetch connection token: ${response.statusText}`);
        }
        const data = await response.json();
        const { token, serverUrl } = data;

        console.log(`Connecting to LiveKit: ${serverUrl}`);
        updateStatus('connecting', 'Connecting...', 'Connecting to room...');

        room = new LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
        });

        // Track Subscription
        room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === 'audio') {
                const element = track.attach();
                document.body.appendChild(element);
                analyzeTrack(track);
                updateStatus('speaking', 'Connected', 'Agent is speaking');
            }
        });

        room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            track.detach();
        });

        // Active Speaker Tracking
        room.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, (speakers) => {
            if (speakers.length > 0) {
                const activeSpeaker = speakers[0];
                if (activeSpeaker.isLocal) {
                    updateStatus('listening', 'Connected', 'Listening to you...');
                } else {
                    updateStatus('speaking', 'Connected', 'Agent is speaking...');
                }
            } else {
                updateStatus('connected', 'Connected', 'Agent is listening...');
            }
        });

        // Register Real-time Transcription handler (Standard text stream API)
        room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
            const isFinal = reader.info.attributes["lk.transcription_final"] === "true";
            const segmentId = reader.info.attributes["lk.segment_id"] || Math.random().toString(36).substring(7);
            const isAgent = participantInfo.identity !== room.localParticipant.identity;
            
            let accumulatedText = "";
            try {
                for await (const chunk of reader) {
                    accumulatedText += chunk;
                    updateTranscriptUI(segmentId, accumulatedText, isAgent, isFinal);
                }
            } catch (e) {
                console.error("Error reading transcription stream:", e);
            }
        });

        // Real-time Function Execution Event Listener (Data Channel)
        room.on(LivekitClient.RoomEvent.DataReceived, (payload, participant, kind) => {
            try {
                const textDecoder = new TextDecoder();
                const jsonStr = textDecoder.decode(payload);
                const eventData = JSON.parse(jsonStr);

                if (eventData.type === 'function_call') {
                    console.log("Received agent function execution call:", eventData);
                    
                    const functionName = eventData.name === 'get_weather' ? 'get_weather' : 'book_appointment';
                    const detailText = eventData.name === 'get_weather' 
                        ? `Checking weather in ${eventData.args.location}...` 
                        : `Booking appointment for ${eventData.args.name}...`;
                        
                    updateStatus('speaking', 'Connected', `Executing ${functionName}: ${detailText}`);
                    
                    // Append function call events directly to transcript as a stylized agent narrative block
                    const systemSegmentId = 'sys-' + Math.random().toString(36).substring(7);
                    const formattedCall = `⚙️ [System Tool Call]: Executing ${eventData.name}(${JSON.stringify(eventData.args)}) => Result: "${eventData.result}"`;
                    updateTranscriptUI(systemSegmentId, formattedCall, true, true);

                    setTimeout(() => {
                        updateStatus('connected', 'Connected', 'Agent is listening...');
                    }, 4000);
                }
            } catch (err) {
                console.error("Error processing incoming data channel event:", err);
            }
        });

        room.on(LivekitClient.RoomEvent.Disconnected, () => {
            cleanupSession();
        });

        // Connect
        await room.connect(serverUrl, token);
        
        // Listen for local microphone publishing
        room.on(LivekitClient.RoomEvent.LocalTrackPublished, (publication, participant) => {
            if (publication.track && publication.track.kind === 'audio') {
                console.log("Local microphone track published, analyzing stream.");
                analyzeTrack(publication.track);
            }
        });

        updateStatus('connected', 'Connected', 'Acquiring microphone...');
        await room.localParticipant.setMicrophoneEnabled(true);
        
        const localPublication = room.localParticipant.getTrackPublication(LivekitClient.Track.Source.Microphone);
        if (localPublication && localPublication.track) {
            analyzeTrack(localPublication.track);
        }

        updateStatus('connected', 'Connected', 'Agent is listening...');
        startVisualizer();

        btnConnect.disabled = true;
        btnMute.disabled = false;
        btnDisconnect.disabled = false;
        isMuted = false;
        muteIcon.textContent = '🎤';
        btnMute.className = 'btn btn-secondary';
        btnMute.innerHTML = '<span class="btn-icon" id="mute-icon">🎤</span> Mute Microphone';

    } catch (error) {
        console.error("Failed to start session:", error);
        alert(`Failed to start session: ${error.message}`);
        cleanupSession();
    }
}

// Mute/Unmute microphone
async function toggleMute() {
    if (!room) return;
    try {
        isMuted = !isMuted;
        await room.localParticipant.setMicrophoneEnabled(!isMuted);
        
        if (isMuted) {
            btnMute.className = 'btn btn-secondary muted';
            btnMute.innerHTML = '<span class="btn-icon" id="mute-icon">🔇</span> Unmute Microphone';
        } else {
            btnMute.className = 'btn btn-secondary';
            btnMute.innerHTML = '<span class="btn-icon" id="mute-icon">🎤</span> Mute Microphone';
        }
    } catch (e) {
        console.error("Failed to toggle mute state:", e);
    }
}

// Disconnect and Clean up
function cleanupSession() {
    stopVisualizer();
    if (room) {
        room.disconnect();
        room = null;
    }
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
        analyser = null;
    }
    
    updateStatus('disconnected', 'Disconnected', 'Ready to connect');

    btnConnect.disabled = false;
    btnMute.disabled = true;
    btnDisconnect.disabled = true;
    btnMute.className = 'btn btn-secondary';
    btnMute.innerHTML = '<span class="btn-icon" id="mute-icon">🎤</span> Mute Microphone';
    isMuted = false;
    currentVolume = 0;
}

// Hook Events
btnConnect.addEventListener('click', startConversation);
btnMute.addEventListener('click', toggleMute);
btnDisconnect.addEventListener('click', cleanupSession);
