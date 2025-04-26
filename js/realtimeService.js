// js/realtimeService.js - Handles OpenAI Realtime API interactions via WebRTC

import * as state from './state.js';
import { showNotification } from './notificationHelper.js';
import { supabase } from './supabaseClient.js'; // Assuming supabase client is initialized here

const REALTIME_API_URL_BASE = "https://api.openai.com/v1/realtime";
const REALTIME_MODEL = "gpt-4o-mini-realtime-preview"; // Or your desired model
const DATA_CHANNEL_NAME = "oai-events";
const AUDIO_PLAYBACK_ELEMENT_ID = "realtime-audio-playback";

let localStream = null; // User's microphone stream
let localAudioTrack = null; // User's audio track sent to OpenAI

// --- Public API ---

/**
 * Initializes a new real-time audio session with OpenAI.
 */
export async function initializeSession() {
    console.log("Initializing real-time session...");
    if (state.isRealtimeSessionActive) {
        console.warn("Session already active.");
        return;
    }

    updateState({ status: 'connecting', active: true });

    try {
        // 1. Get Ephemeral Key and Session ID from Backend
        console.log("Fetching ephemeral key and session ID from 'talk' function...");
        const { data: sessionData, error: sessionError } = await supabase.functions.invoke('talk', { // <-- Use deployed function name 'talk'
            method: 'POST', // Ensure POST method is used if required by function
            // body: {} // Add empty body if needed, or specific params
        });

        if (sessionError || !sessionData?.ephemeral_key || !sessionData?.session_id) {
            throw new Error(`Failed to get session key: ${sessionError?.message || 'Invalid response'}`);
        }
        const { ephemeral_key, session_id } = sessionData;
        updateState({ ephemeralKey: ephemeral_key });
        console.log("Received session details.");

        // 2. Get Microphone Access
        console.log("Requesting microphone access...");
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localAudioTrack = localStream.getAudioTracks()[0];
        console.log("Microphone access granted.");

        // 3. Create and Configure RTCPeerConnection
        console.log("Creating RTCPeerConnection...");
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Example STUN server
        });
        updateState({ connection: pc });

        // 4. Setup Event Handlers for PeerConnection
        setupPeerConnectionHandlers(pc);

        // 5. Add Local Audio Track
        pc.addTrack(localAudioTrack, localStream);
        console.log("Local audio track added.");

        // 6. Create Data Channel
        console.log("Creating data channel:", DATA_CHANNEL_NAME);
        const dc = pc.createDataChannel(DATA_CHANNEL_NAME, { ordered: true });
        updateState({ dataChannel: dc });
        setupDataChannelHandlers(dc);

        // 7. Initiate SDP Offer/Answer Exchange
        console.log("Creating SDP offer...");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("Local description set.");

        // 8. Send Offer to OpenAI Realtime Endpoint
        const realtimeUrl = `${REALTIME_API_URL_BASE}?model=${REALTIME_MODEL}&session_id=${session_id}`;
        console.log("Sending offer to OpenAI:", realtimeUrl);

        const response = await fetch(realtimeUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ephemeral_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                offer: pc.localDescription
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`OpenAI connection failed (${response.status}): ${errorBody}`);
        }

        const answerData = await response.json();
        if (!answerData.answer) {
            throw new Error("Invalid answer received from OpenAI.");
        }

        console.log("Received SDP answer from OpenAI.");
        await pc.setRemoteDescription(new RTCSessionDescription(answerData.answer));
        console.log("Remote description set. Connection should establish.");

        // State is updated to 'active' via peer connection state change handler

    } catch (error) {
        console.error("Real-time session initialization failed:", error);
        showNotification(`Error starting live session: ${error.message}`, 'error');
        await terminateSession(); // Clean up on failure
        updateState({ status: 'error', active: false });
    }
}

/**
 * Terminates the current real-time audio session.
 */
export async function terminateSession() {
    console.log("Terminating real-time session...");
    const pc = state.realtimeConnection;
    const dc = state.realtimeDataChannel;

    if (dc) {
        try { dc.close(); } catch (e) { console.warn("Error closing data channel:", e); }
    }
    if (pc) {
        try { pc.close(); } catch (e) { console.warn("Error closing peer connection:", e); }
    }
    if (localAudioTrack) {
        try { localAudioTrack.stop(); } catch (e) { console.warn("Error stopping local audio track:", e); }
    }
    if (localStream) {
        // Ensure all tracks are stopped if stream still exists
        localStream.getTracks().forEach(track => track.stop());
    }

    // Remove audio playback element
    const audioEl = document.getElementById(AUDIO_PLAYBACK_ELEMENT_ID);
    if (audioEl) {
        audioEl.pause();
        audioEl.srcObject = null;
        audioEl.remove();
        console.log("Removed audio playback element.");
    }

    // Reset state
    updateState({
        active: false,
        status: 'inactive',
        connection: null,
        dataChannel: null,
        remoteStream: null,
        ephemeralKey: null,
        transcript: ''
    });
    localStream = null;
    localAudioTrack = null;
    console.log("Real-time session terminated and state reset.");
}

// --- Private Helper Functions ---

/**
 * Updates the shared application state for real-time variables.
 * @param {{status?: string, active?: boolean, connection?: RTCPeerConnection | null, dataChannel?: RTCDataChannel | null, remoteStream?: MediaStream | null, ephemeralKey?: string | null, transcript?: string}} updates
 */
function updateState(updates) {
    if (updates.status !== undefined) state.realtimeSessionStatus = updates.status;
    if (updates.active !== undefined) state.isRealtimeSessionActive = updates.active;
    if (updates.connection !== undefined) state.realtimeConnection = updates.connection;
    if (updates.dataChannel !== undefined) state.realtimeDataChannel = updates.dataChannel;
    if (updates.remoteStream !== undefined) state.realtimeRemoteAudioStream = updates.remoteStream;
    if (updates.ephemeralKey !== undefined) state.realtimeEphemeralKey = updates.ephemeralKey;
    if (updates.transcript !== undefined) state.currentRealtimeTranscript = updates.transcript;

    // Dispatch a custom event to notify the UI about the state change
    document.dispatchEvent(new CustomEvent('realtime-state-update'));

    console.log("Realtime State Updated:", {
        status: state.realtimeSessionStatus,
        active: state.isRealtimeSessionActive,
        transcript: state.currentRealtimeTranscript
    });
}

/**
 * Sets up event handlers for the RTCPeerConnection.
 * @param {RTCPeerConnection} pc
 */
function setupPeerConnectionHandlers(pc) {
    pc.onicecandidate = (event) => {
        // ICE candidates are usually handled automatically by modern browsers
        // when using SDP offer/answer with a server like OpenAI's.
        // Manual handling might be needed for P2P or complex setups.
        if (event.candidate) {
            console.log("Local ICE candidate generated:", event.candidate.candidate.substring(0, 50) + "...");
            // In this server-based scenario, candidates are typically included in the SDP
            // or handled implicitly. No explicit signaling needed here usually.
        } else {
            console.log("All local ICE candidates gathered.");
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        switch (pc.iceConnectionState) {
            case 'connected':
            case 'completed':
                // Connection is likely stable
                break;
            case 'failed':
                console.error("ICE connection failed.");
                showNotification("Live connection failed.", 'error');
                updateState({ status: 'error' });
                terminateSession();
                break;
            case 'disconnected':
            case 'closed':
                // Connection lost or closed, session might need termination
                console.log("ICE connection disconnected or closed.");
                // Don't immediately terminate on 'disconnected', might recover.
                // Terminate if it stays disconnected or moves to 'closed'.
                if (state.isRealtimeSessionActive && pc.iceConnectionState === 'closed') {
                   terminateSession();
                }
                break;
        }
    };

    pc.onconnectionstatechange = () => {
        console.log("Peer Connection State:", pc.connectionState);
        switch (pc.connectionState) {
            case 'connected':
                console.log("WebRTC connection established successfully.");
                updateState({ status: 'active' });
                showNotification("Live session active.", 'info');
                break;
            case 'failed':
                console.error("Peer connection failed.");
                showNotification("Live connection failed.", 'error');
                updateState({ status: 'error' });
                terminateSession();
                break;
            case 'disconnected':
                console.warn("Peer connection disconnected. Attempting to reconnect...");
                // Browser might attempt reconnection automatically. Monitor state.
                updateState({ status: 'connecting' }); // Reflect potential reconnect attempt
                break;
            case 'closed':
                console.log("Peer connection closed.");
                // Ensure cleanup if not already triggered by ICE state
                 if (state.isRealtimeSessionActive) {
                   terminateSession();
                }
                break;
        }
    };

    pc.ontrack = (event) => {
        console.log("Remote track received:", event.track.kind);
        if (event.track.kind === 'audio') {
            updateState({ remoteStream: event.streams[0] });
            playRemoteAudio(event.streams[0]);
        }
    };
}

/**
 * Sets up event handlers for the RTCDataChannel.
 * @param {RTCDataChannel} dc
 */
function setupDataChannelHandlers(dc) {
    dc.onopen = () => {
        console.log("Data channel opened:", dc.label);
        // Optionally send an initial message if required by API
        // sendClientEvent({ type: "session.start" }); // Example
    };

    dc.onclose = () => {
        console.log("Data channel closed:", dc.label);
        // May indicate session end or connection issue
    };

    dc.onerror = (error) => {
        console.error("Data channel error:", error);
        showNotification("Data channel error.", 'error');
        updateState({ status: 'error' });
        // Consider terminating session depending on error severity
    };

    dc.onmessage = (event) => {
        // console.log("Data channel message received:", event.data); // Log raw data
        try {
            const message = JSON.parse(event.data);
            handleServerEvent(message);
        } catch (error) {
            console.error("Failed to parse data channel message:", error, "Data:", event.data);
        }
    };
}

/**
 * Handles incoming messages from the OpenAI server via the data channel.
 * @param {object} eventData Parsed JSON data from the server.
 */
function handleServerEvent(eventData) {
    // console.log("Handling server event:", eventData.type || 'Unknown type', eventData); // Log parsed event

    switch (eventData.type) {
        case 'session.created':
            console.log("Server confirmed session creation:", eventData.session_id);
            // Usually connection state change handles 'active' status
            break;

        case 'response.text.delta':
            // Append text delta to the current transcript
            if (eventData.delta) {
                updateState({ transcript: state.currentRealtimeTranscript + eventData.delta });
            }
            break;

        case 'response.audio.delta':
            // Audio is handled via the 'ontrack' event, not usually via data channel messages
            // unless it's metadata about the audio.
            console.log("Received audio delta event (metadata?):", eventData);
            break;

        case 'response.done':
            console.log("Server indicated end of response turn.");
            // Log the final transcript for now, as planned
            console.log("Final Transcript:", state.currentRealtimeTranscript);
            // Reset transcript for the next turn? Or wait for user input?
            // updateState({ transcript: '' }); // Reset for next turn
            // TODO: Decide how to integrate into chat history later.
            break;

        case 'input_audio_buffer.speech_started':
            console.log("Server detected user speech started.");
            // Could use this for UI indication (e.g., "Listening...")
            break;

        case 'input_audio_buffer.speech_stopped':
            console.log("Server detected user speech stopped.");
            // Could use this for UI indication (e.g., "Processing...")
            break;

        case 'error':
            console.error("Received error event from server:", eventData.message || eventData);
            showNotification(`Live session error: ${eventData.message || 'Unknown error'}`, 'error');
            updateState({ status: 'error' });
            // Consider terminating based on error severity
            if (eventData.is_fatal) {
                terminateSession();
            }
            break;

        default:
            console.warn("Received unhandled server event type:", eventData.type, eventData);
    }
}

/**
 * Sends a client event message to the OpenAI server via the data channel.
 * @param {object} eventObject The event data to send.
 */
function sendClientEvent(eventObject) {
    const dc = state.realtimeDataChannel;
    if (dc && dc.readyState === 'open') {
        try {
            const message = JSON.stringify(eventObject);
            console.log("Sending client event:", message);
            dc.send(message);
        } catch (error) {
            console.error("Failed to send client event:", error, eventObject);
        }
    } else {
        console.warn("Cannot send client event, data channel not open. State:", dc?.readyState);
    }
}

/**
 * Creates or updates the hidden audio element to play the remote stream.
 * @param {MediaStream} stream The remote audio stream from OpenAI.
 */
function playRemoteAudio(stream) {
    let audioEl = document.getElementById(AUDIO_PLAYBACK_ELEMENT_ID);
    if (!audioEl) {
        console.log("Creating audio playback element.");
        audioEl = document.createElement('audio');
        audioEl.id = AUDIO_PLAYBACK_ELEMENT_ID;
        audioEl.autoplay = true;
        // audioEl.controls = true; // Uncomment for debugging
        document.body.appendChild(audioEl); // Append somewhere, body is fine for hidden
    }

    console.log("Setting srcObject for audio playback.");
    audioEl.srcObject = stream;
    audioEl.play().catch(error => {
        console.error("Audio playback failed:", error);
        // Autoplay might be blocked, user interaction might be needed
        showNotification("Could not play AI audio automatically.", "warning");
    });
}
