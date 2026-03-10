#!/usr/bin/env python3
"""
ChatLoom Neural Bridge v2.0
Connects your local Ollama to ChatLoom without Cloudflare.
Zero dependencies - uses only Python standard library.

Usage:
  python3 bridge.py SESSION_ID [API_URL]
  
  Or via curl:
  curl -sSL https://chatloom.online/scripts/bridge.py | python3 - SESSION_ID
"""
import urllib.request, urllib.error, json, time, sys, os, threading

SESSION_ID = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('CHATLOOM_SESSION', '')
API_URL = (sys.argv[2] if len(sys.argv) > 2 else os.environ.get('CHATLOOM_API', 'https://chatloom.online')).rstrip('/')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434')

if not SESSION_ID:
    print("❌ ERROR: Session ID is required.")
    print("Usage: python3 bridge.py YOUR_SESSION_ID")
    sys.exit(1)

print("------------------------------------------")
print(" 🐉 ChatLoom Neural Bridge v2.0")
print("------------------------------------------")
print(f" Session : {SESSION_ID}")
print(f" Backend : {API_URL}")
print(f" Ollama  : {OLLAMA_URL}")
print("------------------------------------------")

def ollama_request(path, method="GET", data=None, timeout=10):
    """Make a request to local Ollama."""
    url = f"{OLLAMA_URL}{path}"
    try:
        if data:
            req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                        headers={"Content-Type": "application/json"})
        else:
            req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read().decode())
    except Exception as e:
        return None

def backend_request(path, method="GET", data=None, timeout=10):
    """Make a request to ChatLoom backend."""
    url = f"{API_URL}{path}"
    try:
        if data:
            body = json.dumps(data).encode()
            req = urllib.request.Request(url, data=body,
                                        headers={"Content-Type": "application/json"})
        else:
            req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read().decode())
    except Exception as e:
        return None

def get_local_models():
    """Get models from local Ollama."""
    result = ollama_request("/api/tags")
    if not result:
        return []
    models = []
    for m in result.get("models", []):
        name = m.get("name", "")
        if name.lower().startswith("cloud"):
            continue
        models.append({
            "name": name,
            "parameter_size": m.get("details", {}).get("parameter_size", "unknown")
        })
    return models

def send_heartbeat(models):
    """Push model list to backend."""
    return backend_request("/api/bridge/heartbeat", data={
        "session_id": SESSION_ID,
        "models": models,
        "ollama_url": OLLAMA_URL
    })

def poll_tasks():
    """Check if backend has any pending tasks for us."""
    return backend_request(f"/api/bridge/poll?session_id={SESSION_ID}")

def execute_generate(task):
    """Execute a generation task from backend, forward to Ollama, return result."""
    model = task.get("model", "")
    prompt = task.get("prompt", "")
    system_prompt = task.get("system", "")
    options = task.get("options", {})
    task_id = task.get("task_id", "")
    
    print(f"  🧠 Generating with {model}...")
    
    # Build Ollama request
    ollama_data = {
        "model": model,
        "prompt": prompt,
        "stream": False
    }
    if system_prompt:
        ollama_data["system"] = system_prompt
    if options:
        ollama_data["options"] = options
    
    result = ollama_request("/api/generate", data=ollama_data, timeout=120)
    
    if result and result.get("response"):
        print(f"  ✅ Generated {len(result['response'])} chars")
        backend_request("/api/bridge/result", data={
            "session_id": SESSION_ID,
            "task_id": task_id,
            "status": "success",
            "response": result["response"],
            "model": model
        })
    else:
        print(f"  ❌ Generation failed")
        backend_request("/api/bridge/result", data={
            "session_id": SESSION_ID,
            "task_id": task_id,
            "status": "error",
            "response": "Ollama generation failed. Is the model pulled?",
            "model": model
        })

# === MAIN LOOP ===
print("\n⏳ Checking Ollama connection...")
models = get_local_models()
if models:
    print(f"✅ Ollama Active: {len(models)} models found")
    for m in models:
        print(f"   • {m['name']} ({m['parameter_size']})")
else:
    print("⚠️  No models detected. Waiting for Ollama...")

print(f"\n🔗 Connecting to ChatLoom ({API_URL})...")
hb = send_heartbeat(models)
if hb and hb.get("status") == "success":
    print("🚀 BRIDGE ACTIVE! Your browser will auto-detect your AI now.\n")
else:
    print("⚠️  Could not reach backend. Will keep retrying...\n")

heartbeat_counter = 0
try:
    while True:
        # Heartbeat every 5 seconds
        if heartbeat_counter % 5 == 0:
            models = get_local_models()
            if models:
                send_heartbeat(models)
        
        # Poll for pending tasks every second
        task_response = poll_tasks()
        if task_response and task_response.get("task"):
            task = task_response["task"]
            # Run generation in a thread so polling continues
            t = threading.Thread(target=execute_generate, args=(task,))
            t.daemon = True
            t.start()
        
        heartbeat_counter += 1
        time.sleep(1)

except KeyboardInterrupt:
    print("\n\n🛑 Bridge stopped. ChatLoom will no longer detect your AI.")
    # Notify backend that bridge is offline
    backend_request("/api/bridge/disconnect", data={"session_id": SESSION_ID})
    sys.exit(0)
