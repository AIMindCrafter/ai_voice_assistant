// DOM Elements
const btnConnect = document.getElementById('btn-connect');
const btnMute = document.getElementById('btn-mute');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnChat = document.getElementById('btn-chat');
const btnCamera = document.getElementById('btn-camera');
const dashboardGrid = document.getElementById('dashboard-grid');
const statusBadge = document.getElementById('status-badge');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const stateLabel = document.getElementById('agent-state-label');
const canvas = document.getElementById('audio-canvas');
const transcriptContainer = document.getElementById('transcript-container');
const emptyTranscript = document.getElementById('empty-transcript');
const connectOverlay = document.getElementById('connect-overlay');
const controlBar = document.getElementById('control-bar');

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
function updateStatus(stateClass, text, label) {
    // stateClass: 'disconnected', 'connecting', 'connected', 'listening', 'speaking'
    statusBadge.className = `status-badge ${stateClass}`;
    statusDot.className = `status-dot ${stateClass}`;
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

    // Apply smoothing to the audio volume feedback
    currentVolume = currentVolume * 0.75 + voiceActivity * 0.25;

    const centerX = width / 2;
    const centerY = height / 2;

    // Oscillate the rotation phase based on time + voice activity level
    phase += 0.02 + (currentVolume / 800);

    const numPoints = 8;
    const baseRadius = 75 + currentVolume * 0.65; // Base core radius pulses with volume

    // Determine visual colors and glows based on state
    let color1 = 'rgba(0, 242, 254, '; // Cyan default
    let color2 = 'rgba(0, 114, 255, '; // Blue default
    let shadowColor = 'rgba(0, 242, 254, 0.35)';

    if (statusBadge.classList.contains('speaking')) {
        color1 = 'rgba(127, 0, 255, '; // Purple
        color2 = 'rgba(236, 72, 153, '; // Pink
        shadowColor = 'rgba(127, 0, 255, 0.4)';
    } else if (statusBadge.classList.contains('listening')) {
        color1 = 'rgba(0, 242, 254, '; // Cyan
        color2 = 'rgba(16, 185, 129, '; // Green
        shadowColor = 'rgba(0, 242, 254, 0.4)';
    } else if (statusBadge.classList.contains('connecting')) {
        color1 = 'rgba(255, 145, 0, '; // Orange
        color2 = 'rgba(245, 158, 11, '; // Amber
        shadowColor = 'rgba(255, 145, 0, 0.3)';
    }

    // Layer 1 & 2: Frosted blurred fluid waves
    const numLayers = 3;
    for (let layer = 0; layer < numLayers; layer++) {
        const points = [];
        const layerOpacity = 0.08 + (0.12 / (layer + 1));
        const layerRadius = baseRadius - (layer * 12);
        
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            
            // Flowing wavy oscillations using sinusoids
            const waveFreq = 2.5;
            const waveSpeed = 2.2;
            const waveIntensity = 12 + currentVolume * 0.4;
            
            const oscillation = Math.sin(angle * waveFreq - phase * waveSpeed + layer * 1.5) * waveIntensity;
            const radius = Math.max(15, layerRadius + oscillation);
            
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            points.push({ x, y });
        }
        
        const grad = ctx.createLinearGradient(centerX - baseRadius, centerY - baseRadius, centerX + baseRadius, centerY + baseRadius);
        grad.addColorStop(0, color1 + layerOpacity + ')');
        grad.addColorStop(1, color2 + (layerOpacity * 0.4) + ')');
        
        ctx.save();
        ctx.shadowBlur = 30 - layer * 5;
        ctx.shadowColor = shadowColor;
        
        // Draw smooth closed shape via quadratic bezier curves
        ctx.beginPath();
        let prevPoint = points[points.length - 1];
        let firstMid = { x: (points[0].x + prevPoint.x) / 2, y: (points[0].y + prevPoint.y) / 2 };
        ctx.moveTo(firstMid.x, firstMid.y);
        for (let i = 0; i < points.length; i++) {
            const next = points[(i + 1) % points.length];
            const mid = { x: (points[i].x + next.x) / 2, y: (points[i].y + next.y) / 2 };
            ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
        }
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
    }
    
    // Core layer: Glowing outline wave
    ctx.save();
    ctx.beginPath();
    const corePoints = [];
    const coreRadius = baseRadius * 0.85;
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const oscillation = Math.cos(angle * 3 + phase * 2.5) * (4 + currentVolume * 0.1);
        const radius = Math.max(10, coreRadius + oscillation);
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        corePoints.push({ x, y });
    }
    let prevPoint = corePoints[corePoints.length - 1];
    let firstMid = { x: (corePoints[0].x + prevPoint.x) / 2, y: (corePoints[0].y + prevPoint.y) / 2 };
    ctx.moveTo(firstMid.x, firstMid.y);
    for (let i = 0; i < corePoints.length; i++) {
        const next = corePoints[(i + 1) % corePoints.length];
        const mid = { x: (corePoints[i].x + next.x) / 2, y: (corePoints[i].y + next.y) / 2 };
        ctx.quadraticCurveTo(corePoints[i].x, corePoints[i].y, mid.x, mid.y);
    }
    ctx.closePath();
    ctx.strokeStyle = color1 + '0.55)';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 12;
    ctx.shadowColor = shadowColor;
    ctx.stroke();
    ctx.restore();
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
        
        // Transition Overlay States
        connectOverlay.classList.add('hidden');
        controlBar.classList.remove('hidden');
        
        startVisualizer();

        btnConnect.disabled = true;
        btnMute.disabled = false;
        btnDisconnect.disabled = false;
        isMuted = false;
        
        btnMute.className = 'control-btn';
        btnMute.innerHTML = `
            <svg class="icon-mic" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
        `;

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
            btnMute.className = 'control-btn muted';
            btnMute.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="2" x2="22" y1="2" y2="22"/>
                    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1"/>
                    <path d="M5 10v1a7 7 0 0 0 12 5"/>
                    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.35"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                </svg>
            `;
        } else {
            btnMute.className = 'control-btn';
            btnMute.innerHTML = `
                <svg class="icon-mic" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                </svg>
            `;
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
    
    // Transition Overlay States
    connectOverlay.classList.remove('hidden');
    controlBar.classList.add('hidden');

    btnConnect.disabled = false;
    btnMute.disabled = true;
    btnDisconnect.disabled = true;
    
    btnMute.className = 'control-btn';
    btnMute.innerHTML = `
        <svg class="icon-mic" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
            <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
    `;
    isMuted = false;
    currentVolume = 0;
}

// Hook Events
btnConnect.addEventListener('click', startConversation);
btnMute.addEventListener('click', toggleMute);
btnDisconnect.addEventListener('click', cleanupSession);

// Collapsible Transcript Column toggle
btnChat.addEventListener('click', () => {
    btnChat.classList.toggle('active');
    dashboardGrid.classList.toggle('transcripts-hidden');
    // Allow column transition to complete, then resize canvas
    setTimeout(resizeCanvas, 400);
});

// Cosmetic Camera toggle (Visual click interaction)
btnCamera.addEventListener('click', () => {
    btnCamera.classList.toggle('muted');
    if (btnCamera.classList.contains('muted')) {
        btnCamera.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m1 1 22 22"/>
                <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3 0h9a2 2 0 0 1 2 2v9"/>
                <path d="m23 7-6 5 6 5V7Z"/>
            </svg>
        `;
    } else {
        btnCamera.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
            </svg>
        `;
    }
});

// Initial load check
document.addEventListener("DOMContentLoaded", () => {
    // Hide control bar initially
    controlBar.classList.add('hidden');
    resizeCanvas();
});
