// js/realtimeService.js - Handles OpenAI Realtime API interactions via WebRTC

import {
    getIsRealtimeSessionActive, setIsRealtimeSessionActive,
    getRealtimeSessionStatus, setRealtimeSessionStatus,
    getRealtimeConnection, setRealtimeConnection,
    getRealtimeDataChannel, setRealtimeDataChannel,
    getRealtimeRemoteAudioStream, setRealtimeRemoteAudioStream,
    getRealtimeEphemeralKey, setRealtimeEphemeralKey,
    getCurrentRealtimeTranscript, setCurrentRealtimeTranscript,
    clearRealtimeState // <-- Import clearRealtimeState
} from './state.js';
import { showNotification } from './notificationHelper.js';
import { supabase } from './supabaseClient.js';

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
    if (getIsRealtimeSessionActive()) {
        console.warn("Session already active.");
        return;
    }

    // Update state directly
    setRealtimeSessionStatus('connecting');
    setIsRealtimeSessionActive(true);
    document.dispatchEvent(new CustomEvent('realtime-state-update')); // Notify UI

    let pc = null; // Define pc here to be accessible in catch block if needed

    try {
        // 1. Get Ephemeral Key and Session ID from Backend
        console.log("Fetching ephemeral key and session ID from 'talk' function...");
        const { data: sessionData, error: sessionError } = await supabase.functions.invoke('talk', {
            method: 'POST',
            body: {} // Send empty body for POST if function expects it
        });

        if (sessionError || !sessionData || !sessionData.ephemeral_key || !sessionData.session_id) {
             console.error("Supabase function invocation error or invalid data:", { sessionError, sessionData });
             throw new Error(`Failed to get session key: ${sessionError?.message || 'Invalid or missing session data returned from function.'}`);
        }
        const { ephemeral_key, session_id } = sessionData; // session_id might not be needed for SDP exchange but good to have
        setRealtimeEphemeralKey(ephemeral_key);
        document.dispatchEvent(new CustomEvent('realtime-state-update'));
        console.log(`Received session details. Session ID: ${session_id}`);

        // 2. Get Microphone Access
        console.log("Requesting microphone access...");
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localAudioTrack = localStream.getAudioTracks()[0];
        console.log("Microphone access granted.");

        // 3. Create and Configure RTCPeerConnection
        console.log("Creating RTCPeerConnection...");
        pc = new RTCPeerConnection({ // Assign to the outer scope variable
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        setRealtimeConnection(pc);
        document.dispatchEvent(new CustomEvent('realtime-state-update'));

        // 4. Setup Event Handlers for PeerConnection
        setupPeerConnectionHandlers(pc);

        // 5. Add Local Audio Track
        pc.addTrack(localAudioTrack, localStream);
        console.log("Local audio track added.");

        // 6. Create Data Channel
        console.log("Creating data channel:", DATA_CHANNEL_NAME);
        const dc = pc.createDataChannel(DATA_CHANNEL_NAME, { ordered: true });
        setRealtimeDataChannel(dc);
        document.dispatchEvent(new CustomEvent('realtime-state-update'));
        setupDataChannelHandlers(dc);

        // 7. Initiate SDP Offer/Answer Exchange
        console.log("Creating SDP offer...");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("Local description set.");

        // 8. Send Offer to OpenAI Realtime Endpoint
        // --- CORRECTED URL AND FETCH OPTIONS ---
        const realtimeSdpUrl = `${REALTIME_API_URL_BASE}?model=${REALTIME_MODEL}`; // Remove session_id from query param
        console.log("Sending offer to OpenAI:", realtimeSdpUrl);

        const response = await fetch(realtimeSdpUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ephemeral_key}`,
                'Content-Type': 'application/sdp' // Correct Content-Type
            },
            body: pc.localDescription.sdp // Send raw SDP string
        });
        // --- END CORRECTION ---

        if (!response.ok) {
            const errorBody = await response.text();
            // Try to parse JSON error specifically for unsupported content type
             try {
                 const errorJson = JSON.parse(errorBody);
                 if (errorJson?.error?.code === 'unsupported_content_type') {
                     throw new Error(`OpenAI connection failed (400): ${errorJson.error.message}`);
                 }
             } catch (e) { /* Ignore parsing error if not JSON */ }
            // Throw generic error otherwise
            throw new Error(`OpenAI connection failed (${response.status}): ${errorBody}`);
        }

        // The response body for a successful SDP answer is the SDP text itself
        const answerSdp = await response.text();
        if (!answerSdp || !answerSdp.includes('v=0')) { // Basic SDP validation
            throw new Error("Invalid SDP answer received from OpenAI.");
        }

        console.log("Received SDP answer from OpenAI.");
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp }); // Use the raw SDP text
        console.log("Remote description set. Connection should establish.");

        // State is updated to 'active' via peer connection state change handler

    } catch (error) {
        console.error("Real-time session initialization failed:", error);
        showNotification(`Error starting live session: ${error.message}`, 'error');
        setRealtimeSessionStatus('error');
        setIsRealtimeSessionActive(false);
        document.dispatchEvent(new CustomEvent('realtime-state-update'));
        await terminateSession(); // Clean up on failure
    }
}

/**
 * Terminates the current real-time audio session.
 */
export async function terminateSession() {
    console.log("Terminating real-time session...");
    const pc = getRealtimeConnection();
    const dc = getRealtimeDataChannel();

    // Stop local tracks first to signal intent to close media stream
    if (localAudioTrack) {
        try { localAudioTrack.stop(); console.log("Local audio track stopped."); }
        catch (e) { console.warn("Error stopping local audio track:", e); }
        localAudioTrack = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => {
            try { track.stop(); } catch(e) { console.warn("Error stopping a local stream track:", e); }
        });
        console.log("All local stream tracks stopped.");
        localStream = null;
    }

    // Close data channel and peer connection
    if (dc) {
        try { dc.close(); console.log("Data channel closed."); }
        catch (e) { console.warn("Error closing data channel:", e); }
    }
    if (pc) {
        try { pc.close(); console.log("Peer connection closed."); }
        catch (e) { console.warn("Error closing peer connection:", e); }
    }

    // Remove audio playback element
    const audioEl = document.getElementById(AUDIO_PLAYBACK_ELEMENT_ID);
    if (audioEl) {
        try {
            audioEl.pause();
            audioEl.srcObject = null; // Detach stream
            audioEl.remove();
            console.log("Removed audio playback element.");
        } catch (e) {
            console.warn("Error cleaning up audio element:", e);
        }
    }

    // Reset state
    clearRealtimeState(); // Use the dedicated state clearing function
    document.dispatchEvent(new CustomEvent('realtime-state-update')); // Notify UI

    console.log("Real-time session terminated and state reset.");
}

// --- Private Helper Functions ---

/**
 * Sets up event handlers for the RTCPeerConnection.
 * @param {RTCPeerConnection} pc
 */
function setupPeerConnectionHandlers(pc) {
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // console.log("Local ICE candidate generated (usually handled automatically):", event.candidate.candidate.substring(0, 50) + "...");
        } else {
            console.log("All local ICE candidates gathered.");
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        const currentStatus = getRealtimeSessionStatus();
        switch (pc.iceConnectionState) {
            case 'connected':
            case 'completed':
                // If connecting, transition to active (if not already handled by connectionstatechange)
                if (currentStatus === 'connecting') {
                    setRealtimeSessionStatus('active');
                    document.dispatchEvent(new CustomEvent('realtime-state-update'));
                }
                break;
            case 'failed':
                console.error("ICE connection failed.");
                if (currentStatus !== 'error') { // Prevent duplicate notifications/termination
                    showNotification("Live connection failed (ICE).", 'error');
                    setRealtimeSessionStatus('error');
                    document.dispatchEvent(new CustomEvent('realtime-state-update'));
                    terminateSession();
                }
                break;
            case 'disconnected':
            case 'closed':
                console.log("ICE connection disconnected or closed.");
                if (getIsRealtimeSessionActive() && pc.iceConnectionState === 'closed') {
                   terminateSession();
                }
                break;
        }
    };

    pc.onconnectionstatechange = () => {
        console.log("Peer Connection State:", pc.connectionState);
        const currentStatus = getRealtimeSessionStatus();
        switch (pc.connectionState) {
            case 'connected':
                console.log("WebRTC connection established successfully.");
                 if (currentStatus !== 'active') { // Update only if not already active
                    setRealtimeSessionStatus('active');
                    document.dispatchEvent(new CustomEvent('realtime-state-update'));
                    showNotification("Live session active.", 'info');
                 }
                break;
            case 'failed':
                console.error("Peer connection failed.");
                 if (currentStatus !== 'error') { // Prevent duplicate notifications/termination
                    showNotification("Live connection failed (Peer).", 'error');
                    setRealtimeSessionStatus('error');
                    document.dispatchEvent(new CustomEvent('realtime-state-update'));
                    terminateSession();
                 }
                break;
            case 'disconnected':
                console.warn("Peer connection disconnected. Attempting to reconnect...");
                 if (currentStatus === 'active') { // Only show connecting if was previously active
                    setRealtimeSessionStatus('connecting');
                    document.dispatchEvent(new CustomEvent('realtime-state-update'));
                 }
                break;
            case 'closed':
                console.log("Peer connection closed.");
                 if (getIsRealtimeSessionActive()) {
                   terminateSession();
                }
                break;
        }
    };

    pc.ontrack = (event) => {
        console.log("Remote track received:", event.track.kind);
        if (event.track.kind === 'audio') {
            setRealtimeRemoteAudioStream(event.streams[0]);
            document.dispatchEvent(new CustomEvent('realtime-state-update')); // Notify UI (though UI doesn't use stream directly)
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
        // Connection is considered fully active when data channel is open
        if (getRealtimeSessionStatus() !== 'active') {
            setRealtimeSessionStatus('active');
            document.dispatchEvent(new CustomEvent('realtime-state-update'));
            showNotification("Live session active.", 'info');
        }
    };

    dc.onclose = () => {
        console.log("Data channel closed:", dc.label);
        // If the session is still marked active, terminate it
        if (getIsRealtimeSessionActive()) {
            console.warn("Data channel closed unexpectedly while session was active. Terminating.");
            terminateSession();
        }
    };

    dc.onerror = (error) => {
        console.error("Data channel error:", error);
        if (getRealtimeSessionStatus() !== 'error') { // Prevent duplicate notifications/termination
            showNotification("Data channel error.", 'error');
            setRealtimeSessionStatus('error');
            document.dispatchEvent(new CustomEvent('realtime-state-update'));
            terminateSession();
        }
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
            console.log("Server confirmed session creation:", eventData.session?.id || eventData.session_id);
            // Status usually set by connection state change
            break;

        case 'response.text.delta':
            // Append text delta to the current transcript
            if (eventData.delta || typeof eventData.delta === 'string') { // Handle empty string delta too
                setCurrentRealtimeTranscript(getCurrentRealtimeTranscript() + eventData.delta);
                document.dispatchEvent(new CustomEvent('realtime-state-update')); // Notify UI
            }
            break;

        case 'response.audio.delta':
            // Audio is handled via the 'ontrack' event
            // console.log("Received audio delta event (metadata only):", eventData);
            break;

        case 'response.done':
            console.log("Server indicated end of response turn.");
            // Log the final transcript for now, as planned
            console.log("Final Transcript:", getCurrentRealtimeTranscript());
            // Reset transcript for the next turn
            setCurrentRealtimeTranscript('');
            document.dispatchEvent(new CustomEvent('realtime-state-update')); // Notify UI
            // TODO: Decide how to integrate into chat history later.
            break;

        case 'input_audio_buffer.speech_started':
            console.log("Server detected user speech started.");
            setCurrentRealtimeTranscript(''); // Clear transcript when user starts speaking
            document.dispatchEvent(new CustomEvent('realtime-state-update')); // Notify UI
            // TODO: Update UI indicator to show user is speaking (e.g., "Listening...")
            break;

        case 'input_audio_buffer.speech_stopped':
            console.log("Server detected user speech stopped.");
            // TODO: Update UI indicator (e.g., "Processing...")
            break;

        case 'error':
            console.error("Received error event from server:", eventData.message || eventData);
            if (getRealtimeSessionStatus() !== 'error') { // Prevent duplicate notifications/termination
                showNotification(`Live session error: ${eventData.message || 'Unknown error'}`, 'error');
                setRealtimeSessionStatus('error');
                document.dispatchEvent(new CustomEvent('realtime-state-update'));
                // Terminate based on severity if needed
                if (eventData.is_fatal || eventData.code === 'session_expired') {
                    terminateSession();
                }
            }
            break;

        // Add other event handlers as needed (e.g., function_call, session.updated)
        case 'session.updated':
             console.log("Session updated by server:", eventData.session);
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
    const dc = getRealtimeDataChannel();
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
    // Ensure we have a valid stream before assigning
    if (stream && stream instanceof MediaStream) {
        audioEl.srcObject = stream;
        audioEl.play().catch(error => {
            console.error("Audio playback failed:", error);
            // Autoplay might be blocked, user interaction might be needed
            showNotification("Could not play AI audio automatically.", "warning");
        });
    } else {
        console.error("Invalid stream provided to playRemoteAudio.");
    }
}
