/**
 * WebRTC Service
 * 
 * This service provides WebRTC functionality for real-time audio and video
 * communication with optimized performance using QUIC protocol.
 */

class WebRTCService {
  constructor() {
    this.peerConnections = new Map();
    this.localStream = null;
    this.remoteStreams = new Map();
    this.dataChannels = new Map();
    this.onIceCandidate = this.onIceCandidate.bind(this);
    this.onTrack = this.onTrack.bind(this);
    this.onDataChannel = this.onDataChannel.bind(this);
    this.onConnectionStateChange = this.onConnectionStateChange.bind(this);
    this.onNegotiationNeeded = this.onNegotiationNeeded.bind(this);
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
    
    // Add TURN servers from environment if available
    if (process.env.REACT_APP_TURN_SERVER && process.env.REACT_APP_TURN_USERNAME && process.env.REACT_APP_TURN_CREDENTIAL) {
      this.iceServers.push({
        urls: process.env.REACT_APP_TURN_SERVER,
        username: process.env.REACT_APP_TURN_USERNAME,
        credential: process.env.REACT_APP_TURN_CREDENTIAL
      });
    }
    
    this.callbacks = {
      onRemoteStreamAdded: null,
      onRemoteStreamRemoved: null,
      onDataChannelMessage: null,
      onConnectionStateChange: null,
      onError: null
    };
  }
  
  /**
   * Initialize the WebRTC service
   * @param {Object} callbacks - Callback functions
   * @returns {Promise<void>}
   */
  async initialize(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
    
    try {
      // Check for WebRTC support
      if (!navigator.mediaDevices || !window.RTCPeerConnection) {
        throw new Error('WebRTC is not supported in this browser');
      }
      
      // Initialize QUIC transport if available
      if (window.RTCQuicTransport) {
        console.log('QUIC transport is available');
      } else {
        console.log('QUIC transport is not available, falling back to standard WebRTC');
      }
    } catch (error) {
      console.error('Error initializing WebRTC service:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }
  
  /**
   * Get user media (audio and video)
   * @param {Object} constraints - Media constraints
   * @returns {Promise<MediaStream>} The local media stream
   */
  async getUserMedia(constraints = { audio: true, video: true }) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      console.error('Error getting user media:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Create a peer connection
   * @param {string} peerId - The ID of the peer
   * @param {boolean} isInitiator - Whether this peer is the initiator
   * @returns {RTCPeerConnection} The peer connection
   */
  createPeerConnection(peerId, isInitiator = false) {
    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: this.iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        sdpSemantics: 'unified-plan'
      });
      
      peerConnection.onicecandidate = event => this.onIceCandidate(event, peerId);
      peerConnection.ontrack = event => this.onTrack(event, peerId);
      peerConnection.ondatachannel = event => this.onDataChannel(event, peerId);
      peerConnection.onconnectionstatechange = () => this.onConnectionStateChange(peerConnection, peerId);
      peerConnection.onnegotiationneeded = () => this.onNegotiationNeeded(peerConnection, peerId);
      
      // Add local stream tracks to the connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, this.localStream);
        });
      }
      
      // Create data channel if initiator
      if (isInitiator) {
        const dataChannel = peerConnection.createDataChannel('uc-hub-data', {
          ordered: false,
          maxRetransmits: 3
        });
        
        this.setupDataChannel(dataChannel, peerId);
      }
      
      this.peerConnections.set(peerId, peerConnection);
      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Set up a data channel
   * @param {RTCDataChannel} dataChannel - The data channel
   * @param {string} peerId - The ID of the peer
   */
  setupDataChannel(dataChannel, peerId) {
    dataChannel.onopen = () => {
      console.log(`Data channel with ${peerId} is open`);
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel with ${peerId} is closed`);
    };
    
    dataChannel.onmessage = event => {
      if (this.callbacks.onDataChannelMessage) {
        this.callbacks.onDataChannelMessage(event.data, peerId);
      }
    };
    
    this.dataChannels.set(peerId, dataChannel);
  }
  
  /**
   * Handle ICE candidate events
   * @param {RTCPeerConnectionIceEvent} event - The ICE candidate event
   * @param {string} peerId - The ID of the peer
   */
  onIceCandidate(event, peerId) {
    if (event.candidate) {
      // Send the ICE candidate to the signaling server
      // This should be implemented by the application using this service
      if (this.callbacks.onIceCandidate) {
        this.callbacks.onIceCandidate(event.candidate, peerId);
      }
    }
  }
  
  /**
   * Handle track events
   * @param {RTCTrackEvent} event - The track event
   * @param {string} peerId - The ID of the peer
   */
  onTrack(event, peerId) {
    if (event.streams && event.streams[0]) {
      this.remoteStreams.set(peerId, event.streams[0]);
      
      if (this.callbacks.onRemoteStreamAdded) {
        this.callbacks.onRemoteStreamAdded(event.streams[0], peerId);
      }
    }
  }
  
  /**
   * Handle data channel events
   * @param {RTCDataChannelEvent} event - The data channel event
   * @param {string} peerId - The ID of the peer
   */
  onDataChannel(event, peerId) {
    this.setupDataChannel(event.channel, peerId);
  }
  
  /**
   * Handle connection state change events
   * @param {RTCPeerConnection} peerConnection - The peer connection
   * @param {string} peerId - The ID of the peer
   */
  onConnectionStateChange(peerConnection, peerId) {
    const state = peerConnection.connectionState;
    
    console.log(`Connection state for peer ${peerId} changed to ${state}`);
    
    if (this.callbacks.onConnectionStateChange) {
      this.callbacks.onConnectionStateChange(state, peerId);
    }
    
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      this.cleanupPeerConnection(peerId);
    }
  }
  
  /**
   * Handle negotiation needed events
   * @param {RTCPeerConnection} peerConnection - The peer connection
   * @param {string} peerId - The ID of the peer
   */
  async onNegotiationNeeded(peerConnection, peerId) {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      // Send the offer to the signaling server
      // This should be implemented by the application using this service
      if (this.callbacks.onNegotiationNeeded) {
        this.callbacks.onNegotiationNeeded(peerConnection.localDescription, peerId);
      }
    } catch (error) {
      console.error('Error during negotiation:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }
  
  /**
   * Create an offer
   * @param {string} peerId - The ID of the peer
   * @returns {Promise<RTCSessionDescription>} The offer
   */
  async createOffer(peerId) {
    try {
      let peerConnection = this.peerConnections.get(peerId);
      
      if (!peerConnection) {
        peerConnection = this.createPeerConnection(peerId, true);
      }
      
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      return peerConnection.localDescription;
    } catch (error) {
      console.error('Error creating offer:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Create an answer
   * @param {string} peerId - The ID of the peer
   * @param {RTCSessionDescriptionInit} offer - The offer
   * @returns {Promise<RTCSessionDescription>} The answer
   */
  async createAnswer(peerId, offer) {
    try {
      let peerConnection = this.peerConnections.get(peerId);
      
      if (!peerConnection) {
        peerConnection = this.createPeerConnection(peerId, false);
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      return peerConnection.localDescription;
    } catch (error) {
      console.error('Error creating answer:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Set remote description
   * @param {string} peerId - The ID of the peer
   * @param {RTCSessionDescriptionInit} description - The session description
   * @returns {Promise<void>}
   */
  async setRemoteDescription(peerId, description) {
    try {
      const peerConnection = this.peerConnections.get(peerId);
      
      if (!peerConnection) {
        throw new Error(`No peer connection found for peer ${peerId}`);
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    } catch (error) {
      console.error('Error setting remote description:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Add ICE candidate
   * @param {string} peerId - The ID of the peer
   * @param {RTCIceCandidateInit} candidate - The ICE candidate
   * @returns {Promise<void>}
   */
  async addIceCandidate(peerId, candidate) {
    try {
      const peerConnection = this.peerConnections.get(peerId);
      
      if (!peerConnection) {
        throw new Error(`No peer connection found for peer ${peerId}`);
      }
      
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Send a message through the data channel
   * @param {string} peerId - The ID of the peer
   * @param {string|Object} message - The message to send
   * @returns {boolean} Whether the message was sent
   */
  sendMessage(peerId, message) {
    try {
      const dataChannel = this.dataChannels.get(peerId);
      
      if (!dataChannel || dataChannel.readyState !== 'open') {
        throw new Error(`Data channel for peer ${peerId} is not open`);
      }
      
      const messageString = typeof message === 'string' ? message : JSON.stringify(message);
      dataChannel.send(messageString);
      
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      return false;
    }
  }
  
  /**
   * Broadcast a message to all connected peers
   * @param {string|Object} message - The message to send
   * @returns {Array<string>} Array of peer IDs that received the message
   */
  broadcastMessage(message) {
    const successfulPeers = [];
    
    for (const peerId of this.dataChannels.keys()) {
      if (this.sendMessage(peerId, message)) {
        successfulPeers.push(peerId);
      }
    }
    
    return successfulPeers;
  }
  
  /**
   * Clean up a peer connection
   * @param {string} peerId - The ID of the peer
   */
  cleanupPeerConnection(peerId) {
    const peerConnection = this.peerConnections.get(peerId);
    
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.ondatachannel = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.onnegotiationneeded = null;
      
      peerConnection.close();
      this.peerConnections.delete(peerId);
    }
    
    const dataChannel = this.dataChannels.get(peerId);
    
    if (dataChannel) {
      dataChannel.onopen = null;
      dataChannel.onclose = null;
      dataChannel.onmessage = null;
      
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }
    
    const remoteStream = this.remoteStreams.get(peerId);
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStreams.delete(peerId);
      
      if (this.callbacks.onRemoteStreamRemoved) {
        this.callbacks.onRemoteStreamRemoved(peerId);
      }
    }
  }
  
  /**
   * Close all peer connections
   */
  closeAllConnections() {
    for (const peerId of this.peerConnections.keys()) {
      this.cleanupPeerConnection(peerId);
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
  
  /**
   * Enable or disable audio
   * @param {boolean} enabled - Whether audio should be enabled
   */
  setAudioEnabled(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }
  
  /**
   * Enable or disable video
   * @param {boolean} enabled - Whether video should be enabled
   */
  setVideoEnabled(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }
  
  /**
   * Get connection statistics
   * @param {string} peerId - The ID of the peer
   * @returns {Promise<Object>} The connection statistics
   */
  async getStats(peerId) {
    try {
      const peerConnection = this.peerConnections.get(peerId);
      
      if (!peerConnection) {
        throw new Error(`No peer connection found for peer ${peerId}`);
      }
      
      const stats = await peerConnection.getStats();
      const result = {};
      
      stats.forEach(report => {
        result[report.id] = report;
      });
      
      return result;
    } catch (error) {
      console.error('Error getting stats:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }
  
  /**
   * Check if WebRTC is supported in the current browser
   * @returns {boolean} Whether WebRTC is supported
   */
  static isWebRTCSupported() {
    return !!(navigator.mediaDevices && window.RTCPeerConnection);
  }
  
  /**
   * Check if QUIC transport is supported in the current browser
   * @returns {boolean} Whether QUIC transport is supported
   */
  static isQUICSupported() {
    return !!window.RTCQuicTransport;
  }
}

export default WebRTCService;
