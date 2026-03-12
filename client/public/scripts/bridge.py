#!/usr/bin/env python3
"""
AI Swarm Node - Neural Bridge v2.1 (Tray Version)
Connects local Ollama to the AI Swarm Network.
Adds a System Tray Icon for easy management.
"""
import urllib.request, urllib.error, json, time, sys, os, threading, webbrowser

# Optional Tray Dependencies
TRAY_ENABLED = False
try:
    from pystray import Icon, Menu, MenuItem
    from PIL import Image, ImageDraw
    TRAY_ENABLED = True
except ImportError:
    print("ℹ️  Tray dependencies not found. Running in terminal mode.")
    print("   To enable tray icon: pip install pystray pillow")

SESSION_ID = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('CHATLOOM_SESSION', '')
API_URL = (sys.argv[2] if len(sys.argv) > 2 else os.environ.get('CHATLOOM_API', 'https://chatloom.online')).rstrip('/')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434')

STATUS = "Starting..."
MODELS_FOUND = 0
IS_RUNNING = True

def ollama_request(path, method="GET", data=None, timeout=10):
    url = f"{OLLAMA_URL}{path}"
    try:
        if data:
            req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                        headers={"Content-Type": "application/json"})
        else:
            req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read().decode())
    except Exception:
        return None

def backend_request(path, method="GET", data=None, timeout=10):
    url = f"{API_URL}{path}"
    try:
        headers = {"Content-Type": "application/json", "User-Agent": "Swarm-Bridge/2.1"}
        if data:
            req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers)
        else:
            req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read().decode())
    except Exception:
        return None

def get_local_models():
    result = ollama_request("/api/tags")
    if not result: return []
    return [{"name": m.get("name"), "parameter_size": m.get("details", {}).get("parameter_size", "unknown")} 
            for m in result.get("models", []) if not m.get("name").lower().startswith("cloud")]

def bridge_loop():
    global STATUS, MODELS_FOUND, IS_RUNNING
    print(f"🚀 Neural Bridge Active for Session: {SESSION_ID}")
    
    last_hb = 0
    while IS_RUNNING:
        now = time.time()
        
        # 1. Heartbeat & Model Sync (every 10s)
        if now - last_hb > 10:
            models = get_local_models()
            MODELS_FOUND = len(models)
            backend_request("/api/bridge/heartbeat", data={
                "session_id": SESSION_ID,
                "models": models,
                "ollama_url": OLLAMA_URL
            })
            STATUS = f"Active | {MODELS_FOUND} Models"
            last_hb = now

        # 2. Poll Tasks (every 1s)
        task_res = backend_request(f"/api/bridge/poll?session_id={SESSION_ID}")
        if task_res and task_res.get("task"):
            task = task_res["task"]
            threading.Thread(target=execute_task, args=(task,), daemon=True).start()
            
        time.sleep(1)

def execute_task(task):
    global STATUS
    STATUS = "🧠 Thinking..."
    model, prompt, task_id = task.get("model"), task.get("prompt"), task.get("task_id")
    
    ollama_data = {"model": model, "prompt": prompt, "stream": False}
    if task.get("system"): ollama_data["system"] = task["system"]
    
    res = ollama_request("/api/generate", data=ollama_data, timeout=180)
    
    if res and res.get("response"):
        backend_request("/api/bridge/result", data={
            "session_id": SESSION_ID, "task_id": task_id, "status": "success", "response": res["response"], "model": model
        })
    else:
        backend_request("/api/bridge/result", data={
            "session_id": SESSION_ID, "task_id": task_id, "status": "error", "response": "Ollama Error"
        })
    STATUS = f"Active | {MODELS_FOUND} Models"

# --- TRAY UI LOGIC ---

def create_icon_image():
    # Platform-aware icon creation
    width, height = 64, 64
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    dc = ImageDraw.Draw(image)
    
    # Simple aesthetic based on OS
    if sys.platform == "darwin":
        # White circle for dark mode Mac bars
        dc.ellipse([8, 8, 56, 56], fill=(255, 255, 255, 255))
        # Blue 'S' dot
        dc.ellipse([24, 24, 40, 40], fill=(59, 130, 246, 255))
    else:
        # Bold Blue for Windows/Linux
        dc.ellipse([8, 8, 56, 56], fill=(59, 130, 246, 255))
        dc.ellipse([16, 16, 48, 48], fill=(30, 41, 59, 255)) # Dark navy inner
        dc.ellipse([28, 28, 36, 36], fill=(255, 255, 255, 255)) # White center
        
    return image

def on_open_web(icon, item):
    webbrowser.open(API_URL)

def on_quit(icon, item):
    global IS_RUNNING
    IS_RUNNING = False
    icon.stop()
    backend_request("/api/bridge/disconnect", data={"session_id": SESSION_ID})
    sys.exit(0)

def setup_tray():
    if not TRAY_ENABLED:
        bridge_loop()
        return

    menu = Menu(
        MenuItem(lambda text: f"Status: {STATUS}", None, enabled=False),
        MenuItem("Open Dashboard", on_open_web),
        Menu.SEPARATOR,
        MenuItem("Exit Node", on_quit)
    )
    
    icon = Icon("AISwarmNode", create_icon_image(), "AI Swarm Node", menu)
    
    # Run bridge in background thread
    threading.Thread(target=bridge_loop, daemon=True).start()
    icon.run()

if __name__ == "__main__":
    if not SESSION_ID:
        print("❌ ERROR: SESSION_ID required.")
        sys.exit(1)
    setup_tray()
