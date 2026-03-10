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

active_tunnels = {}
bridge_sessions = {}   # {session_id: {"models": [...], "last_seen": timestamp}}
pending_tasks = {}     # {session_id: [{task_id, model, prompt, ...}]}
task_results = {}      # {task_id: {"status", "response", ...}}

@app.route('/api/tunnel', methods=['POST'])
def register_tunnel():
    data = request.json
    session_id = data.get('session_id')
    tunnel_url = data.get('tunnel_url')
    if session_id and tunnel_url:
        active_tunnels[session_id] = tunnel_url
        return jsonify({"status": "success"})
    return jsonify({"status": "error"}), 400

@app.route('/api/tunnel/<session_id>', methods=['GET'])
def get_tunnel(session_id):
    url = active_tunnels.get(session_id)
    if url:
        return jsonify({"tunnel_url": url})
    # Return 200 instead of 404 to keep the console clean during setup polling
    return jsonify({"tunnel_url": None}), 200

@app.route('/api/setup/<platform>/<session_id>', methods=['GET'])
def serve_setup_script(platform, session_id):
    if platform not in ["unix", "windows"]:
        return "Invalid platform", 400
        
    script_name = "setup_unix.sh" if platform == "unix" else "setup_windows.ps1"
    script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'client', 'public', 'scripts', script_name)
    
    if not os.path.exists(script_path):
        return f"Script not found at {script_path}", 404
        
    try:
        with open(script_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Try to resolve origin accurately whether requested directly or proxied
        api_origin = request.headers.get("X-Forwarded-Host", request.host_url).rstrip("/")
        if "http" not in api_origin:
            api_origin = ("https://" if request.is_secure else "http://") + api_origin
            
        if platform == "unix":
            injection = f'\nexport CHATLOOM_SESSION="{session_id}"\nexport CHATLOOM_API="{api_origin}"\n'
            content = content.replace('#!/bin/bash', '#!/bin/bash' + injection)
        else:
            injection = f'$env:CHATLOOM_SESSION="{session_id}"\n$env:CHATLOOM_API="{api_origin}"\n'
            content = injection + content
            
        return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ===================== BRIDGE API =====================

@app.route('/scripts/bridge.py')
def serve_bridge_script():
    """Serve the bridge.py script with session injection."""
    session_id = request.args.get('session_id', '')
    script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'client', 'public', 'scripts', 'bridge.py')
    if not os.path.exists(script_path):
        return "Bridge script not found", 404
    with open(script_path, 'r') as f:
        content = f.read()
    return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}

@app.route('/api/bridge/heartbeat', methods=['POST'])
def bridge_heartbeat():
    """Receive heartbeat from local bridge with model data."""
    data = request.json
    session_id = data.get('session_id')
    models = data.get('models', [])
    if not session_id:
        return jsonify({"status": "error", "message": "Missing session_id"}), 400
    
    bridge_sessions[session_id] = {
        "models": models,
        "last_seen": time.time(),
        "ollama_url": data.get('ollama_url', 'http://127.0.0.1:11434')
    }
    print(f"Bridge heartbeat: {session_id} | {len(models)} models")
    return jsonify({"status": "success"})

@app.route('/api/bridge/poll', methods=['GET'])
def bridge_poll():
    """Bridge polls this to check for pending generation tasks."""
    session_id = request.args.get('session_id')
    if not session_id:
        return jsonify({"task": None})
    
    tasks = pending_tasks.get(session_id, [])
    if tasks:
        task = tasks.pop(0)
        return jsonify({"task": task})
    return jsonify({"task": None})

@app.route('/api/bridge/result', methods=['POST'])
def bridge_result():
    """Receive generation result from bridge."""
    data = request.json
    task_id = data.get('task_id')
    if task_id:
        task_results[task_id] = {
            "status": data.get('status', 'error'),
            "response": data.get('response', ''),
            "model": data.get('model', ''),
            "timestamp": time.time()
        }
    return jsonify({"status": "success"})

@app.route('/api/bridge/disconnect', methods=['POST'])
def bridge_disconnect():
    """Bridge notifies it is going offline."""
    data = request.json
    session_id = data.get('session_id')
    if session_id and session_id in bridge_sessions:
        del bridge_sessions[session_id]
        print(f"Bridge disconnected: {session_id}")
    return jsonify({"status": "success"})

@app.route('/api/bridge/status/<session_id>', methods=['GET'])
def bridge_status(session_id):
    """Check if a bridge is active for this session."""
    bridge = bridge_sessions.get(session_id)
    if bridge and (time.time() - bridge.get('last_seen', 0)) < 15:
        return jsonify({
            "active": True,
            "models": bridge.get('models', []),
            "last_seen": bridge.get('last_seen')
        })
    return jsonify({"active": False, "models": []})

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_ollama_models():
    # Attempt multiple common addresses for robust local and docker support
    targets = [
        os.getenv("OLLAMA_URL", "http://localhost:11434"),
        "http://127.0.0.1:11434",
        "http://host.docker.internal:11434",
        "http://ollama-engine:11434",
        "http://0.0.0.0:11434"
    ]
    # Remove duplicates while preserving order
    targets = list(dict.fromkeys(targets))
    
    for base_url in targets:
        try:
            response = requests.get(f"{base_url}/api/tags", timeout=3)
            if response.status_code == 200:
                # If we found it, save this successful URL globally so that generate_bridge can use it
                global OLLAMA_URL
                OLLAMA_URL = base_url
                models = response.json().get('models', [])
                suitable_models = []
                for m in models:
                    name_lower = m.get('name', '').lower()
                    if not m.get('digest') or "cloud" in name_lower: 
                        continue
                    suitable_models.append({
                        "name": m.get('name'),
                        "parameter_size": m.get('details', {}).get('parameter_size', 'unknown')
                    })
                return suitable_models
        except:
            continue
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
    """Detect AI models — checks bridge first, then tunnel, then local."""
    session_id = request.args.get('session_id')
    print(f"--- Detection Start (session: {session_id}) ---")

    # === PRIORITY 1: Check Bridge (new approach) ===
    if session_id and session_id in bridge_sessions:
        bridge = bridge_sessions[session_id]
        age = time.time() - bridge.get('last_seen', 0)
        if age < 15 and bridge.get('models'):
            print(f"Bridge HIT: {len(bridge['models'])} models (age: {age:.0f}s)")
            return jsonify({
                "status": "success",
                "models": bridge['models'],
                "origin": "Your PC (Bridge)"
            })
        elif age >= 15:
            print(f"Bridge STALE: last seen {age:.0f}s ago")

    # === PRIORITY 2: Check Tunnel (legacy) ===
    if session_id and session_id in active_tunnels:
        tunnel_url = active_tunnels[session_id].rstrip('/')
        print(f"Trying Tunnel: {tunnel_url}")
        try:
            res = requests.get(f"{tunnel_url}/api/tags", timeout=5)
            if res.status_code == 200:
                models = res.json().get('models', [])
                suitable = [{"name": m.get('name', 'unknown'), "parameter_size": m.get('details', {}).get('parameter_size', 'unknown')} for m in models if not (m.get('name', '') or '').lower().startswith('cloud')]
                if suitable:
                    print(f"Tunnel SUCCESS: {len(suitable)} models")
                    return jsonify({"status": "success", "models": suitable, "origin": "Your PC (Tunnel)"})
        except:
            print("Tunnel unreachable, continuing...")

    # === PRIORITY 3: Local Ollama on server ===
    print("Trying local Ollama...")
    models = get_ollama_models()
    if models:
        print(f"Local SUCCESS: {len(models)} models")
        return jsonify({"status": "success", "models": models, "origin": "Local PC (Server)"})

    print("All detection methods exhausted.")
    return jsonify({
        "status": "error",
        "message": "No AI found. Run the Bridge command shown on ChatLoom to connect your Ollama.",
        "bridge_active": session_id in bridge_sessions if session_id else False
    }), 200

@app.route('/api/generate-bridge', methods=['POST'])
def generate_bridge():
    """Bridge for AI generation — uses bridge queue OR direct Ollama."""
    data = request.json
    model = data.get('model')
    prompt = data.get('prompt')
    system = data.get('system', '')
    options = data.get('options', {})
    session_id = data.get('session_id')

    if not model or not prompt:
        return jsonify({"error": "Missing model or prompt"}), 400

    # === TRY 1: Bridge queue (bridge.py handles generation) ===
    if session_id and session_id in bridge_sessions:
        bridge = bridge_sessions[session_id]
        if (time.time() - bridge.get('last_seen', 0)) < 15:
            import uuid
            task_id = str(uuid.uuid4())[:8]
            task = {
                "task_id": task_id,
                "model": model,
                "prompt": prompt,
                "system": system,
                "options": options
            }
            pending_tasks.setdefault(session_id, []).append(task)
            print(f"Generation queued for bridge: {task_id}")
            
            # Wait for bridge to complete (max 120s)
            for _ in range(240):
                if task_id in task_results:
                    result = task_results.pop(task_id)
                    if result['status'] == 'success':
                        return jsonify({"response": result['response'], "model": result['model']})
                    else:
                        return jsonify({"error": result.get('response', 'Generation failed')}), 500
                time.sleep(0.5)
            return jsonify({"error": "Bridge timeout — generation took too long"}), 504

    # === TRY 2: Direct Ollama (if on same machine as backend) ===
    target_url = OLLAMA_URL
    if session_id and session_id in active_tunnels:
        target_url = active_tunnels[session_id].rstrip('/')

    try:
        response = requests.post(
            f"{target_url}/api/generate",
            json={"model": model, "prompt": prompt, "system": system, "options": options, "stream": False},
            timeout=180
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        print(f"Generate Error: {str(e)}")
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
    
    # Cleanup old session SIDs only if they are using the SAME name (allows testing multiple agents in different tabs)
    old_sids = [sid for sid, info in active_rooms[room_id]['active_llms'].items() if info.get('session_id') == session_id and info.get('name') == name]
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
            
            # Autonomously request the client to kill its local tunnel for security (Kill Switch)
            session_id = llm_info.get('session_id')
            if session_id and session_id in active_tunnels:
                # Tell the specific client browser to execute the kill switch
                socketio.emit('kill_tunnel', {}, to=request.sid)
                del active_tunnels[session_id]

@socketio.on('disconnect')
def handle_disconnect():
    handle_leave()

if __name__ == '__main__':
    print("--- Production Server (gevent) is running on http://0.0.0.0:5001 ---")
    http_server = WSGIServer(('0.0.0.0', 5001), app, handler_class=WebSocketHandler)
    http_server.serve_forever()
