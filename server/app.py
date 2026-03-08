from gevent import monkey
monkey.patch_all()
from gevent.pywsgi import WSGIServer
from geventwebsocket.handler import WebSocketHandler
import os
import requests
import sqlite3
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import time
import random
from datetime import datetime

app = Flask(__name__)
# Security: Load secret key from environment variable
app.config['SECRET_KEY'] = os.getenv('CHATLOOM_SECRET_KEY', 'dev-secret-key-123')
CORS(app)
# In production, replace "*" with your specific frontend domain (e.g., https://chatloom.pages.dev)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
DB_PATH = os.path.join(os.path.dirname(__file__), 'chatloom.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_ollama_models(base_url=OLLAMA_URL):
    try:
        response = requests.get(f"{base_url}/api/tags", timeout=3)
        if response.status_code == 200:
            models = response.json().get('models', [])
            suitable_models = []
            for m in models:
                # Security/Logic: Only include models that have a local digest (installed locally)
                # and don't have "cloud" in their name (common for proxies)
                name_lower = m.get('name', '').lower()
                if not m.get('digest') or "cloud" in name_lower: 
                    continue
                    
                suitable_models.append({
                    "name": m.get('name'),
                    "parameter_size": m.get('details', {}).get('parameter_size', 'unknown')
                })
            return suitable_models
    except:
        return []
    return []

def get_setting(key, default=None):
    try:
        conn = get_db_connection()
        row = conn.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchone()
        conn.close()
        return row['value'] if row else default
    except:
        return default

@app.route('/api/detect-llm', methods=['GET'])
def detect_llm():
    """Strictly detect models for the CURRENT PC only."""
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    # Strip IPv6-mapped IPv4 prefix
    if client_ip and client_ip.startswith('::ffff:'):
        client_ip = client_ip.replace('::ffff:', '')
        
    print(f"--- Detection Start ---")
    print(f"Requester IP: {client_ip}")

    # Case 1: Requester is the Main Server PC
    if not client_ip or client_ip in ['127.0.0.1', 'localhost', '::1']:
        print("Action: Scanning Main PC (Local)")
        models = get_ollama_models(OLLAMA_URL)
        return jsonify({
            "status": "success" if models else "error",
            "models": models,
            "origin": "Main PC"
        })

    # Case 2: Requester is a Remote PC
    print(f"Action: Scanning Client PC at {client_ip}")
    remote_url = f"http://{client_ip}:11434"
    try:
        # We use a slightly longer timeout for remote network detection
        response = requests.get(f"{remote_url}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            suitable = [{"name": m['name'], "parameter_size": m.get('details', {}).get('parameter_size', 'unknown')} for m in models]
            print(f"Success: Found {len(suitable)} models at {client_ip}")
            return jsonify({
                "status": "success",
                "models": suitable,
                "origin": "Remote Node"
            })
    except Exception as e:
        print(f"Failure: Could not reach {remote_url}. Error: {str(e)}")
    
    return jsonify({
        "status": "error",
        "message": f"Could not detect Ollama at {client_ip}. If you are on a remote machine, ensure Ollama is listening on the network.",
        "models": [],
        "detected_ip": client_ip
    }), 404

@app.route('/api/generate-bridge', methods=['POST'])
def generate_bridge():
    """Bridge for generation when browser-to-ollama direct access is blocked (Mixed Content)."""
    data = request.json
    model = data.get('model')
    prompt = data.get('prompt')
    system = data.get('system', '')
    options = data.get('options', {})

    if not model or not prompt:
        return jsonify({"error": "Missing model or prompt"}), 400

    try:
        # We proxy the request to the local Ollama instance
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "system": system,
                "options": options,
                "stream": False
            },
            timeout=180 # Longer timeout for generation
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        print(f"Bridge Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/personas', methods=['GET', 'POST'])
def handle_personas():
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        conn.execute('INSERT INTO personas (name, avatar, description, base_prompt) VALUES (?, ?, ?, ?)',
                    (data['name'], data['avatar'], data.get('description', ''), data['base_prompt']))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    
    rows = conn.execute('SELECT * FROM personas ORDER BY id DESC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/user/<session_id>', methods=['GET'])
def get_user(session_id):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE session_id = ?', (session_id,)).fetchone()
    conn.close()
    if user:
        return jsonify(dict(user))
    return jsonify(None), 404

@app.route('/api/user', methods=['POST'])
def upsert_user():
    data = request.json
    session_id = data.get('session_id')
    nickname = data.get('nickname')
    model_name = data.get('model_name')
    hardware_mode = data.get('hardware_mode')
    persona_id = data.get('persona_id')

    if not session_id or not nickname:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400

    conn = get_db_connection()
    try:
        # Check if nickname is taken by someone else
        existing = conn.execute('SELECT session_id FROM users WHERE nickname = ?', (nickname,)).fetchone()
        if existing and existing['session_id'] != session_id:
            return jsonify({"status": "error", "message": "Nickname already taken"}), 400

        conn.execute('''
            INSERT INTO users (session_id, nickname, model_name, hardware_mode, persona_id, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(session_id) DO UPDATE SET
                nickname = excluded.nickname,
                model_name = excluded.model_name,
                hardware_mode = excluded.hardware_mode,
                persona_id = excluded.persona_id,
                updated_at = CURRENT_TIMESTAMP
        ''', (session_id, nickname, model_name, hardware_mode, persona_id))
        conn.commit()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/check-nickname', methods=['GET'])
def check_nickname():
    name = request.args.get('name')
    session_id = request.args.get('session_id')
    if not name:
        return jsonify({"available": False})
    
    conn = get_db_connection()
    user = conn.execute('SELECT session_id FROM users WHERE nickname = ?', (name,)).fetchone()
    
    if not user or user['session_id'] == session_id:
        conn.close()
        return jsonify({"available": True})
    
    # Suggest names
    suggestions = []
    for _ in range(3):
        suffix = random.randint(100, 999)
        suggested = f"{name}{suffix}"
        # Verify suggestion is also free
        if not conn.execute('SELECT 1 FROM users WHERE nickname = ?', (suggested,)).fetchone():
            suggestions.append(suggested)
            
    conn.close()
    return jsonify({
        "available": False,
        "suggestions": suggestions
    })

# Global state for ACTIVE connections only
active_rooms = {}

@app.route('/api/topics', methods=['GET'])
def get_topics():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 12))
    search_query = request.args.get('query', '').strip()
    offset = (page - 1) * limit
    
    print(f"--- Topics API Call ---")
    print(f"Page: {page}, Limit: {limit}, Query: '{search_query}'")
    
    conn = get_db_connection()
    if search_query:
        # Case-insensitive search filter
        search_pattern = f'%{search_query.lower()}%'
        topics_rows = conn.execute(
            'SELECT name FROM topics WHERE LOWER(name) LIKE ? LIMIT ? OFFSET ?',
            (search_pattern, limit, offset)
        ).fetchall()
        total_count = conn.execute(
            'SELECT COUNT(*) FROM topics WHERE LOWER(name) LIKE ?',
            (search_pattern,)
        ).fetchone()[0]
        print(f"Search Result: Found {total_count} items")
    else:
        # Default view
        topics_rows = conn.execute('SELECT name FROM topics LIMIT ? OFFSET ?', (limit, offset)).fetchall()
        total_count = conn.execute('SELECT COUNT(*) FROM topics').fetchone()[0]
        print(f"Default View: {total_count} items total")
    conn.close()
    
    results = []
    for row in topics_rows:
        topic_name = row['name']
        # Get active count from memory state
        room_info = active_rooms.get(topic_name, {})
        active_count = len(room_info.get('active_llms', {}))
        results.append({
            "name": topic_name,
            "active_count": active_count
        })
        
    return jsonify({
        "topics": results,
        "total": total_count,
        "page": page,
        "limit": limit
    })

def add_to_history(room_id, msg_type, data):
    conn = get_db_connection()
    timestamp = data.get("timestamp") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute('''
        INSERT INTO messages (room_id, sender, avatar, text, msg_type, is_llm, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        room_id,
        data.get("sender", "SYSTEM"),
        data.get("avatar", ""),
        data.get("text", ""),
        msg_type,
        1 if data.get("is_llm") else 0,
        timestamp
    ))
    conn.commit()
    conn.close()

def get_room_history(room_id):
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT sender, avatar, text, msg_type, is_llm, timestamp 
        FROM messages WHERE room_id = ? 
        ORDER BY id ASC LIMIT 50
    ''', (room_id,)).fetchall()
    conn.close()
    
    history = []
    for r in rows:
        history.append({
            "type": r['msg_type'],
            "data": {
                "sender": r['sender'],
                "avatar": r['avatar'],
                "text": r['text'],
                "is_llm": bool(r['is_llm']),
                "timestamp": r['timestamp'],
                "isSystem": r['msg_type'] == 'system'
            }
        })
    return history

def broadcast_llm_list(room_id):
    if room_id not in active_rooms: return
    active_llms = active_rooms[room_id]['active_llms']
    llm_list = [
        {
            "name": info["name"], 
            "avatar": info["avatar"], 
            "model": info["model"],
            "action": info.get("action", "idle")
        } 
        for info in active_llms.values()
    ]
    print(f"DEBUG: Broadcasting {len(llm_list)} participants to #{room_id}")
    socketio.emit('update_participants', llm_list, room=room_id)

@socketio.on('join')
def handle_join(data):
    name = data.get('name')
    model = data.get('model')
    avatar = data.get('avatar', '🤖')
    session_id = data.get('session_id')
    room_id = data.get('room_id', 'General Chat')
    persona = data.get('persona', {})

    if room_id not in active_rooms:
        active_rooms[room_id] = {
            'active_llms': {},
            'last_activity': time.time(),
            'last_message': f"Room '{room_id}' created."
        }
        # Start a background autonomous pulse for this room
        socketio.start_background_task(neural_pulse, room_id)
    
    # Nickname uniqueness check
    for sid, info in active_rooms[room_id]['active_llms'].items():
        if info['name'] == name and info['session_id'] != session_id:
            emit('join_error', {'message': f"ID '{name}' is occupied."})
            return

    join_room(room_id)
    
    # Cleanup old session SIDs
    old_sids = [sid for sid, info in active_rooms[room_id]['active_llms'].items() if info.get('session_id') == session_id]
    for osid in old_sids:
        if osid in active_rooms[room_id]['active_llms']:
            del active_rooms[room_id]['active_llms'][osid]

    active_rooms[room_id]['active_llms'][request.sid] = {
        "name": name, 
        "model": model, 
        "avatar": avatar, 
        "persona": persona,
        "session_id": session_id,
        "action": "idle"
    }
    
    sys_msg = {"text": f"SYSTEM: {name} (AI Guardian) has joined the discussion.", "type": "join"}
    socketio.emit('system_message', sys_msg, room=room_id)
    add_to_history(room_id, 'system', sys_msg)
    
    history = get_room_history(room_id)
    socketio.emit('chat_history', history, to=request.sid)
    broadcast_llm_list(room_id)
    socketio.start_background_task(llm_introduce, request.sid, room_id)

def neural_pulse(room_id):
    """The autonomous heartbeat - now much more conservative for slow hardware."""
    print(f"DEBUG: Neural Pulse started for #{room_id}")
    while room_id in active_rooms:
        socketio.sleep(30) # Check every 30 seconds
        
        room = active_rooms.get(room_id)
        if not room: break
        
        # Check if anyone is already thinking - if so, don't pulse
        is_anyone_busy = any(p.get('action') == 'thinking' for p in room['active_llms'].values())
        
        # If quiet for too long, no one is busy, and AIs are present
        quiet_duration = time.time() - room['last_activity']
        if quiet_duration > 40 and not is_anyone_busy and room['active_llms']:
            print(f"DEBUG: Room #{room_id} is very quiet. Spurring short AI chat.")
            socketio.start_background_task(llm_participate, room_id, room['last_message'], turn=1, max_turns=3)

@socketio.on('llm_action')
def handle_llm_action(data):
    room_id = data.get('room_id')
    if not room_id: return
    
    # Update activity and persistent state
    if room_id in active_rooms:
        active_rooms[room_id]['last_activity'] = time.time()
        # Find the participant and update their action persistently
        for sid, info in active_rooms[room_id]['active_llms'].items():
            if info['name'] == data.get('name'):
                info['action'] = data.get('action')
                break
        
    # Broadcast to everyone in the room
    emit('llm_action', {
        "name": data.get('name'),
        "action": data.get('action')
    }, room=room_id, include_self=True)

def llm_introduce(sid, room_id):
    if room_id not in active_rooms: return
    llm_info = active_rooms[room_id]['active_llms'].get(sid)
    if not llm_info: return
    
    persona = llm_info.get('persona', {})
    base_prompt = persona.get('base_prompt', 'You are a helpful explorer.')

    system_template = get_setting("system_intro", (
        "You are {name}. Your character: {base_prompt}. "
        "IMPORTANT: You are in a chat room. Do NOT mention you are an AI assistant or a language model. "
        "Stay strictly in character."
    ))
    
    system_instruction = system_template.format(name=llm_info['name'], base_prompt=base_prompt)
    prompt = f"Topic: '{room_id}'. The conversation is just starting. Introduce yourself briefly to the group consistent with your persona."
    
    # Delegate generation to the client's browser
    socketio.emit('request_generation', {
        "system": system_instruction,
        "prompt": prompt,
        "model": llm_info['model'],
        "room_id": room_id,
        "metadata": {
            "turn": 1,
            "max_turns": 10
        }
    }, to=sid)

@socketio.on('llm_response')
def handle_llm_response(data):
    room_id = data.get('room_id')
    text = data.get('text')
    metadata = data.get('metadata', {"turn": 1, "max_turns": 10})
    
    if room_id not in active_rooms: return
    llm_info = active_rooms[room_id]['active_llms'].get(request.sid)
    if not llm_info: return

    # Update activity
    active_rooms[room_id]['last_activity'] = time.time()
    active_rooms[room_id]['last_message'] = text

    msg_data = {
        "sender": llm_info['name'],
        "avatar": llm_info['avatar'],
        "text": text,
        "is_llm": True,
        "time": datetime.now().strftime('%H:%M:%S')
    }
    socketio.emit('chat_message', msg_data, room=room_id)
    add_to_history(room_id, 'chat', msg_data)

    # Trigger next AI turn (discussion chain)
    turn = metadata.get('turn', 1)
    max_turns = metadata.get('max_turns', 10)
    
    if turn < max_turns and random.random() > 0.3:
        # Avoid same AI talking to itself instantly
        socketio.sleep(random.randint(2, 5))
        socketio.start_background_task(llm_participate, room_id, text, turn=turn + 1, max_turns=max_turns)

@socketio.on('message')
def handle_message(data):
    text = data.get('text', '')
    sender = data.get('sender', 'Human')
    room_id = data.get('room_id')
    if not room_id: return

    # Update activity
    if room_id in active_rooms:
        active_rooms[room_id]['last_activity'] = time.time()
        active_rooms[room_id]['last_message'] = text

    msg_data = {"sender": sender, "text": text, "is_llm": False, "avatar": "🛡️"}
    socketio.emit('chat_message', msg_data, room=room_id)
    add_to_history(room_id, 'chat', msg_data)
    
    if room_id in active_rooms and active_rooms[room_id]['active_llms']:
        # Check if someone was tagged
        tagged_name = None
        if "@" in text:
            for sid, info in active_rooms[room_id]['active_llms'].items():
                if f"@{info['name']}" in text:
                    tagged_name = info['name']
                    socketio.start_background_task(llm_participate, room_id, text, target_sid=sid, max_turns=10)
                    return
        
        # If no one specifically tagged, random AI might still jump in
        socketio.start_background_task(llm_participate, room_id, text, max_turns=10)

def llm_participate(room_id, last_message, turn=1, max_turns=10, target_sid=None):
    if room_id not in active_rooms or not active_rooms[room_id]['active_llms'] or turn > max_turns:
        return
    
    active_llms = active_rooms[room_id]['active_llms']
    if target_sid and target_sid in active_llms:
        chosen_sid = target_sid
    else:
        # Autonomous Pulse skips the random silence chance if it's the starter
        if turn == 1 and random.random() > 0.9: return 
        chosen_sid = random.choice(list(active_llms.keys()))
        
    llm_info = active_llms[chosen_sid]
    persona = llm_info.get('persona', {})
    base_prompt = persona.get('base_prompt', 'You are a helpful explorer.')
    is_tagged = target_sid == chosen_sid

    system_template = get_setting("system_participate", (
        "You are {name}. Your character: {base_prompt}."
    ))
    
    system_instruction = system_template.format(name=llm_info['name'], base_prompt=base_prompt)
    
    prompt_template = get_setting("prompt_wrapper", "{last_message}")
    prompt = prompt_template.format(
        room_id=room_id,
        tagged="Yes" if is_tagged else "No",
        last_message=last_message,
        name=llm_info['name']
    )
    
    # Update activity to prevent double pulse during generation
    if room_id in active_rooms:
        active_rooms[room_id]['last_activity'] = time.time()
 
    # Delegate generation to the client's browser
    socketio.emit('request_generation', {
        "system": system_instruction,
        "prompt": prompt,
        "model": llm_info['model'],
        "room_id": room_id,
        "metadata": {
            "turn": turn,
            "max_turns": max_turns
        }
    }, to=chosen_sid)

    # Note: Recursive chains (max_turns) will be triggered when the server receives the 'llm_response'
    # To keep simplicity, we'll handle recursion in llm_response if needed.

@socketio.on('leave')
def handle_leave(data=None):
    # Search rooms to find the participant by sid
    for rid, info in list(active_rooms.items()):
        if request.sid in info['active_llms']:
            llm_info = info['active_llms'][request.sid]
            name = llm_info['name']
            del info['active_llms'][request.sid]
            leave_room(rid)
            sys_msg = {"text": f"SYSTEM: {name} disconnected.", "type": "leave"}
            socketio.emit('system_message', sys_msg, room=rid)
            add_to_history(rid, 'system', sys_msg)
            broadcast_llm_list(rid)

@socketio.on('disconnect')
def handle_disconnect():
    handle_leave()

if __name__ == '__main__':
    print("--- Production Server (gevent) is running on http://0.0.0.0:5001 ---")
    http_server = WSGIServer(('0.0.0.0', 5001), app, handler_class=WebSocketHandler)
    http_server.serve_forever()
