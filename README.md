# News Agent

A real-time news agent application with a Next.js frontend and Flask backend that provides personalized news updates through WebSocket communication.

## Prerequisites

- Python 3.8+
- Node.js 18+
- npm or pnpm

## Setup

### Backend (Flask Server)

1. Navigate to the Flask server directory:
   ```bash
   cd flask-server
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables (create a `.env` file):
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   EXA_API_KEY=your_exa_api_key_here
   ```

4. Start the Flask server:
   ```bash
   python server.py
   ```

The backend will run on `http://localhost:5001`

### Frontend (Next.js)

1. Navigate to the client directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

The frontend will run on `http://localhost:3000`

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. The application will connect to the Flask backend via WebSocket
3. Follow the preference collection process to customize your news experience
4. Start chatting with the news agent to receive personalized news updates

## Features

- Real-time WebSocket communication
- Personalized news preferences
- OpenAI integration for intelligent responses
- Modern React/Next.js UI with Tailwind CSS
- Socket.IO for real-time messaging

## Project Structure

```
latest-news-agent/
├── client/                 # Next.js frontend
│   ├── app/               # React components
│   └── package.json       # Frontend dependencies
└── flask-server/          # Flask backend
    ├── server.py          # Main server file
    ├── agent.py           # News agent logic
    └── requirements.txt   # Python dependencies
```
