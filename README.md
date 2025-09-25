# Pool System Backend

Express.js server with WebSocket support for the Pool System application.

## Features

- REST API for pool status management
- WebSocket support for real-time updates
- CORS enabled for frontend communication
- Automatic data simulation for demo purposes

## API Endpoints

### GET /api/pool-status
Returns current pool status including temperature, pH, chlorine levels, and system status.

**Response:**
```json
{
  "success": true,
  "data": {
    "temperature": 25.5,
    "ph": 7.2,
    "chlorine": 2.1,
    "status": "active"
  }
}
```

### POST /api/pool-status
Updates pool status with provided data.

**Request Body:**
```json
{
  "temperature": 26.0,
  "ph": 7.5,
  "chlorine": 2.3,
  "status": "active"
}
```

## WebSocket Events

- `connection` - Client connected
- `disconnect` - Client disconnected
- `poolStatusUpdated` - Broadcasts updated pool data
- `requestPoolStatus` - Request current status
- `updatePoolStatus` - Update status via WebSocket

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Start production server:
   ```bash
   npm start
   ```

## Environment Variables

Create a `.env` file:
```
PORT=5000
NODE_ENV=development
```