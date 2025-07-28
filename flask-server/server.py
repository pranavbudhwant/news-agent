from flask import Flask, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from datetime import datetime
import uuid
import time
import threading
from agent import NewsAgent

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
CORS(app)

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory storage for messages and sessions
messages = []
sessions = {}  # Store session data per client

# Initialize the news agent
news_agent = NewsAgent({
    'tone_of_voice': None,
    'response_format': None,
    'language': None,
    'interaction_style': None,
    'news_topics': None
})

@app.route('/')
def health_check():
    """Health check endpoint"""
    return {
        'status': 'success',
        'message': 'Chat server is running with WebSocket support!',
        'timestamp': datetime.now().isoformat()
    }

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    client_id = request.sid
    print(f'Client {client_id} connected')
    
    # Initialize session for this client
    sessions[client_id] = {
        'thread_id': None,
        'assistant_id': None,
        'preferences': {
            'tone_of_voice': None,
            'response_format': None,
            'language': None,
            'interaction_style': None,
            'news_topics': None
        },
        'preferences_complete': False,
        'current_preference_index': 0,
        'message_count': 0
    }
    
    emit('connection_response', {
        'status': 'connected',
        'message': 'Successfully connected to chat server'
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    client_id = request.sid
    print(f'Client {client_id} disconnected')
    # Clean up session
    if client_id in sessions:
        del sessions[client_id]

def send_bot_response(client_id, content, delay=1):
    """Send a bot response after a delay"""
    def delayed_response():
        time.sleep(delay)
        
        # Create bot message
        bot_message = {
            'id': str(uuid.uuid4()),
            'content': content,
            'author': 'Assistant',
            'user_id': 'assistant',
            'timestamp': datetime.now().isoformat()
        }
        
        # Store message
        messages.append(bot_message)
        
        # Broadcast bot message to the specific client
        socketio.emit('new_message', bot_message, room=client_id)
    
    # Start the delayed response in a separate thread
    thread = threading.Thread(target=delayed_response)
    thread.daemon = True
    thread.start()

@socketio.on('send_message')
def handle_send_message(data):
    """Handle sending a message"""
    client_id = request.sid
    content = data.get('content', '').strip()
    
    if not content:
        emit('error', {'message': 'Message content cannot be empty'})
        return
    
    # Get or create session
    if client_id not in sessions:
        sessions[client_id] = {
            'thread_id': None,
            'assistant_id': None,
            'preferences': {
                'tone_of_voice': None,
                'response_format': None,
                'language': None,
                'interaction_style': None,
                'news_topics': None
            },
            'preferences_complete': False,
            'current_preference_index': 0,
            'message_count': 0
        }
    
    session = sessions[client_id]
    session['message_count'] += 1
    
    # Create user message
    user_message = {
        'id': str(uuid.uuid4()),
        'content': content,
        'author': 'User',
        'user_id': 'user',
        'timestamp': datetime.now().isoformat()
    }
    
    # Store message
    messages.append(user_message)
    
    # Broadcast user message to all connected clients
    emit('new_message', user_message, broadcast=True)
    
    # Handle preference collection for first message
    if session['message_count'] == 1:
        # Start preference collection with the first question
        first_question = news_agent.preference_questions[0]
        send_bot_response(client_id, first_question['question'], delay=0.5)
    else:
        # Process with news agent if preferences are complete
        if session['preferences_complete']:
            process_with_news_agent(client_id, content)
        else:
            # Continue preference collection
            handle_preference_collection(client_id, content)

def handle_preference_collection(client_id, user_input):
    """Handle preference collection flow"""
    session = sessions[client_id]
    preference_questions = news_agent.preference_questions
    
    # Store the user's answer for the current question
    if session['current_preference_index'] < len(preference_questions):
        current_question = preference_questions[session['current_preference_index']]
        preference_key = current_question['key']
        
        # Store the user's answer
        session['preferences'][preference_key] = user_input
        
        # Update the preference in the UI
        emit('preference_update', {
            'preferenceId': preference_key,
            'value': user_input
        }, room=client_id)
        
        session['current_preference_index'] += 1
        
        # Check if all preferences are collected
        if session['current_preference_index'] >= len(preference_questions):
            session['preferences_complete'] = True
            # Send completion message
            send_bot_response(client_id, "Great! I have all your preferences. Now I can help you with news and information. What would you like to know about?", delay=0.5)
        else:
            # Ask next question
            next_question = preference_questions[session['current_preference_index']]
            send_bot_response(client_id, next_question['question'], delay=0.5)
    else:
        # Fallback - process with news agent
        process_with_news_agent(client_id, user_input)

def process_with_news_agent(client_id, user_input):
    """Process message with the news agent"""
    session = sessions[client_id]
    
    try:
        # Process with news agent
        response, session_data = news_agent.process_message(
            thread_id=session['thread_id'],
            user_message=user_input,
            preferences=session['preferences']
        )
        
        # Update session with new data
        if 'thread_id' in session_data:
            session['thread_id'] = session_data['thread_id']
        if 'assistant_id' in session_data:
            session['assistant_id'] = session_data['assistant_id']
        
        # Send response
        send_bot_response(client_id, response, delay=0.5)
        
    except Exception as e:
        error_message = f"I apologize, but I encountered an error: {str(e)}"
        send_bot_response(client_id, error_message, delay=0.5)

@socketio.on('delete_message')
def handle_delete_message(data):
    """Handle deleting a message"""
    message_id = data.get('message_id')
    
    if not message_id:
        emit('error', {'message': 'Message ID is required'})
        return
    
    # Find the message
    message_to_delete = None
    for i, msg in enumerate(messages):
        if msg['id'] == message_id:
            # Only allow deletion of user messages (not bot messages)
            if msg['user_id'] == 'user':
                message_to_delete = messages.pop(i)
                break
            else:
                emit('error', {'message': 'You can only delete your own messages'})
                return
    
    if message_to_delete:
        # Notify all clients about message deletion
        emit('message_deleted', {
            'message_id': message_id,
            'deleted_by': 'User'
        }, broadcast=True)
    else:
        emit('error', {'message': 'Message not found'})

@socketio.on('clear_chat')
def handle_clear_chat():
    """Handle clearing all messages"""
    client_id = request.sid
    global messages
    message_count = len(messages)
    messages.clear()
    
    # Reset session preferences
    if client_id in sessions:
        sessions[client_id]['preferences_complete'] = False
        sessions[client_id]['current_preference_index'] = 0
        sessions[client_id]['message_count'] = 0
        sessions[client_id]['preferences'] = {
            'tone_of_voice': None,
            'response_format': None,
            'language': None,
            'interaction_style': None,
            'news_topics': None
        }
        
        # Reset preferences in UI
        emit('preferences_reset', room=client_id)
    
    # Notify all clients that chat was cleared
    emit('chat_cleared', {
        'cleared_by': 'User',
        'message': f'Chat cleared ({message_count} messages removed)',
        'timestamp': datetime.now().isoformat()
    }, broadcast=True)

if __name__ == '__main__':
    print("🚀 Starting WebSocket Chat Server with News Agent...")
    print("📡 Server will be available at: http://localhost:5001")
    print("🤖 News Agent enabled with preference collection")
    print("🔌 WebSocket events available:")
    print("  connect          - Client connection")
    print("  disconnect       - Client disconnection")
    print("  send_message     - Send a message")
    print("  delete_message   - Delete your message")
    print("  clear_chat       - Clear all messages")
    
    socketio.run(app, debug=True, host='0.0.0.0', port=5001)