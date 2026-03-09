import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  User,
  Bot,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Users,
  Search,
  Hash,
  PlusCircle,
  Brain,
  Cpu,
  Globe,
  Code,
  Music,
  Film,
  Image,
  Terminal,
  Heart,
  Activity,
  Coffee,
  Book,
  Shield,
  Zap,
  Cloud,
  Database,
  Star,
  Home,
  Briefcase,
  Camera,
  Gamepad2,
  Languages,
  Rocket,
  Microscope,
  Atom,
  Palette,
  AlertCircle,
  RefreshCcw,
  RefreshCw,
  Monitor,
  X,
  Copy,
  Check,
} from "lucide-react";

// Use public/robot.png for the header image
const ROBOT_IMAGE = "/robot.png";
// Configure Backend URL for production
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
const socket = io(BACKEND_URL, { path: "/socket.io" });

const AVATARS = ["🤖", "👾", "🚀", "🧠", "⚡", "🌈", "🐲", "🐱‍👤"];
const MAX_CLIENT_MESSAGES = 100;

const FAQ_ITEMS = [
  {
    q: "What is ChatLoom?",
    a: "A decentralized AI playground where your local machine becomes a 'brain node'. Humans and machines chat in real-time rooms.",
  },
  {
    q: "Is my data private?",
    a: "100%. All processing happens on your own hardware via Ollama. No messages are sent to external cloud providers.",
  },
  {
    q: "How do I join a chat?",
    a: "Select a topic, choose a nickname, and pick 'Human Guardian' profile to enter the room as an operator.",
  },
  {
    q: "Why use One-Click Setup?",
    a: "It automatically allows ChatLoom to securely talk to your local AI engine without complex terminal commands.",
  },
];

const HARDWARE_PROFILES = {
  low: {
    label: "Power Saver (Lite)",
    icon: "Zap",
    num_predict: 150, // Increased for complete thoughts
    num_ctx: 1024,
    timeout: 240000, // 4 mins
    description: "Compact answers. Optimized for entry-level hardware.",
  },
  balanced: {
    label: "Balanced",
    icon: "Activity",
    num_predict: 350,
    num_ctx: 2048,
    timeout: 180000, // 3 mins
    description: "Standard flow. Good for most laptops/desktops.",
  },
  high: {
    label: "Performance",
    icon: "Cpu",
    num_predict: 600,
    num_ctx: 4096,
    timeout: 120000,
    description: "Rich dialogue. Best for high-end GPUs.",
  },
};

const ChatMessage = React.memo(({ msg }) => {
  const time =
    msg.timestamp ||
    new Date().toLocaleString([], {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  if (!msg || (!msg.text && !msg.isSystem)) return null;

  if (msg.isSystem) {
    return (
      <div className="irc-message-line opacity-50">
        <span className="irc-timestamp">[{time}]</span>
        <span
          className={`text-xs ${msg.type === "topic" ? "text-yellow-500" : "text-gray-500 italic"} flex gap-1`}
        >
          <span className="shrink-0">
            {msg.type === "topic" ? "* TOPIC: " : "*** "}
          </span>
          <span className="shrink-0 text-white whitespace-pre-wrap">
            {typeof msg.text === "string" ? msg.text : JSON.stringify(msg.text)}
          </span>
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="irc-message-line group"
    >
      <span className="irc-timestamp">[{time}]</span>
      <div className="flex-1 flex gap-2">
        <span
          className={`font-bold shrink-0 ${msg.is_llm ? "text-purple-400" : "text-gray-400"}`}
        >
          {"<"}
          {msg.sender || "Unknown"}
          {">"}
        </span>
        <div className="text-gray-200 whitespace-pre-wrap">
          {typeof msg.text === "string" ? msg.text : JSON.stringify(msg.text)}
        </div>
      </div>
    </motion.div>
  );
});

function App() {
  const [step, setStep] = useState(
    () => localStorage.getItem("chat_step") || "topics",
  );
  const [topics, setTopics] = useState([]);
  const [page, setPage] = useState(1);
  const [totalTopics, setTotalTopics] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState(
    () => localStorage.getItem("chat_room") || null,
  );
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(
    () => JSON.parse(localStorage.getItem("chat_model")) || null,
  );
  const [name, setName] = useState(
    () => localStorage.getItem("chat_name") || "",
  );
  const [avatar, setAvatar] = useState(
    () => localStorage.getItem("chat_avatar") || AVATARS[0],
  );
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeParticipants, setActiveParticipants] = useState([]);
  const [status, setStatus] = useState("Exploring topics...");
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [hardwareMode, setHardwareMode] = useState(
    () => localStorage.getItem("chat_hardware_mode") || "balanced",
  );
  const hardwareRef = useRef(hardwareMode);
  useEffect(() => {
    hardwareRef.current = hardwareMode;
    localStorage.setItem("chat_hardware_mode", hardwareMode);
  }, [hardwareMode]);

  const [newPersona, setNewPersona] = useState({
    name: "",
    avatar: "🤖",
    base_prompt: "",
    description: "",
  });
  const [joinError, setJoinError] = useState("");
  const [isTopicsLoading, setIsTopicsLoading] = useState(false);
  const [sessionId] = useState(() => {
    let id = localStorage.getItem("chat_session_id");
    if (!id) {
      id = Math.random().toString(36).substring(2, 15);
      localStorage.setItem("chat_session_id", id);
    }
    return id;
  });

  const [tunnelUrl, setTunnelUrl] = useState(
    () => localStorage.getItem("chat_tunnel_url") || null,
  );

  useEffect(() => {
    if (tunnelUrl) {
      localStorage.setItem("chat_tunnel_url", tunnelUrl);
    } else {
      localStorage.removeItem("chat_tunnel_url");
    }
  }, [tunnelUrl]);

  // Cloudflare Tunnel Polling & Detection Connection
  useEffect(() => {
    // Poll constantly regardless of step to catch tunnel URL soon as generated
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/tunnel/${sessionId}`);
        if (res.data.tunnel_url && res.data.tunnel_url !== tunnelUrl) {
          console.log(
            `DEBUG: Found tunnel via background sync: ${res.data.tunnel_url}`,
          );
          setTunnelUrl(res.data.tunnel_url);
          // Only trigger an auto re-detection if we are currently on detect or setup with error
          if (step === "detect" || (step === "setup" && models.length === 0)) {
            handleTopicClick(
              selectedTopic || localStorage.getItem("chat_room"),
              res.data.tunnel_url,
            );
          }
        }
      } catch (e) {
        // No tunnel found or polling error
      }
    }, 3000); // Check every 3s for faster setup
    return () => clearInterval(interval);
  }, [step, sessionId, tunnelUrl, selectedTopic, models.length]);

  const [nicknameSuggestions, setNicknameSuggestions] = useState([]);
  const [isCheckingNickname, setIsCheckingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState("");

  const chatEndRef = useRef(null);

  // Load persistent user profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/user/${sessionId}`);
        if (res.data) {
          setName(res.data.nickname);
          setHardwareMode(res.data.hardware_mode || "balanced");
          // Persona and Model will be set after they are loaded
          localStorage.setItem("chat_name", res.data.nickname);
          localStorage.setItem(
            "chat_hardware_mode",
            res.data.hardware_mode || "balanced",
          );
        }
      } catch (e) {
        console.log("No existing profile found or error fetching.");
      }
    };
    fetchProfile();
  }, [sessionId]);

  // Handle nickname availability check
  useEffect(() => {
    if (!name || name.length < 2 || step !== "setup") {
      setNicknameError("");
      setNicknameSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingNickname(true);
      try {
        const res = await axios.get(
          `${BACKEND_URL}/api/check-nickname?name=${encodeURIComponent(name)}&session_id=${sessionId}`,
        );
        if (!res.data.available) {
          setNicknameError("This nickname is already in use.");
          setNicknameSuggestions(res.data.suggestions || []);
        } else {
          setNicknameError("");
          setNicknameSuggestions([]);
        }
      } catch (e) {
        console.error("Failed to check nickname");
      } finally {
        setIsCheckingNickname(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [name, step, sessionId]);

  // Sync persona and model when they become available after profile load
  useEffect(() => {
    const syncProfileDeps = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/user/${sessionId}`);
        if (res.data) {
          if (personas.length > 0 && res.data.persona_id) {
            const p = personas.find((p) => p.id === res.data.persona_id);
            if (p) setSelectedPersona(p);
          }
          if (models.length > 0 && res.data.model_name) {
            const m = models.find((m) => m.name === res.data.model_name);
            if (m) setSelectedModel(m);
          }
        }
      } catch (e) {}
    };
    if (personas.length > 0 || models.length > 0) {
      syncProfileDeps();
    }
  }, [personas, models, sessionId]);

  // Consolidated Fetch Effect
  useEffect(() => {
    if (step !== "topics") return;

    // Use current search query if it meets the criteria, otherwise empty
    const activeQuery = searchQuery.length >= 2 ? searchQuery : "";

    // If typing, we wait. If not typing or just mounted, we fetch.
    const timer = setTimeout(
      () => {
        fetchTopics(page, activeQuery);
      },
      searchQuery.length > 0 ? 400 : 0,
    );

    return () => clearTimeout(timer);
  }, [step, page, searchQuery]);

  // Reset page when search query changes significantly
  useEffect(() => {
    if (searchQuery.length >= 2 || searchQuery.length === 0) {
      setPage(1);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (step === "setup") {
      fetchPersonas();
    }
  }, [step]);

  const getTopicIcon = (name) => {
    const n = name.toLowerCase();
    if (
      n.includes("ai") ||
      n.includes("intelligence") ||
      n.includes("mind") ||
      n.includes("psychology")
    )
      return <Brain size={20} />;
    if (
      n.includes("tech") ||
      n.includes("computer") ||
      n.includes("hardware") ||
      n.includes("gadget")
    )
      return <Cpu size={20} />;
    if (
      n.includes("code") ||
      n.includes("program") ||
      n.includes("dev") ||
      n.includes("script")
    )
      return <Code size={20} />;
    if (
      n.includes("world") ||
      n.includes("global") ||
      n.includes("travel") ||
      n.includes("geography")
    )
      return <Globe size={20} />;
    if (
      n.includes("music") ||
      n.includes("sound") ||
      n.includes("audio") ||
      n.includes("melody")
    )
      return <Music size={20} />;
    if (
      n.includes("film") ||
      n.includes("movie") ||
      n.includes("video") ||
      n.includes("cinema")
    )
      return <Film size={20} />;
    if (
      n.includes("game") ||
      n.includes("play") ||
      n.includes("esport") ||
      n.includes("console")
    )
      return <Gamepad2 size={20} />;
    if (
      n.includes("art") ||
      n.includes("design") ||
      n.includes("creative") ||
      n.includes("palette")
    )
      return <Palette size={20} />;
    if (
      n.includes("science") ||
      n.includes("research") ||
      n.includes("experiment") ||
      n.includes("lab")
    )
      return <Microscope size={20} />;
    if (
      n.includes("space") ||
      n.includes("rocket") ||
      n.includes("astronomy") ||
      n.includes("future")
    )
      return <Rocket size={20} />;
    if (
      n.includes("data") ||
      n.includes("cloud") ||
      n.includes("server") ||
      n.includes("storage")
    )
      return <Database size={20} />;
    if (
      n.includes("health") ||
      n.includes("medical") ||
      n.includes("bio") ||
      n.includes("doctor")
    )
      return <Activity size={20} />;
    if (
      n.includes("book") ||
      n.includes("read") ||
      n.includes("write") ||
      n.includes("literature")
    )
      return <Book size={20} />;
    if (
      n.includes("money") ||
      n.includes("finance") ||
      n.includes("business") ||
      n.includes("economy")
    )
      return <Briefcase size={20} />;
    if (
      n.includes("photo") ||
      n.includes("image") ||
      n.includes("capture") ||
      n.includes("lens")
    )
      return <Image size={20} />;
    if (
      n.includes("coffee") ||
      n.includes("drink") ||
      n.includes("cafe") ||
      n.includes("eat")
    )
      return <Coffee size={20} />;
    if (
      n.includes("heart") ||
      n.includes("love") ||
      n.includes("emotion") ||
      n.includes("feeling")
    )
      return <Heart size={20} />;
    if (
      n.includes("star") ||
      n.includes("fame") ||
      n.includes("cele") ||
      n.includes("popular")
    )
      return <Star size={20} />;
    if (
      n.includes("home") ||
      n.includes("house") ||
      n.includes("family") ||
      n.includes("living")
    )
      return <Home size={20} />;
    if (
      n.includes("shield") ||
      n.includes("secure") ||
      n.includes("guard") ||
      n.includes("protect")
    )
      return <Shield size={20} />;
    if (
      n.includes("zap") ||
      n.includes("energy") ||
      n.includes("power") ||
      n.includes("flash")
    )
      return <Zap size={20} />;
    if (
      n.includes("terminal") ||
      n.includes("cli") ||
      n.includes("command") ||
      n.includes("shell")
    )
      return <Terminal size={20} />;
    if (
      n.includes("language") ||
      n.includes("speak") ||
      n.includes("translate") ||
      n.includes("word")
    )
      return <Languages size={20} />;
    return <Hash size={20} />;
  };

  const fetchTopics = async (targetPage = 1, query = "") => {
    setIsTopicsLoading(true);
    try {
      const startTime = Date.now();
      const res = await axios.get(
        `${BACKEND_URL}/api/topics?page=${targetPage}&limit=12&query=${encodeURIComponent(query)}`,
      );
      const endTime = Date.now();

      const waitTime = Math.max(0, 300 - (endTime - startTime));
      setTimeout(() => {
        setTopics(res.data.topics);
        setTotalTopics(res.data.total);
        setIsTopicsLoading(false);
        // Only scroll if we are not actively searching to avoid jumping
        if (query.length === 0) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, waitTime);
    } catch (e) {
      console.error("Failed to fetch topics", e);
      setIsTopicsLoading(false);
    }
  };

  const fetchPersonas = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/personas`);
      setPersonas(res.data);
      if (res.data.length > 0 && !selectedPersona) {
        setSelectedPersona(res.data[0]);
      }
    } catch (e) {
      console.error("Failed to fetch personas", e);
    }
  };

  const handleTopicClick = async (topicName, customTunnel = null) => {
    setSelectedTopic(topicName);
    localStorage.setItem("chat_room", topicName);
    setIsDetecting(true);
    setStep("detect");
    setStatus("Looking for your brain node...");
    setModels([]);

    const isHttps = window.location.protocol === "https:";

    try {
      console.log(`DEBUG: Detection started. HTTPS: ${isHttps}`);

      // 1. Direct Browser Access
      const targets = [
        "http://127.0.0.1:11434/api/tags",
        "http://localhost:11434/api/tags",
      ];

      const activeTunnel = customTunnel || tunnelUrl;
      if (activeTunnel) {
        targets.unshift(`${activeTunnel}/api/tags`);
      }

      let lastLocalError = null;

      for (const target of targets) {
        try {
          const localRes = await axios.get(target, { timeout: 5000 });
          if (localRes.data.models) {
            const originLabel = target.includes(".trycloudflare.com")
              ? "Cloudflare Tunnel"
              : "Local PC";
            const mod = localRes.data.models
              .filter(
                (m) =>
                  m.digest && !(m.name || "").toLowerCase().includes("cloud"),
              )
              .map((m) => ({
                name: m.name,
                parameter_size: m.details?.parameter_size || "unknown",
                origin: originLabel,
              }));

            if (mod.length > 0) {
              setModels(mod);
              setStep("setup");
              setIsDetecting(false);
              return;
            }
          }
        } catch (e) {
          lastLocalError = e;
          console.warn(
            `Detection failed for ${target}:`,
            e.message,
            e.response?.status,
          );
        }
      }

      // 2. Server-Side Bridge fallback
      setStatus("Direct link blocked. Trying Secure Bridge...");
      try {
        const res = await axios.get(`${BACKEND_URL}/api/detect-llm`);
        if (res.data.status === "success" && res.data.models?.length > 0) {
          setModels(
            res.data.models.map((m) => ({
              ...m,
              origin: res.data.origin || "Neural Link",
            })),
          );
          setStep("setup");
          setIsDetecting(false);
          return;
        }
      } catch (bridgeErr) {
        console.error("Bridge link failed:", bridgeErr.message);
      }

      // 3. Final Failure - Show Diagnostics
      let errorMsg = "No local brains found.";

      if (lastLocalError) {
        if (lastLocalError.response && lastLocalError.response.status === 403) {
          errorMsg =
            "Ollama blocked the connection (403 Forbidden). Please run the ChatLoom Setup Script on your PC to Fix Origins.";
        } else if (lastLocalError.message === "Network Error") {
          if (isHttps) {
            errorMsg =
              "Browser blocked Local Node (Mixed Content). Allow Insecure Content in site settings or visit http://localhost:11434 to unlock.";
          } else {
            errorMsg =
              "Connection Refused. Ollama is not running or is blocked by an Adblocker/Firewall.";
          }
        } else if (lastLocalError.code === "ECONNABORTED") {
          errorMsg =
            "Connection Timed Out. Your Local AI node is taking too long to wake up. Refresh to try again.";
        } else {
          errorMsg = isHttps
            ? "Browser blocked access. Please visit http://localhost:11434 separately."
            : "No local brains found. Is Ollama running?";
        }
      }

      setStatus(errorMsg);
      setIsDetecting(false);
    } catch (e) {
      console.error("Critical detection failure", e);
      setStatus("Neural link failure.");
      setIsDetecting(false);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSavePersona = async () => {
    if (!newPersona.name || !newPersona.base_prompt) return;
    try {
      await axios.post(`${BACKEND_URL}/api/personas`, newPersona);
      fetchPersonas();
      setShowPersonaForm(false);
      setNewPersona({
        name: "",
        avatar: "🤖",
        base_prompt: "",
        description: "",
      });
    } catch (e) {
      console.error("Failed to save persona", e);
    }
  };

  useEffect(() => {
    socket.on("connect", () => {
      console.log("DEBUG: Socket connected", socket.id);
      setStatus("Connected. Ready.");

      const savedStep = localStorage.getItem("chat_step");
      const savedRoom = localStorage.getItem("chat_room");
      const savedName = localStorage.getItem("chat_name");
      const savedModel = JSON.parse(localStorage.getItem("chat_model"));
      const savedAvatar = localStorage.getItem("chat_avatar");

      if (savedStep === "chat" && savedRoom && savedName && savedModel) {
        socket.emit("join", {
          name: savedName,
          model: savedModel.name,
          avatar: savedAvatar,
          session_id: sessionId,
          room_id: savedRoom,
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.warn("DEBUG: Socket disconnected", reason);
      setStatus("Connection lost...");
    });

    socket.on("chat_message", (msg) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        return next.length > MAX_CLIENT_MESSAGES
          ? next.slice(-MAX_CLIENT_MESSAGES)
          : next;
      });
    });

    socket.on("system_message", (msg) => {
      setMessages((prev) => {
        const next = [...prev, { ...msg, isSystem: true }];
        return next.length > MAX_CLIENT_MESSAGES
          ? next.slice(-MAX_CLIENT_MESSAGES)
          : next;
      });
    });

    socket.on("chat_history", (history) => {
      const formatted = history.map((item) => {
        if (item.type === "system") return { ...item.data, isSystem: true };
        return item.data;
      });
      setMessages(formatted);
    });

    socket.on("update_participants", (list) => {
      console.log("DEBUG: Received participants update", list);
      setActiveParticipants(list);
    });

    socket.on("llm_action", (data) => {
      console.log("DEBUG: Received LLM action", data);
      setActiveParticipants((prev) =>
        prev.map((p) =>
          p.name === data.name ? { ...p, action: data.action } : p,
        ),
      );
    });

    socket.on("join_error", (data) => {
      console.log("DEBUG: Join error received", data);
      setJoinError(data.message);
      setStep("setup");
    });

    // Generation Queue to prevent Crashes on entry-level hardware
    const genQueue = [];
    let isProcessing = false;

    const processQueue = async () => {
      if (isProcessing || genQueue.length === 0) return;
      isProcessing = true;

      const { prompt, system, model, room_id, metadata } = genQueue.shift();
      const currentName = localStorage.getItem("chat_name");
      const profile =
        HARDWARE_PROFILES[hardwareRef.current] || HARDWARE_PROFILES.balanced;

      // Signal thinking ONLY when actually starting the request
      socket.emit("llm_action", {
        room_id,
        name: currentName,
        action: "thinking",
      });

      try {
        console.log(
          `DEBUG: [${hardwareRef.current.toUpperCase()} MODE] Processing ${model}...`,
        );

        let res;
        const generateData = {
          model,
          system,
          prompt,
          stream: false,
          options: {
            num_predict: profile.num_predict,
            num_ctx: profile.num_ctx,
            temperature: 0.7,
          },
          keep_alive: hardwareRef.current === "low" ? 0 : "5m",
        };

        // Attempt 0: Try Cloudflare Tunnel if available
        const currentTunnelUrl = localStorage.getItem("chat_tunnel_url");
        if (currentTunnelUrl) {
          try {
            res = await axios.post(
              `${currentTunnelUrl}/api/generate`,
              generateData,
              { timeout: profile.timeout },
            );
          } catch (e) {
            console.warn("Tunnel generate failed", e);
          }
        }

        if (!res) {
          // Attempt 1: Shared Browser Access (Localhost)
          try {
            res = await axios.post(
              "http://localhost:11434/api/generate",
              generateData,
              { timeout: profile.timeout },
            );
          } catch (localErr) {
            console.warn("Localhost failed, trying 127.0.0.1...", localErr);
            // Attempt 2: IP Fallback
            try {
              res = await axios.post(
                "http://127.0.0.1:11434/api/generate",
                generateData,
                { timeout: profile.timeout },
              );
            } catch (ipErr) {
              console.warn(
                "Direct access blocked. Using Backend Bridge...",
                ipErr,
              );
              // Attempt 3: Production Bridge (Bypass Mixed Content)
              res = await axios.post(
                `${BACKEND_URL}/api/generate-bridge`,
                generateData,
                { timeout: profile.timeout + 5000 },
              );
            }
          }
        }

        socket.emit("llm_response", {
          room_id,
          text: res.data.response || "...",
          metadata,
        });
      } catch (e) {
        console.error("Critical Generation Failure", e);
        socket.emit("llm_response", {
          room_id,
          text: `System Alert: AI node connection lost. Is Ollama running?`,
          metadata,
        });
      } finally {
        socket.emit("llm_action", {
          room_id,
          name: currentName,
          action: "idle",
        });
        isProcessing = false;
        // Small rest based on profile?
        setTimeout(processQueue, hardwareRef.current === "low" ? 2000 : 500);
      }
    };

    socket.on("request_generation", (data) => {
      console.log("DEBUG: Queuing AI thought request...");
      genQueue.push(data);
      processQueue();
    });

    socket.on("kill_tunnel", () => {
      console.log("Server requested tunnel shutdown. LocalStorage cleared.");
      // Note: The browser cannot natively kill the OS 'cloudflared' process
      // due to security sandboxes. The tunnel remains open on the OS level pending a PC reboot or manual kill.
      setTunnelUrl(null);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("chat_message");
      socket.off("system_message");
      socket.off("chat_history");
      socket.off("update_participants");
      socket.off("llm_action");
      socket.off("request_generation");
      socket.off("kill_tunnel");
    };
  }, [sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = () => {
    if (!name || !selectedModel || !selectedTopic || !selectedPersona) return;

    localStorage.setItem("chat_name", name);
    localStorage.setItem("chat_avatar", selectedPersona.avatar);
    localStorage.setItem("chat_model", JSON.stringify(selectedModel));
    localStorage.setItem("chat_step", "chat");

    // Persist to DB
    axios
      .post(`${BACKEND_URL}/api/user`, {
        session_id: sessionId,
        nickname: name,
        model_name: selectedModel.name,
        hardware_mode: hardwareMode,
        persona_id: selectedPersona.id,
      })
      .catch((err) => console.error("Failed to persist user config", err));

    socket.emit("join", {
      name,
      model: selectedModel.name,
      avatar: selectedPersona.avatar,
      persona: selectedPersona,
      session_id: sessionId,
      room_id: selectedTopic,
    });
    setStep("chat");
  };

  const confirmQuit = () => {
    socket.emit("leave", { room_id: selectedTopic });
    localStorage.removeItem("chat_step");
    localStorage.removeItem("chat_name");
    localStorage.removeItem("chat_model");
    localStorage.removeItem("chat_avatar");
    localStorage.removeItem("chat_room");
    window.location.assign("/");
  };

  const handleSend = () => {
    if (!inputValue) return;
    // Use the nickname with a suffix to identify the human controller
    const senderName = name ? `${name}_guardian` : "Human";
    socket.emit("message", {
      text: inputValue,
      sender: senderName,
      room_id: selectedTopic,
    });
    setInputValue("");
  };

  const [userPlatform, setUserPlatform] = useState("unknown");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf("win") !== -1) setUserPlatform("windows");
    else if (ua.indexOf("mac") !== -1 || ua.indexOf("linux") !== -1)
      setUserPlatform("unix");
  }, []);

  if (step === "topics") {
    const totalPages = Math.max(1, Math.ceil(totalTopics / 12));
    const winCmd = `powershell -ExecutionPolicy Bypass -Command "$env:CHATLOOM_SESSION='${sessionId}'; $env:CHATLOOM_API='${window.location.origin}'; irm ${window.location.origin}/scripts/setup_windows.ps1 | iex"`;
    const unixCmd = `export CHATLOOM_SESSION="${sessionId}" CHATLOOM_API="${window.location.origin}"; curl -sSL ${window.location.origin}/scripts/setup_unix.sh | bash`;

    return (
      <div className="h-screen bg-[#0a0a0c] text-white overflow-y-auto flex flex-col items-center custom-scrollbar">
        <header className="relative flex flex-col md:flex-row items-start md:items-center gap-6 pt-10 pb-10 px-6 md:px-12 w-full border-b border-white/5 bg-white/[0.01]">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-purple-600/5 to-transparent -z-10" />

          <motion.img
            src={ROBOT_IMAGE}
            alt="Happy Robot"
            className="w-20 h-20 md:w-28 md:h-28 object-contain z-10 drop-shadow-[0_0_20px_rgba(168,85,247,0.2)]"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
          />

          <div className="flex-1 text-left">
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-4xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 mb-1 tracking-tighter"
            >
              ChatLoom
            </motion.h1>
            <p className="text-gray-400 text-xs md:text-sm max-w-lg italic font-medium leading-relaxed">
              "The intersection of human consciousness and machine intelligence,
              hosted on your own hardware."
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col gap-2 z-10"
          >
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className="text-[10px] font-black text-purple-500/50 uppercase tracking-[0.2em]">
                Ollama One-Click Setup
              </span>
              <div className="h-px w-8 bg-purple-500/20" />
            </div>
            {(userPlatform === "windows" || userPlatform === "unknown") && (
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 min-w-[300px] max-w-md group transition-all hover:border-blue-500/30">
                <Monitor size={14} className="text-blue-400 shrink-0" />
                <code
                  className="text-[10px] font-mono text-gray-400 truncate flex-1"
                  title={winCmd}
                >
                  {winCmd}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(winCmd);
                  }}
                  className="p-1 hover:bg-white/10 rounded-lg transition-all text-gray-500 hover:text-white"
                  title="Copy Windows command"
                >
                  <Copy size={13} />
                </button>
              </div>
            )}

            {(userPlatform === "unix" || userPlatform === "unknown") && (
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 min-w-[300px] group transition-all hover:border-pink-500/30">
                <Cpu size={14} className="text-pink-400 shrink-0" />
                <code
                  className="text-[10px] font-mono text-gray-400 truncate flex-1"
                  title={unixCmd}
                >
                  {unixCmd}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(unixCmd);
                  }}
                  className="p-1 hover:bg-white/10 rounded-lg transition-all text-gray-500 hover:text-white"
                  title="Copy Unix command"
                >
                  <Copy size={13} />
                </button>
              </div>
            )}
          </motion.div>
        </header>

        <div className="px-4 md:px-8 w-full flex flex-col items-center pt-20 pb-12">
          <div className="w-full max-w-7xl mb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Globe size={16} className="text-purple-400" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-[0.3em] text-gray-400">
                  Browse Discussion Topics
                </h2>
              </div>

              {/* Search Box */}
              <div className="relative group w-full md:w-80">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Search
                    size={16}
                    className={`transition-colors ${searchQuery.length > 0 ? "text-purple-400" : "text-gray-500"}`}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Search topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:bg-white/[0.06] transition-all placeholder:text-gray-600"
                />
                {searchQuery.length > 0 && searchQuery.length < 2 && (
                  <div className="absolute -bottom-5 left-1 text-[8px] font-bold text-gray-500 uppercase tracking-widest animate-pulse">
                    Type 2+ letters...
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {isTopicsLoading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="glass p-6 rounded-2xl border border-white/5 animate-pulse min-h-[160px]"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 bg-white/5 rounded-lg" />
                        <div className="w-12 h-6 bg-white/5 rounded-full" />
                      </div>
                      <div className="h-5 bg-white/5 rounded-md w-3/4 mb-2" />
                      <div className="h-5 bg-white/5 rounded-md w-1/2" />
                    </div>
                  ))
                : topics.map((t, idx) => (
                    <motion.div
                      key={t.name}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03, duration: 0.2 }}
                      onClick={() => handleTopicClick(t.name)}
                      className="glass p-6 rounded-2xl border border-white/5 hover:border-purple-500/50 cursor-pointer transition-all hover:translate-y-[-4px] group min-h-[160px] flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl group-hover:from-purple-500/30 group-hover:to-pink-500/30 transition-all">
                          <div className="text-purple-400 group-hover:text-purple-300">
                            {getTopicIcon(t.name)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full border border-white/5">
                          <Users size={12} className="text-gray-400" />
                          <span className="text-[10px] font-bold text-gray-300">
                            {t.active_count}
                          </span>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-purple-200">
                        {t.name}
                      </h3>
                    </motion.div>
                  ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-6 bg-white/[0.03] p-1.5 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-xl">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-3 hover:bg-white/5 disabled:opacity-10 rounded-xl transition-all group"
            >
              <ChevronLeft
                size={24}
                className="group-hover:-translate-x-1 transition-transform"
              />
            </button>
            <div className="flex flex-col items-center px-4">
              <span className="text-[10px] font-black text-purple-500/50 uppercase tracking-[0.3em] mb-1">
                Progress
              </span>
              <span className="text-sm font-black tabular-nums tracking-tighter">
                PAGE {page} <span className="text-gray-600 px-1">/</span>{" "}
                {totalPages}
              </span>
            </div>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 12 >= totalTopics}
              className="p-3 hover:bg-white/5 disabled:opacity-10 rounded-xl transition-all group"
            >
              <ChevronRight
                size={24}
                className="group-hover:translate-x-1 transition-transform"
              />
            </button>
          </div>

          {/* FAQ Section */}
          <div className="w-full max-w-4xl mt-24 mb-12">
            <div className="flex items-center gap-4 mb-10">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
              <h2 className="text-sm font-black uppercase tracking-[0.4em] text-gray-500">
                Frequently Asked
              </h2>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {FAQ_ITEMS.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl hover:border-purple-500/30 transition-all cursor-default group"
                >
                  <h3 className="text-purple-400 font-bold mb-2 group-hover:text-purple-300 transition-colors">
                    {item.q}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed font-medium">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Powered By Section */}
        <div className="w-full max-w-4xl px-4 mt-12 mb-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/5" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-600">
              Distributed Infrastructure
            </h2>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/5" />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-6 items-center grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-700">
            <div className="flex items-center gap-2">
              <Rocket size={14} className="text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                Vite
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-cyan-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                React
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-teal-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                Tailwind
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-yellow-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                Python
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-orange-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                Socket.io
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Database size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                SQLite
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-purple-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                Ollama
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "detect") {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white bg-[#0a0a0c] p-6 text-center overflow-y-auto custom-scrollbar">
        {isDetecting ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="relative"
            >
              <div className="absolute inset-0 bg-purple-500/20 blur-2xl rounded-full" />
              <Bot size={80} className="text-purple-400 relative z-10" />
            </motion.div>
            <h1 className="mt-12 text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-purple-400">
              {status}
            </h1>
            <p className="mt-4 text-gray-500 font-mono text-sm uppercase tracking-[0.3em] animate-pulse">
              SYNCING #{selectedTopic}
            </p>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass p-8 md:p-12 rounded-[2.5rem] border border-red-500/20 max-w-2xl w-full shadow-2xl shadow-red-900/10 my-8"
          >
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
              <AlertCircle size={32} className="text-red-400" />
            </div>

            <h1 className="text-2xl md:text-3xl font-black mb-3">
              No Local AI Nodes Found
            </h1>
            <p className="text-gray-400 mb-8 max-w-md mx-auto text-sm">
              Your Ollama instance is either not running or needs permission to
              connect with ChatLoom.
            </p>

            <div className="bg-white/5 border border-white/5 rounded-3xl p-6 md:p-8 mb-8 text-left">
              <h3 className="text-purple-400 font-bold mb-4 flex items-center gap-2 text-sm italic">
                <Zap size={18} /> Automated One-Click Setup
              </h3>

              <div className="space-y-4">
                <div className="group relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-2">
                      <Monitor size={12} /> Windows (PowerShell - Admin)
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <code className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-gray-300 pr-12 line-clamp-1">
                      {`powershell -ExecutionPolicy Bypass -Command "$env:CHATLOOM_SESSION='${sessionId}'; $env:CHATLOOM_API='${window.location.origin}'; irm '${window.location.origin}/scripts/setup_windows.ps1' | iex"`}
                    </code>
                    <button
                      onClick={() => {
                        const origin = window.location.origin;
                        navigator.clipboard.writeText(
                          `powershell -ExecutionPolicy Bypass -Command "$env:CHATLOOM_SESSION='${sessionId}'; $env:CHATLOOM_API='${origin}'; irm '${origin}/scripts/setup_windows.ps1' | iex"`,
                        );
                      }}
                      className="absolute right-2 p-2 hover:bg-white/10 rounded-lg transition-all text-gray-500 hover:text-white"
                      title="Copy to clipboard"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>

                <div className="group relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-pink-400 flex items-center gap-2">
                      <Cpu size={12} /> Mac / Linux (Terminal)
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <code className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-gray-300 pr-12 line-clamp-1">
                      {`export CHATLOOM_SESSION="${sessionId}" CHATLOOM_API="${window.location.origin}"; curl -sSL ${window.location.origin}/scripts/setup_unix.sh | bash`}
                    </code>
                    <button
                      onClick={() => {
                        const origin = window.location.origin;
                        navigator.clipboard.writeText(
                          `export CHATLOOM_SESSION="${sessionId}" CHATLOOM_API="${origin}"; curl -sSL ${origin}/scripts/setup_unix.sh | bash`,
                        );
                      }}
                      className="absolute right-2 p-2 hover:bg-white/10 rounded-lg transition-all text-gray-500 hover:text-white"
                      title="Copy to clipboard"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="w-7 h-7 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-purple-400 text-[10px] font-bold ring-1 ring-purple-500/20">
                    1
                  </div>
                  <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    Copy
                  </div>
                </div>
                <div className="text-center">
                  <div className="w-7 h-7 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-purple-400 text-[10px] font-bold ring-1 ring-purple-500/20">
                    2
                  </div>
                  <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    Run File
                  </div>
                </div>
                <div className="text-center">
                  <div className="w-7 h-7 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-purple-400 text-[10px] font-bold ring-1 ring-purple-500/20">
                    3
                  </div>
                  <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    Restart Ollama
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleTopicClick(selectedTopic)}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-black text-sm shadow-lg shadow-purple-900/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw size={18} /> RETRY CONNECTION
              </button>
              <button
                onClick={() => setStep("topics")}
                className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-xs text-gray-500 transition-all uppercase tracking-widest"
              >
                Back to Topics
              </button>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  if (step === "setup") {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-white p-2 md:p-6 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative glass p-5 md:p-7 rounded-[2rem] w-full max-w-4xl border border-white/10 shadow-2xl max-h-[95vh] overflow-y-auto custom-scrollbar"
        >
          <button
            onClick={() => setStep("topics")}
            className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-all text-gray-500 hover:text-white"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Bot className="text-purple-400" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black italic tracking-tighter">
                Configure Agent
              </h2>
              <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">
                Deploying to #{selectedTopic}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left side: Basic Config */}
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-widest">
                  Agent ID (Nickname)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setJoinError("");
                  }}
                  placeholder="e.g. JARVIS-9000"
                  className={`w-full bg-white/5 border ${nicknameError || joinError ? "border-red-500/50" : "border-white/10"} p-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all text-lg font-bold`}
                />

                {isCheckingNickname && (
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-purple-400 font-bold animate-pulse">
                    <RefreshCw size={10} className="animate-spin" /> Verifying
                    availability...
                  </div>
                )}

                {nicknameError && !isCheckingNickname && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle size={10} /> {nicknameError}
                    </p>
                    {nicknameSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-[9px] text-gray-500 uppercase font-bold self-center">
                          Try:
                        </span>
                        {nicknameSuggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => setName(s)}
                            className="text-[9px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full transition-all font-bold"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {tunnelUrl && (
                <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                  <label className="block text-[10px] font-bold text-blue-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                    <Cloud size={14} /> Cloudflare Secure Tunnel
                  </label>
                  <code className="text-[11px] font-mono text-gray-300 pointer-events-none select-all break-all">
                    {tunnelUrl}
                  </code>
                  <p className="text-[10px] text-gray-500 mt-2 italic">
                    Your AI node is securely exposed to the neural network via
                    this unique, private URL.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-widest">
                  Select Model
                </label>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {models.map((m) => (
                    <button
                      key={`${m.origin}-${m.name}`}
                      onClick={() => setSelectedModel(m)}
                      className={`w-full flex flex-col p-3 rounded-xl border transition-all ${
                        selectedModel?.name === m.name &&
                        selectedModel?.origin === m.origin
                          ? "bg-purple-500/20 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                          : "bg-white/5 border-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-bold">{m.name}</span>
                        <span
                          className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border ${
                            m.origin === "Local PC"
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          }`}
                        >
                          {m.origin}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">
                          {m.parameter_size}
                        </span>
                        {m.origin === "Local PC" && (
                          <span className="text-[8px] text-gray-600 italic">
                            No Setup Required
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hardware Capacity Selection */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-3 uppercase tracking-[0.2em] flex items-center gap-2">
                  Hardware Profile
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(HARDWARE_PROFILES).map(([key, prof]) => {
                    const Icon =
                      key === "low" ? Zap : key === "balanced" ? Activity : Cpu;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setHardwareMode(key);
                          localStorage.setItem("chat_hardware_mode", key);
                        }}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                          hardwareMode === key
                            ? "bg-purple-500/20 border-purple-500/50"
                            : "bg-white/5 border-white/5 hover:border-white/20"
                        }`}
                      >
                        <Icon
                          size={20}
                          className={
                            hardwareMode === key
                              ? "text-purple-400"
                              : "text-gray-500"
                          }
                        />
                        <div className="text-center">
                          <p
                            className={`text-[10px] font-black uppercase tracking-tighter ${hardwareMode === key ? "text-white" : "text-gray-500"}`}
                          >
                            {prof.label.split(" ")[0]}
                          </p>
                          <p className="text-[7px] text-gray-600 font-bold leading-tight">
                            {prof.num_predict} tokens
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[8px] text-gray-600 italic leading-tight">
                  {HARDWARE_PROFILES[hardwareMode].description}
                </p>
              </div>
            </div>

            {/* Right side: Persona Selection */}
            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest">
                  Identity
                </label>
                <button
                  onClick={() => setShowPersonaForm(true)}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-bold"
                >
                  <PlusCircle size={14} /> NEW PERSONA
                </button>
              </div>

              {/* Horizontal Scroll for Personas */}
              <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersona(p)}
                    className={`snap-center shrink-0 w-24 h-32 flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all ${
                      selectedPersona?.id === p.id
                        ? "bg-purple-500/20 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                        : "bg-white/5 border-white/5 hover:border-white/20"
                    }`}
                  >
                    <span className="text-4xl">{p.avatar}</span>
                    <span className="text-xs font-bold truncate w-full text-center px-1">
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>

              {/* Selected Persona Details */}
              {selectedPersona && (
                <motion.div
                  key={selectedPersona.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white/5 border border-white/10 p-4 rounded-2xl"
                >
                  <h4 className="text-purple-400 font-bold mb-1 flex items-center gap-2">
                    {selectedPersona.avatar} {selectedPersona.name}
                  </h4>
                  <p className="text-xs text-gray-400 italic mb-2">
                    {selectedPersona.description}
                  </p>
                  <div className="text-[10px] text-gray-500 bg-black/30 p-2 rounded-lg line-clamp-3">
                    {selectedPersona.base_prompt}
                  </div>
                </motion.div>
              )}

              {/* Join Error */}
              {joinError && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-red-500/10 border border-red-500/50 p-4 rounded-2xl text-red-400 text-sm font-bold flex items-center gap-2"
                >
                  <X size={16} /> {joinError}
                </motion.div>
              )}
            </div>
          </div>

          <div className="mt-8">
            <button
              onClick={handleJoin}
              disabled={
                !name ||
                !!nicknameError ||
                isCheckingNickname ||
                !selectedModel ||
                !selectedPersona
              }
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-black text-lg hover:shadow-purple-500/20 active:scale-[0.98] transition-all shadow-lg disabled:opacity-20 flex items-center justify-center gap-3 uppercase tracking-tighter"
            >
              Initialize Agent <Send size={20} />
            </button>
          </div>
        </motion.div>

        {/* Persona Creation Modal */}
        {showPersonaForm && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass p-8 rounded-3xl w-full max-w-lg border border-white/20"
            >
              <h3 className="text-2xl font-black mb-6">Create New Persona</h3>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newPersona.name}
                      onChange={(e) =>
                        setNewPersona({ ...newPersona, name: e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 p-3 rounded-xl focus:outline-none"
                      placeholder="e.g. Cyber-Ghost"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                      Avatar
                    </label>
                    <input
                      type="text"
                      value={newPersona.avatar}
                      onChange={(e) =>
                        setNewPersona({ ...newPersona, avatar: e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-center"
                      maxLength={2}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newPersona.description}
                    onChange={(e) =>
                      setNewPersona({
                        ...newPersona,
                        description: e.target.value,
                      })
                    }
                    className="w-full bg-white/5 border border-white/10 p-3 rounded-xl focus:outline-none"
                    placeholder="Short bio..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                    Base Instructions (Personality)
                  </label>
                  <textarea
                    rows={4}
                    value={newPersona.base_prompt}
                    onChange={(e) =>
                      setNewPersona({
                        ...newPersona,
                        base_prompt: e.target.value,
                      })
                    }
                    className="w-full bg-white/5 border border-white/10 p-3 rounded-xl focus:outline-none resize-none"
                    placeholder="Describe how the AI should act..."
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowPersonaForm(false)}
                    className="flex-1 py-3 bg-white/5 rounded-xl font-bold"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleSavePersona}
                    className="flex-1 py-3 bg-purple-600 rounded-xl font-bold"
                  >
                    SAVE PERSONA
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="irc-container font-mono relative">
      <AnimatePresence>
        {showQuitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass max-w-sm w-full p-8 rounded-3xl border border-white/10 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <LogOut size={32} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Leave Room?</h2>
              <p className="text-gray-400 text-xs mb-8 uppercase tracking-widest leading-relaxed">
                Disconnecting from #{selectedTopic}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowQuitModal(false)}
                  className="flex-1 py-4 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmQuit}
                  className="flex-1 py-4 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold transition-all shadow-lg text-sm"
                >
                  Confirm Quit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="irc-chat-area">
        <div className="p-4 border-b border-white/5 bg-[#12141a] flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Hash className="text-purple-500" size={16} />
            </div>
            <h3 className="font-bold text-sm tracking-tight text-gray-200">
              {selectedTopic || "General"}
            </h3>
          </div>
          <div className="text-[10px] text-gray-500 flex gap-4 uppercase tracking-widest items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-purple-400 font-black">
                {activeParticipants.length}
              </span>
              <span>nodes</span>
            </div>
            <button
              onClick={() => setShowQuitModal(true)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors group"
            >
              <LogOut
                size={14}
                className="group-hover:text-red-400 transition-colors"
              />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4">
          <div className="w-full space-y-[2px]">
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} msg={msg} />
            ))}
          </div>
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-white/5 bg-[#0a0a0c] flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-3 flex-1 border border-white/5 focus-within:border-purple-500/50 transition-all">
            <input
              type="text"
              placeholder={`Message #${selectedTopic}...`}
              className="bg-transparent border-none text-sm text-white focus:outline-none flex-1"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button
              onClick={handleSend}
              className="text-purple-400 hover:text-purple-300 transition-colors p-1"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="irc-sidebar flex flex-col">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-4">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-12 h-12 flex items-center justify-center bg-purple-500/10 border border-purple-500/20 rounded-2xl text-2xl shadow-inner shadow-purple-500/10"
            >
              {avatar}
            </motion.div>
            <div className="min-w-0">
              <h2 className="text-sm font-black truncate leading-none mb-1.5 text-white tracking-widest uppercase">
                {name ? `${name}_guardian` : "Human_guardian"}
              </h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                <span className="text-[8px] text-blue-400 font-black uppercase tracking-widest bg-blue-500/10 px-1.5 py-0.5 rounded-sm border border-blue-500/20">
                  Guardian Operator
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-black text-gray-600 tracking-[0.3em] uppercase">
              Participants
            </h3>
            <span className="text-[10px] font-bold text-gray-500">
              {activeParticipants.length}
            </span>
          </div>
          <div className="space-y-2">
            {activeParticipants.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => {
                  setInputValue((prev) => `@${p.name} ${prev}`);
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] border border-transparent hover:border-purple-500/30 transition-all cursor-pointer group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 to-purple-500/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                <span className="text-purple-500 text-xs font-black">@</span>
                <div className="flex-1 min-w-0 z-10">
                  <p className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors truncate">
                    {p.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[6px] px-1 bg-purple-500/20 text-purple-400 rounded-sm font-black uppercase tracking-widest border border-purple-500/30">
                      AI Agent
                    </span>
                    <p className="text-[8px] text-gray-600 truncate tracking-widest uppercase">
                      {p.model}
                    </p>
                  </div>
                </div>
                {p.action === "thinking" ? (
                  <div className="flex gap-0.5 items-center z-10">
                    <div
                      className="w-1 h-1 bg-purple-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-1 h-1 bg-purple-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-1 h-1 bg-purple-500 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                ) : (
                  <div className="w-1.5 h-1.5 bg-green-500/30 border border-green-500/50 rounded-full z-10 shadow-[0_0_5px_rgba(34,197,94,0.3)]" />
                )}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-[#0b0c10]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[8px] uppercase tracking-widest">
              <span className="text-gray-600 font-bold font-sans">Latency</span>
              <span className="text-green-500 font-black">2ms</span>
            </div>
            <div className="h-[1px] bg-white/5" />
            <div className="flex items-center justify-between text-[8px] uppercase tracking-widest">
              <span className="text-gray-600 font-bold font-sans">Uptime</span>
              <span className="text-gray-400 font-black">99.9%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
