/**
 * Video Chat Component
 * 
 * This component provides a video chat interface using WebRTC with
 * optimized performance and AI-powered features.
 */

import React, { useState, useEffect, useRef } from 'react';
import WebRTCService from '../services/webrtc/webrtcService';

const VideoChat = ({ roomId, userId, username, onError }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peers, setPeers] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  const localVideoRef = useRef(null);
  const webrtcService = useRef(null);
  const socketRef = useRef(null);
  
  // Initialize WebRTC service
  useEffect(() => {
    webrtcService.current = new WebRTCService();
    
    const initWebRTC = async () => {
      try {
        await webrtcService.current.initialize({
          onRemoteStreamAdded: handleRemoteStreamAdded,
          onRemoteStreamRemoved: handleRemoteStreamRemoved,
          onDataChannelMessage: handleDataChannelMessage,
          onConnectionStateChange: handleConnectionStateChange,
          onError: handleError
        });
        
        // Check WebRTC support
        if (!WebRTCService.isWebRTCSupported()) {
          throw new Error('WebRTC is not supported in this browser');
        }
        
        // Check QUIC support
        if (WebRTCService.isQUICSupported()) {
          console.log('QUIC transport is supported');
        } else {
          console.log('QUIC transport is not supported, using standard WebRTC');
        }
        
        // Get user media
        const stream = await webrtcService.current.getUserMedia({
          audio: true,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });
        
        setLocalStream(stream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        // Connect to signaling server
        connectToSignalingServer();
      } catch (error) {
        console.error('Error initializing WebRTC:', error);
        handleError(error);
      }
    };
    
    if (roomId && userId) {
      initWebRTC();
    }
    
    return () => {
      // Clean up
      if (webrtcService.current) {
        webrtcService.current.closeAllConnections();
      }
      
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [roomId, userId]);
  
  // Connect to signaling server
  const connectToSignalingServer = () => {
    const serverUrl = process.env.REACT_APP_SIGNALING_SERVER_URL || window.location.origin;
    
    // Connect to signaling server
    const socket = io(serverUrl, {
      path: '/webrtc',
      query: {
        roomId,
        userId,
        username
      }
    });
    
    // Set up socket event handlers
    socket.on('connect', () => {
      console.log('Connected to signaling server');
      setConnectionStatus('connecting');
      
      // Join room
      socket.emit('join', {
        roomId,
        userId,
        username
      });
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      setConnectionStatus('disconnected');
      setIsConnected(false);
      setPeers({});
      setRemoteStreams({});
    });
    
    socket.on('room_joined', (data) => {
      console.log('Joined room:', data);
      setConnectionStatus('connected');
      setIsConnected(true);
      
      // Create peer connections for existing users
      data.users.forEach(user => {
        createPeerConnection(user.socketId, true);
      });
    });
    
    socket.on('user_joined', (data) => {
      console.log('User joined:', data);
      
      // Create peer connection for new user
      createPeerConnection(data.user.socketId, false);
      
      // Add system message
      addSystemMessage(`${data.user.username} joined the room`);
    });
    
    socket.on('user_left', (data) => {
      console.log('User left:', data);
      
      // Clean up peer connection
      if (peers[data.socketId]) {
        webrtcService.current.cleanupPeerConnection(data.socketId);
        
        // Remove peer
        setPeers(prevPeers => {
          const newPeers = { ...prevPeers };
          delete newPeers[data.socketId];
          return newPeers;
        });
        
        // Remove remote stream
        setRemoteStreams(prevStreams => {
          const newStreams = { ...prevStreams };
          delete newStreams[data.socketId];
          return newStreams;
        });
        
        // Add system message
        const peerUsername = peers[data.socketId]?.username || 'A user';
        addSystemMessage(`${peerUsername} left the room`);
      }
    });
    
    socket.on('offer', async (data) => {
      console.log('Received offer:', data);
      
      try {
        // Create answer
        const answer = await webrtcService.current.createAnswer(data.sourceId, data.sdp);
        
        // Send answer
        socket.emit('answer', {
          targetId: data.sourceId,
          sdp: answer
        });
      } catch (error) {
        console.error('Error creating answer:', error);
        handleError(error);
      }
    });
    
    socket.on('answer', async (data) => {
      console.log('Received answer:', data);
      
      try {
        // Set remote description
        await webrtcService.current.setRemoteDescription(data.sourceId, data.sdp);
      } catch (error) {
        console.error('Error setting remote description:', error);
        handleError(error);
      }
    });
    
    socket.on('candidate', async (data) => {
      console.log('Received ICE candidate:', data);
      
      try {
        // Add ICE candidate
        await webrtcService.current.addIceCandidate(data.sourceId, data.candidate);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
        handleError(error);
      }
    });
    
    socket.on('message', (data) => {
      console.log('Received message:', data);
      
      // Add message
      const peer = peers[data.sourceId];
      
      if (peer) {
        addMessage({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sender: peer.username,
          content: data.message,
          timestamp: new Date().toISOString(),
          isLocal: false
        });
      }
    });
    
    socket.on('room_closed', (data) => {
      console.log('Room closed:', data);
      setConnectionStatus('disconnected');
      setIsConnected(false);
      setPeers({});
      setRemoteStreams({});
      
      // Add system message
      addSystemMessage('The room has been closed');
    });
    
    socket.on('error', (error) => {
      console.error('Signaling server error:', error);
      handleError(new Error(error.message || 'Signaling server error'));
    });
    
    socketRef.current = socket;
  };
  
  // Create a peer connection
  const createPeerConnection = async (peerId, isInitiator) => {
    try {
      // Create peer connection
      webrtcService.current.createPeerConnection(peerId, isInitiator);
      
      // Add peer
      setPeers(prevPeers => ({
        ...prevPeers,
        [peerId]: {
          id: peerId,
          username: `User-${peerId.substr(0, 6)}`,
          isInitiator
        }
      }));
      
      // Create offer if initiator
      if (isInitiator) {
        const offer = await webrtcService.current.createOffer(peerId);
        
        // Send offer
        socketRef.current.emit('offer', {
          targetId: peerId,
          sdp: offer
        });
      }
    } catch (error) {
      console.error('Error creating peer connection:', error);
      handleError(error);
    }
  };
  
  // Handle remote stream added
  const handleRemoteStreamAdded = (stream, peerId) => {
    console.log('Remote stream added:', peerId);
    
    // Add remote stream
    setRemoteStreams(prevStreams => ({
      ...prevStreams,
      [peerId]: stream
    }));
  };
  
  // Handle remote stream removed
  const handleRemoteStreamRemoved = (peerId) => {
    console.log('Remote stream removed:', peerId);
    
    // Remove remote stream
    setRemoteStreams(prevStreams => {
      const newStreams = { ...prevStreams };
      delete newStreams[peerId];
      return newStreams;
    });
  };
  
  // Handle data channel message
  const handleDataChannelMessage = (message, peerId) => {
    console.log('Data channel message:', message, 'from:', peerId);
    
    try {
      // Parse message
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      // Handle different message types
      switch (data.type) {
        case 'chat':
          // Add message
          const peer = peers[peerId];
          
          if (peer) {
            addMessage({
              id: data.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              sender: peer.username,
              content: data.content,
              timestamp: data.timestamp || new Date().toISOString(),
              isLocal: false
            });
          }
          break;
          
        case 'username':
          // Update peer username
          setPeers(prevPeers => ({
            ...prevPeers,
            [peerId]: {
              ...prevPeers[peerId],
              username: data.username
            }
          }));
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling data channel message:', error);
    }
  };
  
  // Handle connection state change
  const handleConnectionStateChange = (state, peerId) => {
    console.log('Connection state change:', state, 'for peer:', peerId);
    
    // Update peer connection state
    setPeers(prevPeers => ({
      ...prevPeers,
      [peerId]: {
        ...prevPeers[peerId],
        connectionState: state
      }
    }));
  };
  
  // Handle error
  const handleError = (error) => {
    console.error('WebRTC error:', error);
    
    if (onError) {
      onError(error);
    }
  };
  
  // Toggle audio
  const toggleAudio = () => {
    if (webrtcService.current) {
      webrtcService.current.setAudioEnabled(!isAudioEnabled);
      setIsAudioEnabled(!isAudioEnabled);
    }
  };
  
  // Toggle video
  const toggleVideo = () => {
    if (webrtcService.current) {
      webrtcService.current.setVideoEnabled(!isVideoEnabled);
      setIsVideoEnabled(!isVideoEnabled);
    }
  };
  
  // Toggle screen sharing
  const toggleScreenSharing = async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (localStream) {
          // Get user media again
          const stream = await webrtcService.current.getUserMedia({
            audio: true,
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 }
            }
          });
          
          setLocalStream(stream);
          
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          
          // Update all peer connections
          Object.keys(peers).forEach(peerId => {
            webrtcService.current.cleanupPeerConnection(peerId);
            createPeerConnection(peerId, true);
          });
        }
        
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: 'always'
            },
            audio: false
          });
          
          // Replace video track
          if (localStream) {
            const videoTrack = screenStream.getVideoTracks()[0];
            
            const senders = [];
            Object.keys(peers).forEach(peerId => {
              const peerConnection = webrtcService.current.peerConnections.get(peerId);
              
              if (peerConnection) {
                peerConnection.getSenders().forEach(sender => {
                  if (sender.track && sender.track.kind === 'video') {
                    senders.push(sender);
                  }
                });
              }
            });
            
            // Replace track in all senders
            senders.forEach(sender => {
              sender.replaceTrack(videoTrack);
            });
            
            // Replace track in local stream
            const newStream = new MediaStream([
              ...localStream.getAudioTracks(),
              videoTrack
            ]);
            
            setLocalStream(newStream);
            
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = newStream;
            }
            
            // Handle screen sharing ended
            videoTrack.onended = () => {
              toggleScreenSharing();
            };
          }
          
          setIsScreenSharing(true);
        } catch (error) {
          console.error('Error getting display media:', error);
          handleError(error);
        }
      }
    } catch (error) {
      console.error('Error toggling screen sharing:', error);
      handleError(error);
    }
  };
  
  // Send message
  const sendMessage = () => {
    if (!messageInput.trim()) {
      return;
    }
    
    // Create message
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: username,
      content: messageInput,
      timestamp: new Date().toISOString(),
      isLocal: true
    };
    
    // Add message
    addMessage(message);
    
    // Send message to all peers
    const messageData = {
      type: 'chat',
      id: message.id,
      content: message.content,
      timestamp: message.timestamp
    };
    
    // Send via data channel
    webrtcService.current.broadcastMessage(messageData);
    
    // Send via signaling server as fallback
    if (socketRef.current) {
      socketRef.current.emit('message', {
        broadcast: true,
        message: messageData
      });
    }
    
    // Clear input
    setMessageInput('');
  };
  
  // Add message
  const addMessage = (message) => {
    setMessages(prevMessages => [...prevMessages, message]);
  };
  
  // Add system message
  const addSystemMessage = (content) => {
    addMessage({
      id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: 'System',
      content,
      timestamp: new Date().toISOString(),
      isSystem: true
    });
  };
  
  // Handle message input change
  const handleMessageInputChange = (e) => {
    setMessageInput(e.target.value);
  };
  
  // Handle message input key press
  const handleMessageInputKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Render remote videos
  const renderRemoteVideos = () => {
    return Object.entries(remoteStreams).map(([peerId, stream]) => {
      const peer = peers[peerId] || { username: `User-${peerId.substr(0, 6)}` };
      
      return (
        <div key={peerId} className="remote-video-container">
          <video
            className="remote-video"
            autoPlay
            playsInline
            ref={el => {
              if (el) {
                el.srcObject = stream;
              }
            }}
          />
          <div className="remote-video-overlay">
            <span className="remote-video-username">{peer.username}</span>
            <span className="remote-video-connection-state">
              {peer.connectionState === 'connected' ? '🟢' : peer.connectionState === 'connecting' ? '🟠' : '🔴'}
            </span>
          </div>
        </div>
      );
    });
  };
  
  // Render messages
  const renderMessages = () => {
    return messages.map(message => (
      <div
        key={message.id}
        className={`message ${message.isLocal ? 'message-local' : ''} ${message.isSystem ? 'message-system' : ''}`}
      >
        <div className="message-header">
          <span className="message-sender">{message.sender}</span>
          <span className="message-timestamp">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="message-content">{message.content}</div>
      </div>
    ));
  };
  
  return (
    <div className="video-chat">
      <div className="video-container">
        <div className="local-video-container">
          <video
            className="local-video"
            autoPlay
            playsInline
            muted
            ref={localVideoRef}
          />
          <div className="local-video-overlay">
            <span className="local-video-username">{username}</span>
            <span className="local-video-connection-state">
              {connectionStatus === 'connected' ? '🟢' : connectionStatus === 'connecting' ? '🟠' : '🔴'}
            </span>
          </div>
        </div>
        <div className="remote-videos">
          {renderRemoteVideos()}
        </div>
      </div>
      
      <div className="controls">
        <button
          className={`control-button ${isAudioEnabled ? 'active' : 'inactive'}`}
          onClick={toggleAudio}
          title={isAudioEnabled ? 'Mute' : 'Unmute'}
        >
          {isAudioEnabled ? '🎤' : '🔇'}
        </button>
        <button
          className={`control-button ${isVideoEnabled ? 'active' : 'inactive'}`}
          onClick={toggleVideo}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {isVideoEnabled ? '📹' : '🚫'}
        </button>
        <button
          className={`control-button ${isScreenSharing ? 'active' : 'inactive'}`}
          onClick={toggleScreenSharing}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
        >
          {isScreenSharing ? '📺' : '🖥️'}
        </button>
      </div>
      
      <div className="chat">
        <div className="chat-messages">
          {renderMessages()}
        </div>
        <div className="chat-input">
          <textarea
            value={messageInput}
            onChange={handleMessageInputChange}
            onKeyPress={handleMessageInputKeyPress}
            placeholder="Type a message..."
            disabled={!isConnected}
          />
          <button
            onClick={sendMessage}
            disabled={!isConnected || !messageInput.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
