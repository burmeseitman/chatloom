#!/usr/bin/env python3
"""
AI Swarm Node - Neural Bridge v2.3
Connects local Ollama to the AI Swarm Network.
"""
import urllib.request, urllib.error, json, time, sys, os, threading, subprocess, tempfile

# --- CONFIGURATION ---
VERSION = "2.3"
SESSION_ID = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('CHATLOOM_SESSION', '')
API_URL = (sys.argv[2] if len(sys.argv) > 2 else os.environ.get('CHATLOOM_API', 'https://chatloom.online')).rstrip('/')
BRIDGE_TOKEN = os.environ.get('CHATLOOM_BRIDGE_TOKEN', '')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434')
LOG_PATH = os.environ.get('CHATLOOM_BRIDGE_LOG', os.path.join(tempfile.gettempdir(), 'bridge.log'))
STATE_PATH = os.environ.get('CHATLOOM_BRIDGE_STATE', os.path.join(tempfile.gettempdir(), 'bridge-state.json'))
SKIP_RUNTIME_PIP = os.environ.get('CHATLOOM_SKIP_RUNTIME_PIP') == '1'

Icon = None
Menu = None
MenuItem = None
Image = None
ImageDraw = None

STATUS = "Starting..."
MODELS_FOUND = 0
IS_RUNNING = True
CURRENT_TRAY_BACKEND = None

def log(msg):
    timestamp = time.strftime("%H:%M:%S")
    line = f"[{timestamp}] [ChatLoom Bridge] {msg}"
    try:
        print(line, flush=True)
    except Exception:
        pass
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as log_file:
            log_file.write(line + "\n")
    except Exception:
        pass

def write_state(state, message=None, extra=None):
    payload = {
        "state": state,
        "message": message or "",
        "timestamp": time.time()
    }
    if extra:
        payload.update(extra)

    try:
        with open(STATE_PATH, "w", encoding="utf-8") as state_file:
            json.dump(payload, state_file)
    except Exception:
        pass

def desktop_environment():
    return " ".join(
        part for part in [
            os.environ.get("XDG_CURRENT_DESKTOP", ""),
            os.environ.get("DESKTOP_SESSION", "")
        ] if part
    ).lower()

def is_gnome_like():
    desktop = desktop_environment()
    return any(name in desktop for name in ("gnome", "ubuntu", "pop"))

def has_gui_session():
    if os.environ.get("CHATLOOM_DISABLE_TRAY") == "1":
        return False
    if sys.platform.startswith("win") or sys.platform == "darwin":
        return True
    return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))

def reset_pystray_modules():
    for module_name in list(sys.modules):
        if module_name == "pystray" or module_name.startswith("pystray."):
            del sys.modules[module_name]

def import_tray_modules(backend=None):
    global Icon, Menu, MenuItem, Image, ImageDraw, CURRENT_TRAY_BACKEND
    if backend:
        os.environ["PYSTRAY_BACKEND"] = backend
    elif "PYSTRAY_BACKEND" in os.environ:
        del os.environ["PYSTRAY_BACKEND"]

    reset_pystray_modules()
    try:
        from pystray import Icon as _Icon, Menu as _Menu, MenuItem as _MenuItem
        from PIL import Image as _Image, ImageDraw as _ImageDraw
    except Exception as exc:
        return False, str(exc), backend or "auto"

    Icon = _Icon
    Menu = _Menu
    MenuItem = _MenuItem
    Image = _Image
    ImageDraw = _ImageDraw
    CURRENT_TRAY_BACKEND = backend or "auto"
    return True, None, backend or "auto"

def linux_backend_candidates():
    session_type = (os.environ.get("XDG_SESSION_TYPE") or "").lower()
    is_wayland = bool(os.environ.get("WAYLAND_DISPLAY")) or session_type == "wayland"
    if is_gnome_like():
        # On GNOME, pystray's GTK backend can run without rendering an icon.
        # AppIndicator is the only backend that reliably maps to a visible tray.
        return ["appindicator"]

    # pystray docs recommend AppIndicator on Linux. On GNOME, GTK often starts
    # successfully but still does not render a visible icon.
    if is_wayland:
        return ["appindicator", "gtk"]
    return ["appindicator", "xorg", "gtk"]

def ensure_tray_support():
    if not has_gui_session():
        return False, "No GUI session available for tray icon"

    if sys.platform.startswith("linux"):
        for backend in linux_backend_candidates():
            ok, err, selected_backend = import_tray_modules(backend)
            if ok:
                log(f"Tray backend selected: {selected_backend}")
                return True, None
            log(f"Tray backend {backend} unavailable: {err}")
    else:
        ok, err, selected_backend = import_tray_modules()
        if ok:
            log(f"Tray backend selected: {selected_backend}")
            return True, None

    if SKIP_RUNTIME_PIP:
        if sys.platform.startswith("linux") and is_gnome_like():
            return False, (
                "Tray dependencies are missing or AppIndicator is unavailable. "
                "Rerun the setup command after bridge dependencies finish installing."
            )
        return False, f"Tray dependencies are missing: {err}"

    log(f"Tray dependencies missing. Attempting background install: {err}")
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "pystray", "pillow"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=120,
            check=True
        )
    except Exception as install_err:
        return False, f"Dependency install failed: {install_err}"

    if sys.platform.startswith("linux"):
        for backend in linux_backend_candidates():
            ok, err, selected_backend = import_tray_modules(backend)
            if ok:
                log(f"Tray backend selected after install: {selected_backend}")
                return True, None
        if is_gnome_like():
            return False, (
                "GNOME session detected, but AppIndicator support is unavailable. "
                "Install AppIndicator support for your desktop session and restart the bridge."
            )
        return False, err

    ok, err, selected_backend = import_tray_modules()
    if ok:
        log(f"Tray backend selected after install: {selected_backend}")
        return True, None
    return False, err

def ollama_request(path, method="GET", data=None, timeout=10):
    targets = [OLLAMA_URL]
    if "127.0.0.1" in OLLAMA_URL:
        targets.append(OLLAMA_URL.replace("127.0.0.1", "localhost"))
    
    for url_base in targets:
        url = f"{url_base}{path}"
        try:
            if data:
                req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                            headers={"Content-Type": "application/json"})
            else:
                req = urllib.request.Request(url)
            resp = urllib.request.urlopen(req, timeout=timeout)
            return json.loads(resp.read().decode())
        except Exception:
            continue
    return None

def backend_request(path, method="POST", data=None, timeout=10):
    url = f"{API_URL}{path}"
    try:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": f"Swarm-Bridge/{VERSION}",
            "X-Chatloom-Bridge-Token": BRIDGE_TOKEN,
        }
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
            for m in result.get("models", []) if m.get("name") and not m.get("name").lower().startswith("cloud")]

def execute_task(task):
    global STATUS
    task_id = task.get("task_id")
    model = task.get("model")
    log(f"🧠 Thinking: {model}...")
    STATUS = "🧠 Thinking..."
    
    ollama_data = {"model": model, "prompt": task.get("prompt"), "stream": False}
    if task.get("system"): ollama_data["system"] = task["system"]
    if task.get("options"): ollama_data["options"] = task["options"]
    
    res = ollama_request("/api/generate", data=ollama_data, timeout=180)
    
    if res and res.get("response"):
        backend_request("/api/bridge/result", data={
            "session_id": SESSION_ID, "task_id": task_id, "status": "success", "response": res["response"], "model": model
        })
        log(f"✅ Response generated ({len(res['response'])} chars)")
    else:
        backend_request("/api/bridge/result", data={
            "session_id": SESSION_ID, "task_id": task_id, "status": "error", "response": "Ollama Error"
        })
        log(f"❌ Generation failed for {model}")
    
    STATUS = f"Active | {MODELS_FOUND} Models"

def bridge_loop():
    global STATUS, MODELS_FOUND, IS_RUNNING
    log(f"Neural Bridge v{VERSION} Active")
    log(f"Session: {SESSION_ID}")
    log(f"Network: {API_URL}")
    log(f"Log file: {LOG_PATH}")
    
    last_hb = 0
    while IS_RUNNING:
        now = time.time()
        
        # 1. Heartbeat & Model Sync (every 10s)
        if now - last_hb > 10:
            models = get_local_models()
            MODELS_FOUND = len(models)
            resp = backend_request("/api/bridge/heartbeat", data={
                "session_id": SESSION_ID,
                "models": models,
                "ollama_url": OLLAMA_URL
            })
            if resp:
                STATUS = f"Active | {MODELS_FOUND} Models"
            else:
                STATUS = "⚠️ Reconnecting..."
                log("Backend unreachable, retrying...")
            last_hb = now

        # 2. Poll Tasks (every 1.5s)
        try:
            task_res = backend_request(f"/api/bridge/poll?session_id={SESSION_ID}", method="GET")
            if task_res and task_res.get("task"):
                task = task_res["task"]
                threading.Thread(target=execute_task, args=(task,), daemon=True).start()
        except:
            pass
            
        time.sleep(1.5)

# --- TRAY UI ---
def create_icon_image():
    width, height = 64, 64
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    dc = ImageDraw.Draw(image)
    color = (59, 130, 246, 255) if sys.platform != "darwin" else (255, 255, 255, 255)
    dc.ellipse([8, 8, 56, 56], fill=color)
    dc.ellipse([24, 24, 40, 40], fill=(30, 41, 59, 255))
    return image

def on_quit(icon, item):
    global IS_RUNNING
    log("Shutting down bridge...")
    IS_RUNNING = False
    write_state("stopped", "Bridge stopped by user")
    backend_request("/api/bridge/disconnect", data={"session_id": SESSION_ID})
    icon.stop()
    sys.exit(0)

def on_tray_ready(icon):
    icon.visible = True
    write_state("tray_ready", "Tray icon is ready", {"backend": CURRENT_TRAY_BACKEND})
    log(f"Tray icon is ready using backend: {CURRENT_TRAY_BACKEND}")

def setup_tray():
    write_state("starting", "Bridge process started")
    tray_ready, tray_error = ensure_tray_support()
    if not tray_ready:
        write_state("headless", tray_error)
        log(f"Starting in headless mode (tray unavailable: {tray_error})")
        bridge_loop()
        return

    menu = Menu(
        MenuItem(lambda text: f"Status: {STATUS}", None, enabled=False),
        MenuItem(lambda text: f"Session: {SESSION_ID[:8]}...", None, enabled=False),
        Menu.SEPARATOR,
        MenuItem("Exit Node", on_quit)
    )
    icon = Icon("ChatLoom", create_icon_image(), "ChatLoom Swarm", menu)
    worker = threading.Thread(target=bridge_loop, name="bridge-loop")
    worker.start()
    try:
        icon.run(setup=on_tray_ready)
    except Exception as exc:
        write_state("headless", f"Tray startup failed: {exc}")
        log(f"Tray startup failed. Continuing headless: {exc}")
        while IS_RUNNING:
            time.sleep(5)

if __name__ == "__main__":
    if not SESSION_ID:
        print("❌ ERROR: SESSION_ID missing. Provide it as an argument or env var.")
        sys.exit(1)
    if not BRIDGE_TOKEN:
        print("❌ ERROR: BRIDGE_TOKEN missing. Re-run the ChatLoom setup command.")
        sys.exit(1)
    write_state("starting", "Bridge bootstrap starting")
    setup_tray()
