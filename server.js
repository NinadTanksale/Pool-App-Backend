const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ["https://your-app-name.vercel.app"] 
      : ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data storage
let polls = [];
let users = {};
let currentPoll = null;
let pollHistory = [];
let chatMessages = [];

// Generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// REST API endpoints
app.get('/api/polls', (req, res) => {
  res.json({
    success: true,
    data: polls
  });
});

app.get('/api/polls/current', (req, res) => {
  res.json({
    success: true,
    data: currentPoll
  });
});

app.get('/api/polls/history', (req, res) => {
  res.json({
    success: true,
    data: pollHistory
  });
});

app.post('/api/polls', (req, res) => {
  const { question, options, duration = 60, createdBy } = req.body;
  
  const poll = {
    id: generateId(),
    question,
    options: options.map(option => ({ text: option, votes: 0, voters: [] })),
    duration,
    createdBy,
    createdAt: new Date(),
    isActive: false,
    responses: {}
  };
  
  polls.push(poll);
  
  res.json({
    success: true,
    message: 'Poll created successfully',
    data: poll
  });
});

app.post('/api/polls/:pollId/start', (req, res) => {
  const { pollId } = req.params;
  const poll = polls.find(p => p.id === pollId);
  
  if (!poll) {
    return res.status(404).json({ success: false, message: 'Poll not found' });
  }
  
  // End current poll if any
  if (currentPoll) {
    currentPoll.isActive = false;
    pollHistory.push({ ...currentPoll, endedAt: new Date() });
  }
  
  poll.isActive = true;
  poll.startedAt = new Date();
  currentPoll = poll;
  
  // Broadcast poll start to all clients
  io.emit('pollStarted', poll);
  
  // Auto-end poll after duration
  setTimeout(() => {
    if (currentPoll && currentPoll.id === pollId) {
      currentPoll.isActive = false;
      pollHistory.push({ ...currentPoll, endedAt: new Date() });
      io.emit('pollEnded', currentPoll);
      currentPoll = null;
    }
  }, poll.duration * 1000);
  
  res.json({
    success: true,
    message: 'Poll started successfully',
    data: poll
  });
});

app.post('/api/polls/:pollId/vote', (req, res) => {
  const { pollId } = req.params;
  const { optionIndex, userId } = req.body;
  
  const poll = polls.find(p => p.id === pollId);
  
  if (!poll || !poll.isActive) {
    return res.status(400).json({ success: false, message: 'Poll not active' });
  }
  
  // Remove previous vote if exists
  poll.options.forEach(option => {
    const voterIndex = option.voters.indexOf(userId);
    if (voterIndex > -1) {
      option.voters.splice(voterIndex, 1);
      option.votes--;
    }
  });
  
  // Add new vote
  if (poll.options[optionIndex]) {
    poll.options[optionIndex].voters.push(userId);
    poll.options[optionIndex].votes++;
    poll.responses[userId] = optionIndex;
  }
  
  // Broadcast updated results
  io.emit('pollResults', poll);
  
  res.json({
    success: true,
    message: 'Vote recorded successfully',
    data: poll
  });
});

app.get('/api/users', (req, res) => {
  res.json({
    success: true,
    data: Object.values(users)
  });
});

app.post('/api/users/register', (req, res) => {
  const { name, role } = req.body;
  const userId = generateId();
  
  const user = {
    id: userId,
    name,
    role, // 'teacher' or 'student'
    joinedAt: new Date(),
    isOnline: true
  };
  
  users[userId] = user;
  
  res.json({
    success: true,
    message: 'User registered successfully',
    data: user
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  socket.on('userJoined', (userData) => {
    const { userId, name, role } = userData;
    
    if (!users[userId]) {
      users[userId] = {
        id: userId,
        name,
        role,
        joinedAt: new Date(),
        isOnline: true,
        socketId: socket.id
      };
    } else {
      users[userId].isOnline = true;
      users[userId].socketId = socket.id;
    }
    
    socket.userId = userId;
    
    // Send current poll if active
    if (currentPoll && currentPoll.isActive) {
      socket.emit('pollStarted', currentPoll);
    }
    
    // Send current users list
    io.emit('usersUpdated', Object.values(users).filter(u => u.isOnline));
    
    console.log(`User ${name} (${role}) joined`);
  });
  
  socket.on('sendMessage', (messageData) => {
    const { userId, message } = messageData;
    const user = users[userId];
    
    if (user) {
      const chatMessage = {
        id: generateId(),
        userId,
        userName: user.name,
        userRole: user.role,
        message,
        timestamp: new Date()
      };
      
      chatMessages.push(chatMessage);
      
      // Keep only last 100 messages
      if (chatMessages.length > 100) {
        chatMessages = chatMessages.slice(-100);
      }
      
      io.emit('newMessage', chatMessage);
    }
  });
  
  socket.on('kickUser', (data) => {
    const { targetUserId, kickedBy } = data;
    const kicker = users[kickedBy];
    const target = users[targetUserId];
    
    if (kicker && kicker.role === 'teacher' && target) {
      // Find target's socket and disconnect
      const targetSocket = [...io.sockets.sockets.values()]
        .find(s => s.userId === targetUserId);
      
      if (targetSocket) {
        targetSocket.emit('kicked');
        targetSocket.disconnect();
      }
      
      target.isOnline = false;
      io.emit('usersUpdated', Object.values(users).filter(u => u.isOnline));
      
      console.log(`User ${target.name} was kicked by ${kicker.name}`);
    }
  });
  
  socket.on('requestPollHistory', () => {
    socket.emit('pollHistoryData', pollHistory);
  });
  
  socket.on('disconnect', () => {
    if (socket.userId && users[socket.userId]) {
      users[socket.userId].isOnline = false;
      io.emit('usersUpdated', Object.values(users).filter(u => u.isOnline));
      console.log(`User ${users[socket.userId].name} disconnected`);
    }
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Live Polling System server running on port ${PORT}`);
});