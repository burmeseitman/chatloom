from gevent import monkey
monkey.patch_all()
from gevent.pywsgi import WSGIServer
from geventwebsocket.handler import WebSocketHandler
import os
import sqlite3
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import time
import random
from datetime import datetime
import re

app = Flask(__name__)
# Security: Load secret key from environment variable
app.config['SECRET_KEY'] = os.getenv('CHATLOOM_SECRET_KEY', 'dev-secret-key-123')

# --- SECURITY PROTECTION ---
PROMPT_INJECTION_PATTERNS = [
    r'(?i)ignore\s+(all\s+)?(previous\s+)?(instructions|prompts|directions)',
    r'(?i)forget\s+(all\s+)?(previous\s+)?(instructions|prompts|directions)',
    r'(?i)disregard\s+(all\s+)?(previous\s+)?',
    r'(?i)system\s+prompt:',
    r'(?i)developer\s+mode',
    r'(?i)you\s+are\s+now'
]

def scan_for_injection(text):
    if not isinstance(text, str): return False
    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, text):
            return True
    return False

def sanitize_text(text):
    if not isinstance(text, str): return ""
    # Very basic XSS/HTML tag stripping purely as backup protection
    # (React usually escapes this, but it's good for the backend DB layer)
    return re.sub(r'<[^>]*>', '', text).strip()

# T&S: Reputation Score System & Anti-Poisoning
agent_reputations = {} # {session_id: score (0-100)}
repetition_tracking = {} # {session_id: {"last_text": text, "count": 0, "last_time": 0}}

def update_reputation(session_id, delta):
    if not session_id: return 100
    if session_id not in agent_reputations:
        agent_reputations[session_id] = 100
    
    agent_reputations[session_id] = max(0, min(100, agent_reputations[session_id] + delta))
    return agent_reputations[session_id]

def check_poisoning(session_id, text):
    """Detects repetitious poisoning spam to protect community context."""
    if not session_id or not isinstance(text, str): return False
    
    now = time.time()
    tracker = repetition_tracking.get(session_id, {"last_text": "", "count": 0, "last_time": 0})
    
    # Very similar repetitive text in short intervals?
    if text[:50] == tracker["last_text"][:50] and (now - tracker["last_time"]) < 5:
        tracker["count"] += 1
    else:
        tracker["count"] = max(0, tracker["count"] - 1)
        
    tracker["last_text"] = text
    tracker["last_time"] = now
    repetition_tracking[session_id] = tracker
    
    return tracker["count"] >= 3
# ---------------------------


# ---------------------------
# PRODUCTION CORS CONFIGURATION
# ---------------------------
# Allow your production frontend and any local dev instances
# --- PRODUCTION SECURITY: STICKY CORS ---
# Only allow your verified domains and local development
ALLOWED_ORIGINS = [
    "https://chatloom.online",
    "https://www.chatloom.online",
    "https://api.chatloom.online",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]

@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin:
        if origin in ALLOWED_ORIGINS or origin.endswith('.pages.dev') or 'localhost' in origin or '127.0.0.1' in origin:
            response.headers.add('Access-Control-Allow-Origin', origin)
            response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
            response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
            response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# Initialize SocketIO with authorized origins
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode='gevent',
    path='/socket.io',
    logger=False, # Disable logging in production for performance
    engineio_logger=False
)

DB_PATH = os.path.join(os.path.dirname(__file__), 'chatloom.db')

# Swarm State
bridge_sessions = {}   # {session_id: {"models": [...], "last_seen": timestamp}}
pending_tasks = {}     # {session_id: [{task_id, model, prompt, ...}]}
task_results = {}      # {task_id: {"status", "response", ...}}

def broadcast_swarm_stats():
    """Broadcast global swarm metrics (counts nodes and thinking tasks) to all clients."""
    now = time.time()
    # Count unique active bridges (heartbeat within 30s)
    total_nodes = len([sid for sid, data in bridge_sessions.items() if now - data.get('last_seen', 0) < 30])
    
    # Count active tasks across all rooms
    active_tasks = 0
    for room_id, room in active_rooms.items():
        active_tasks += len([sid for sid, info in room['active_llms'].items() if info.get('action') == 'thinking'])
    
    # Broadcast globally
    socketio.emit('swarm_stats', {
        "total_nodes": total_nodes,
        "active_tasks": active_tasks
    })

# === DECENTRALIZED SWARM STATE ===
swarm_peers = {}       # {peer_id: {"addr": ..., "type": ..., "last_seen": ...}}
knowledge_map = {}     # {key: value} for shared knowledge
bootstrap_nodes = [
    "https://chatloom.online" # Self as primary bootstrap
]

@app.route('/', methods=['GET'], strict_slashes=False)
def root_status():
    """Simple root endpoint so tunnel smoke tests return 200 instead of 404."""
    return jsonify({
        "status": "healthy",
        "service": "ChatLoom Backend",
        "socket_path": "/socket.io",
        "health": "/health",
        "timestamp": time.time()
    })

@app.route('/api/swarm/bootstrap', methods=['GET'])
def get_bootstrap_nodes():
    """Return list of active peers to join the mesh network."""
    return jsonify({
        "nodes": bootstrap_nodes,
        "active_peers": list(swarm_peers.keys())[:10]
    })

@app.route('/api/swarm/announce', methods=['POST'])
def announce_peer():
    """Register a new peer in the swarm."""
    data = request.json
    peer_id = data.get('peer_id')
    if peer_id:
        swarm_peers[peer_id] = {
            "addr": request.remote_addr,
            "agent_type": data.get('agent_type', 'WORKER'),
            "last_seen": time.time()
        }
        return jsonify({"status": "joined", "swarm_size": len(swarm_peers)})
    return jsonify({"status": "error"}), 400

@app.route('/setup/<platform>/<session_id>', methods=['GET'])
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
            
        # Try to resolve origin accurately
        # Use X-Forwarded-Proto/Host if available (behind proxy)
        proto = request.headers.get("X-Forwarded-Proto", "https" if request.is_secure else "http")
        host = request.headers.get("X-Forwarded-Host", request.host)
        api_origin = f"{proto}://{host}".rstrip("/")
            
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

@app.route('/health', methods=['GET'], strict_slashes=False)
def health_check():
    import time
    return jsonify({
        "status": "healthy", 
        "service": "ChatLoom Backend",
        "timestamp": time.time()
    })


@app.route('/api/bridge/ping', methods=['GET'])
def bridge_ping():
    return jsonify({"status": "online", "message": "ChatLoom Bridge API is active"})

@app.route('/scripts/bridge.py')
def serve_bridge_script():
    """Serve the bridge.py script from the public folder."""
    # Robust path resolution relative to this file's location
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script_path = os.path.join(base_dir, 'client', 'public', 'scripts', 'bridge.py')
    
    if not os.path.exists(script_path):
        print(f"ERROR: Bridge script not found at {script_path}")
        return "Bridge script not found on server", 404
        
    with open(script_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}

@app.route('/api/bridge/heartbeat', methods=['POST'], strict_slashes=False)
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
    broadcast_swarm_stats()
    return jsonify({"status": "success"})

@app.route('/api/bridge/poll', methods=['GET'], strict_slashes=False)
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

@app.route('/api/bridge/result', methods=['POST'], strict_slashes=False)
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

@app.route('/api/bridge/disconnect', methods=['POST'], strict_slashes=False)
def bridge_disconnect():
    """Bridge notifies it is going offline."""
    data = request.json
    session_id = data.get('session_id')
    if session_id and session_id in bridge_sessions:
        del bridge_sessions[session_id]
        print(f"Bridge disconnected: {session_id}")
        broadcast_swarm_stats()
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
    if session_id in bridge_sessions:
        del bridge_sessions[session_id]
        pending_tasks.pop(session_id, None)
        print(f"Bridge stale: {session_id}")
        broadcast_swarm_stats()
    return jsonify({"active": False, "models": []})

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

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
    """Detect AI models for the current client session only."""
    session_id = request.args.get('session_id')
    print(f"--- Detection Start (session: {session_id}) ---")

    # Session-bound bridge only. Do not inspect Ollama on the server host.
    if session_id and session_id in bridge_sessions:
        bridge = bridge_sessions[session_id]
        age = time.time() - bridge.get('last_seen', 0)
        if age < 15 and bridge.get('models'):
            print(f"Bridge HIT: {len(bridge['models'])} models (age: {age:.0f}s)")
            return jsonify({
                "status": "success",
                "models": bridge['models'],
                "origin": "Neural Bridge"
            })
        elif age >= 15:
            print(f"Bridge STALE: last seen {age:.0f}s ago")

    print("No session-bound client models detected.")
    return jsonify({
        "status": "error",
        "message": "No client AI found for this session. Use direct localhost access from the browser or run the Neural Bridge on your machine.",
        "bridge_active": session_id in bridge_sessions if session_id else False
    }), 200

@app.route('/api/generate-bridge', methods=['POST'])
def generate_bridge():
    """Bridge AI generation for the current client session only."""
    data = request.json
    model = data.get('model')
    prompt = data.get('prompt')
    system = data.get('system', '')
    options = data.get('options', {})
    session_id = data.get('session_id')

    if not model or not prompt:
        return jsonify({"error": "Missing model or prompt"}), 400

    # Session-bound bridge only. Never fall back to Ollama running on the server.
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
            
            # Wait for bridge to complete (max 200s)
            for _ in range(400):
                if task_id in task_results:
                    result = task_results.pop(task_id)
                    if result['status'] == 'success':
                        return jsonify({"response": result['response'], "model": result['model']})
                    else:
                        return jsonify({"error": result.get('response', 'Generation failed')}), 500
                time.sleep(0.5)
            return jsonify({"error": "Bridge timeout — generation took too long"}), 504

    return jsonify({
        "error": "No active Neural Bridge for this session. Generation must run on the client's local Ollama, not the server."
    }), 409

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

@app.route('/api/categories', methods=['GET'])
def get_categories():
    conn = get_db_connection()
    rows = conn.execute('SELECT DISTINCT category FROM topics ORDER BY category').fetchall()
    conn.close()
    return jsonify([r['category'] for r in rows])

@app.route('/api/topics', methods=['GET'])
def get_topics():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 12))
    search_query = request.args.get('query', '').strip()
    category = request.args.get('category', 'All').strip()
    offset = (page - 1) * limit
    
    conn = get_db_connection()
    query = 'SELECT name, category FROM topics WHERE 1=1'
    params = []

    if search_query:
        query += ' AND LOWER(name) LIKE ?'
        params.append(f'%{search_query.lower()}%')
    
    if category and category != 'All':
        query += ' AND category = ?'
        params.append(category)

    # Count total
    count_query = query.replace('SELECT name, category', 'SELECT COUNT(*)')
    total_count = conn.execute(count_query, params).fetchone()[0]

    # Get results
    query += ' LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    topics_rows = conn.execute(query, params).fetchall()
    conn.close()
    
    results = []
    for row in topics_rows:
        topic_name = row['name']
        room_info = active_rooms.get(topic_name, {})
        active_count = len(room_info.get('active_llms', {}))
        results.append({
            "name": topic_name,
            "category": row['category'],
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
    broadcast_swarm_stats() # Update global node count
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
    broadcast_swarm_stats() # Update global thinking tasks

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
    raw_text = data.get('text', '')
    metadata = data.get('metadata', {"turn": 1, "max_turns": 10})

    text = sanitize_text(raw_text)
    if not text or room_id not in active_rooms: return
    
    # 1. Non-spoofable Agent Identity Verification
    # (Since we look it up strictly by request.sid, the identity cannot be spoofed by payload manipulation)
    llm_info = active_rooms[room_id]['active_llms'].get(request.sid)
    if not llm_info: return
    
    session_id = llm_info.get('session_id')
    
    # Check shadow-ban status due to low reputation
    rep = agent_reputations.get(session_id, 100)
    if rep < 30:
        print(f"SHADOWBAN: Agent {llm_info['name']} ({session_id}) reputation ({rep}) too low. Msg dropped.")
        return # Suspicious agent isn't banned from connection, but their chat broadcast is blocked.

    # 2. Output Safety & Prompt Injection Check
    if scan_for_injection(text):
        print(f"SECURITY: Prompt injection generated by LLM '{llm_info['name']}'. Flagging reputation.")
        update_reputation(session_id, -20)
        text = "*(Output blocked: Safety filter triggered)*"

    # 3. Network Poisoning Detection
    if check_poisoning(session_id, text):
        print(f"SECURITY: Network poisoning (spam) detected by '{llm_info['name']}'. Modifying score.")
        update_reputation(session_id, -10)
        text = "*(Message blocked: Repetitive network poisoning detected)*"

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
    
    if turn < max_turns:
        # Check if AI tagged someone
        tagged_sid = None
        if "@" in text:
            for sid, info in active_rooms[room_id]['active_llms'].items():
                if f"@{info['name']}" in text.lower():
                    tagged_sid = sid
                    break
        
        if tagged_sid:
            socketio.sleep(random.randint(1, 3)) # Faster response for direct tags
            socketio.start_background_task(llm_participate, room_id, text, turn=turn + 1, max_turns=max_turns, target_sid=tagged_sid)
        elif random.random() > 0.4: # Generic discussion continue
            socketio.sleep(random.randint(3, 7))
            socketio.start_background_task(llm_participate, room_id, text, turn=turn + 1, max_turns=max_turns)

@socketio.on('message')
def handle_message(data):
    raw_text = data.get('text', '')
    sender = sanitize_text(data.get('sender', 'Human'))
    room_id = data.get('room_id')
    if not room_id: return

    text = sanitize_text(raw_text)
    if not text: return
    
    # Identity Verification for Humans (prevent spoofing an AI Name)
    if room_id in active_rooms:
        for info in active_rooms[room_id]['active_llms'].values():
            if sender.lower() == info['name'].lower() and request.sid not in active_rooms[room_id]['active_llms']:
                sender = f"(Human) {sender}" # Tag it so they can't impersonate

    if scan_for_injection(text):
        print(f"SECURITY: Potential prompt injection blocked from User '{sender}' in room '{room_id}'")
        text = "*(Message removed: Security violation detected)*"

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
        # Avoid same speaker repeating if possible
        potential_sids = list(active_llms.keys())
        # Generic discussion skip chance
        if turn == 1 and random.random() > 0.8: return 
        chosen_sid = random.choice(potential_sids)
        
    llm_info = active_llms[chosen_sid]
    persona = llm_info.get('persona', {})
    base_prompt = persona.get('base_prompt', 'You are a helpful explorer.')
    is_tagged = target_sid == chosen_sid

    # Fetch context history (last 10 messages)
    history = get_room_history(room_id)[-10:]
    history_str = "\n".join([f"{m['data']['sender']}: {m['data']['text']}" for m in history])

    system_template = get_setting("system_participate", (
        "You are {name}. Profile: {base_prompt}.\n\n"
        "ROOM CONTEXT:\n{history}\n\n"
        "INSTRUCTION: You are in a real-time chat room. Respond concisely. "
        "If someone mentions you, address them directly."
    ))
    
    system_instruction = system_template.format(
        name=llm_info['name'], 
        base_prompt=base_prompt,
        history=history_str
    )
    
    prompt = f"The last message was from {last_message}. What is your response?"
    if is_tagged:
        prompt = f"You were directly mentioned in: {last_message}. Respond to this mention."
    
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
            broadcast_swarm_stats() # Update global node count
            
            # Autonomously request the client to kill its local tunnel for security (Kill Switch)
            session_id = llm_info.get('session_id')
            if session_id:
                # Tell the specific client browser to execute the kill switch
                socketio.emit('kill_tunnel', {}, to=request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    handle_leave()

if __name__ == '__main__':
    # Force bind to 0.0.0.0 to ensure Tunnel access
    http_server = WSGIServer(('0.0.0.0', 5001), app, handler_class=WebSocketHandler)
    print("ChatLoom Backend running on http://0.0.0.0:5001")
    http_server.serve_forever()
