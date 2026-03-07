import eventlet
eventlet.monkey_patch()

import os
import requests
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import time
import random
import csv
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

def get_ollama_models():
    try:
        # Check if Ollama is even alive first
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        if response.status_code == 200:
            models = response.json().get('models', [])
            suitable_models = []
            for m in models:
                name = m.get('name')
                details = m.get('details', {})
                param_size = details.get('parameter_size', "")
                
                try:
                    is_small = True
                    if param_size:
                        size_str = param_size.lower().replace('b', '')
                        # Try to handle cases like "7.2B" or "8B"
                        if float(size_str.split(' ')[0]) > 9:
                            is_small = False
                    
                    if is_small:
                        suitable_models.append({
                            "name": name,
                            "parameter_size": param_size or "Unknown"
                        })
                except:
                    suitable_models.append({
                        "name": name,
                        "parameter_size": "Unknown"
                    })
            return suitable_models
    except:
        return []
    return []

@app.route('/api/detect-llm', methods=['GET'])
def detect_llm():
    models = get_ollama_models()
    return jsonify({
        "status": "success" if models else "failed",
        "models": models
    })

# Global state
rooms = {} # room_id -> { active_llms: {sid: info}, history: [], topic: str }
all_topics = []

def load_topics():
    global all_topics
    try:
        with open('topics.csv', 'r') as f:
            reader = csv.DictReader(f)
            all_topics = [row['topic'] for row in reader]
    except Exception as e:
        print(f"Error loading topics: {e}")
        all_topics = ["General Chat", "AI Future", "Robotics"]

load_topics()

@app.route('/api/topics', methods=['GET'])
def get_topics():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 12))
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    paginated_topics = all_topics[start_idx:end_idx]
    
    results = []
    for topic_name in paginated_topics:
        # Get active count for this room
        room_info = rooms.get(topic_name, {})
        active_count = len(room_info.get('active_llms', {}))
        results.append({
            "name": topic_name,
            "active_count": active_count
        })
        
    return jsonify({
        "topics": results,
        "total": len(all_topics),
        "page": page,
        "limit": limit
    })

def add_to_history(room_id, msg_type, data):
    if room_id not in rooms: return
    history = rooms[room_id]['history']
    if "timestamp" not in data:
        data["timestamp"] = datetime.now().strftime("%H:%M:%S")
    history.append({"type": msg_type, "data": data})
    if len(history) > 50:
        history.pop(0)

def broadcast_llm_list(room_id):
    if room_id not in rooms: return
    active_llms = rooms[room_id]['active_llms']
    llm_list = [
        {"name": info["name"], "avatar": info["avatar"], "model": info["model"]} 
        for info in active_llms.values()
    ]
    socketio.emit('update_participants', llm_list, room=room_id)

@socketio.on('join')
def handle_join(data):
    # data: { name, avatar, model, session_id, room_id }
    name = data.get('name')
    model = data.get('model')
    avatar = data.get('avatar')
    session_id = data.get('session_id')
    room_id = data.get('room_id', 'General Chat')
    
    join_room(room_id)
    
    if room_id not in rooms:
        rooms[room_id] = {'active_llms': {}, 'history': [], 'topic': room_id}
    
    room_info = rooms[room_id]
    active_llms = room_info['active_llms']
    
    # DEDUPLICATION: Remove old entries with the same session_id in this room
    to_remove = [sid for sid, info in active_llms.items() if info.get('session_id') == session_id]
    for sid in to_remove:
        del active_llms[sid]

    active_llms[request.sid] = {
        "name": name,
        "model": model,
        "avatar": avatar,
        "session_id": session_id,
        "room_id": room_id
    }
    
    sys_msg = {
        "text": f"SYSTEM: {name} (LLM: {model}) has joined #{room_id}!",
        "type": "join"
    }
    socketio.emit('system_message', sys_msg, room=room_id)
    add_to_history(room_id, 'system', sys_msg)
    
    # Send history specifically to the joining client
    socketio.emit('chat_history', room_info['history'], to=request.sid)
    
    broadcast_llm_list(room_id)
    
    # Simple intro
    socketio.start_background_task(llm_introduce, request.sid, room_id)

def llm_introduce(sid, room_id):
    if room_id not in rooms: return
    llm_info = rooms[room_id]['active_llms'].get(sid)
    if not llm_info: return
    
    socketio.emit('llm_action', {"name": llm_info['name'], "action": "thinking"}, room=room_id)
    prompt = f"You are {llm_info['name']}, an AI participating in an IRC chat room about '{room_id}'. Introduce yourself briefly and share a thought on this topic. Keep it short and friendly."
    
    socketio.sleep(1)
    response = call_ollama(llm_info['model'], prompt)
    socketio.emit('llm_action', {"name": llm_info['name'], "action": "idle"}, room=room_id)
    
    msg_data = {
        "sender": llm_info['name'],
        "avatar": llm_info['avatar'],
        "text": response,
        "is_llm": True
    }
    socketio.emit('chat_message', msg_data, room=room_id)
    add_to_history(room_id, 'chat', msg_data)

def call_ollama(model, prompt):
    try:
        payload = {"model": model, "prompt": prompt, "stream": False}
        response = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=60)
        return response.json().get('response', "I am currently speechless.")
    except Exception as e:
        return f"Error connecting to LLM: {str(e)}"

@socketio.on('message')
def handle_message(data):
    # data: { text, sender, room_id }
    text = data.get('text', '')
    sender = data.get('sender', 'Human')
    room_id = data.get('room_id')
    
    if not room_id: return

    msg_data = {
        "sender": sender,
        "text": text,
        "is_llm": False,
        "avatar": "👤"
    }
    socketio.emit('chat_message', msg_data, room=room_id)
    add_to_history(room_id, 'chat', msg_data)
    
    # Trigger LLM reactions in that room
    if room_id in rooms and rooms[room_id]['active_llms']:
        socketio.start_background_task(llm_participate, room_id, text)

def llm_participate(room_id, last_message, turn=1, max_turns=3):
    if room_id not in rooms or not rooms[room_id]['active_llms'] or turn > max_turns:
        return
    
    active_llms = rooms[room_id]['active_llms']
    participants = list(active_llms.keys())
    chosen_sid = random.choice(participants)
    llm_info = active_llms[chosen_sid]
    
    socketio.emit('llm_action', {"name": llm_info['name'], "action": "thinking"}, room=room_id)
    
    prompt = f"Topic: {room_id}. Message: '{last_message}'. As {llm_info['name']}, respond briefly and insightfully. Keep context."
    
    socketio.sleep(random.randint(2, 5))
    response = call_ollama(llm_info['model'], prompt)
    socketio.emit('llm_action', {"name": llm_info['name'], "action": "idle"}, room=room_id)
    
    msg_data = {
        "sender": llm_info['name'],
        "avatar": llm_info['avatar'],
        "text": response,
        "is_llm": True
    }
    socketio.emit('chat_message', msg_data, room=room_id)
    add_to_history(room_id, 'chat', msg_data)

    if turn < max_turns and random.random() > 0.3:
        socketio.start_background_task(llm_participate, room_id, response, turn + 1, max_turns)

@socketio.on('leave')
def handle_leave(data=None):
    # Some older calls might not pass data
    room_id = data.get('room_id') if data else None
    
    # Find which room this sid is in if room_id not provided
    sids_to_check = [request.sid]
    
    for rid, info in list(rooms.items()):
        if request.sid in info['active_llms']:
            llm_info = info['active_llms'][request.sid]
            name = llm_info['name']
            del info['active_llms'][request.sid]
            leave_room(rid)
            
            sys_msg = {
                "text": f"SYSTEM: {name} has left #{rid}.",
                "type": "leave"
            }
            socketio.emit('system_message', sys_msg, room=rid)
            add_to_history(rid, 'system', sys_msg)
            broadcast_llm_list(rid)

@socketio.on('disconnect')
def handle_disconnect():
    handle_leave()

@app.route('/api/status', methods=['GET'])
def server_status():
    return jsonify({"status": "healthy", "rooms": len(rooms)})

if __name__ == '__main__':
    # We'll remove the global topic_pusher for now to keep it simple, 
    # as discussion happens per room when someone (human or bot) starts it.
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)
