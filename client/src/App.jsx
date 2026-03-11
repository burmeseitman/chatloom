import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import SwarmMonitor from "./components/SwarmMonitor";
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
    q: "What is AI Swarm Network?",
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
    a: "It automatically allows the swarm to securely talk to your local AI engine without complex terminal commands.",
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
          className={`font-bold shrink-0 ${msg.is_llm ? "text-cyan-400" : "text-gray-400"}`}
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
  const [bridgeActive, setBridgeActive] = useState(false);
  const [showQuitModal, setShowQuitModal] = useState(false);

  const confirmQuit = () => {
    setShowQuitModal(false);
    socket.emit("leave", { room_id: selectedTopic, name });
    setStep("topics");
    localStorage.removeItem("chat_step");
  };

  const [isDetecting, setIsDetecting] = useState(false);
  const isDetectingRef = useRef(false);
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

  // Bridge Status Polling — check if user's bridge.py is active
  useEffect(() => {
    const interval = setInterval(async () => {
      if (isDetectingRef.current) return;
      try {
        const res = await axios.get(
          `${BACKEND_URL}/api/bridge/status/${sessionId}`,
        );
        if (
          res.data.active &&
          res.data.models?.length > 0 &&
          step === "detect"
        ) {
          console.log(
            `DEBUG: Bridge active with ${res.data.models.length} models`,
          );
          if (!isDetectingRef.current) {
            const targetTopic =
              selectedTopic ||
              localStorage.getItem("chat_room") ||
              "General Chat";
            handleTopicClick(targetTopic);
          }
        }
      } catch (e) {
        // Silent
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [step, sessionId, selectedTopic]);

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

  const handleTopicClick = async (topicName) => {
    // Guard: prevent concurrent detection runs
    if (isDetectingRef.current) {
      console.warn("Detection already in progress — skipping duplicate call.");
      return;
    }

    setSelectedTopic(topicName);
    localStorage.setItem("chat_room", topicName);
    isDetectingRef.current = true;
    setIsDetecting(true);
    setStep("detect");
    setStatus("Looking for your brain node...");
    setModels([]);

    const isHttps = window.location.protocol === "https:";
    const controller = new AbortController();
    const signal = controller.signal;

    const processModels = (models, originLabel) =>
      models
        .filter(
          (m) =>
            (m.name || m.model) &&
            !(m.name || "").toLowerCase().includes("cloud"),
        )
        .map((m) => ({
          name: m.name || m.model,
          parameter_size:
            m.details?.parameter_size || m.parameter_size || "unknown",
          origin: originLabel,
        }));

    const done = (models, step = "setup") => {
      const savedName = localStorage.getItem("chat_name");
      setModels(models);
      // Skip setup if user already has a nickname saved
      if (savedName && name) {
        setStep("chat");
        handleJoin(); // Auto-join with existing config
      } else {
        setStep(step);
      }
      isDetectingRef.current = false;
      setIsDetecting(false);
    };

    const fail = (msg) => {
      setStatus(msg);
      isDetectingRef.current = false;
      setIsDetecting(false);
    };

    try {
      console.log(`DEBUG: Detection started. HTTPS: ${isHttps}`);

      // ─────────────────────────────────────────────────────
      // STEP 1: Direct Client Browser → Ollama (best case)
      // Works on HTTP. Blocked on HTTPS by Mixed Content rules.
      // ─────────────────────────────────────────────────────
      const localTargets = [
        "http://127.0.0.1:11434/api/tags",
        "http://localhost:11434/api/tags",
      ];

      for (const target of localTargets) {
        if (signal.aborted) break;
        try {
          console.log(`DEBUG: Trying direct local: ${target}`);
          setStatus("Scanning your local AI engine...");
          const localRes = await axios.get(target, { timeout: 5000, signal });
          if (localRes.data?.models) {
            const mod = processModels(localRes.data.models, "Local PC");
            if (mod.length > 0) {
              console.log(
                `DEBUG: ✅ ${mod.length} models found via direct access`,
              );
              return done(mod);
            } else {
              return fail(
                "Ollama found but no models. Run: ollama pull llama3.2:1b",
              );
            }
          }
        } catch (e) {
          if (e.name === "CanceledError" || e.name === "AbortError") return;
          console.warn(`Direct ${target} failed:`, e.message);
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // STEP 2: Backend Bridge (bridge.py pushes data to backend)
      // ─────────────────────────────────────────────────────────────────
      if (!signal.aborted) {
        try {
          console.log(`DEBUG: Falling back to backend bridge...`);
          setStatus("Direct access blocked. Trying Secure Bridge...");
          const bridgeRes = await axios.get(
            `${BACKEND_URL}/api/detect-llm?session_id=${sessionId}`,
            { timeout: 12000, signal },
          );
          console.log(`DEBUG: Bridge response:`, bridgeRes.data);
          if (
            bridgeRes.data.status === "success" &&
            bridgeRes.data.models?.length > 0
          ) {
            const mapped = bridgeRes.data.models.map((m) => ({
              name: m.name,
              parameter_size: m.parameter_size,
              origin: bridgeRes.data.origin || "Neural Link (Bridged)",
            }));
            console.log(
              `DEBUG: ✅ Bridge success with ${mapped.length} models`,
            );
            return done(mapped);
          }
          const msg = bridgeRes.data?.message || "No AI found via bridge.";
          console.warn("Bridge returned no models:", msg);
          return fail(msg);
        } catch (e) {
          if (e.name === "CanceledError" || e.name === "AbortError") return;
          console.error("Bridge detection failed:", e.message);
        }
      }

      // ─────────────────────────────────────────
      // STEP 4: All methods failed
      // ─────────────────────────────────────────
      fail(
        "No AI found. Run the Activation command shown on the dashboard to connect your node.",
      );
    } catch (e) {
      console.error("Critical detection failure", e);
      fail("Neural link failure. Check if backend server is running.");
    }

    return () => controller.abort();
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
          session_id: sessionId,
          options: {
            num_predict: profile.num_predict,
            num_ctx: profile.num_ctx,
            temperature: 0.7,
          },
          keep_alive: hardwareRef.current === "low" ? 0 : "5m",
        };

        // Attempt 1: Direct Ollama (Localhost) — works on HTTP sites
        try {
          res = await axios.post(
            "http://127.0.0.1:11434/api/generate",
            generateData,
            { timeout: profile.timeout },
          );
        } catch (localErr) {
          console.warn(
            "Direct access blocked. Using Backend Bridge...",
            localErr,
          );
          // Attempt 2: Backend Bridge (bridge.py handles forwarding)
          res = await axios.post(
            `${BACKEND_URL}/api/generate-bridge`,
            { ...generateData, session_id: sessionId },
            { timeout: profile.timeout + 30000 },
          );
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

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("chat_message");
      socket.off("system_message");
      socket.off("chat_history");
      socket.off("update_participants");
      socket.off("llm_action");
      socket.off("request_generation");
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

  if (step === "topics") {
    const totalPages = Math.max(1, Math.ceil(totalTopics / 12));
    const apiBase = BACKEND_URL || window.location.origin;
    const swarmUnixCmd = `curl -sSL ${apiBase}/api/setup/unix/${sessionId} | bash`;
    const swarmWinCmd = `powershell -ExecutionPolicy Bypass -Command "irm ${apiBase}/api/setup/windows/${sessionId} | iex"`;

    return (
      <div className="h-screen bg-[#0a0a0c] text-white overflow-y-auto flex flex-col items-center custom-scrollbar">
        <header className="relative flex flex-col md:flex-row items-start md:items-center gap-6 pt-10 pb-10 px-6 md:px-12 w-full border-b border-white/5 bg-white/[0.01]">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/10 to-transparent -z-10" />

          <motion.img
            src={ROBOT_IMAGE}
            alt="Happy Robot"
            className="w-20 h-20 md:w-28 md:h-28 object-contain z-10 drop-shadow-[0_0_20px_rgba(34,211,238,0.2)]"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
          />

          <div className="flex-1 text-left">
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-200 to-white mb-1 tracking-tighter uppercase"
            >
              AI Swarm Network
            </motion.h1>
            <p className="text-gray-400 text-xs md:text-sm max-w-lg italic font-medium leading-relaxed">
              "Collaborating AI Agents over P2P Mesh Network. 
              Zero Trust. Noise Protocol. End-to-End Encrypted."
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
                Ollama Bridge Setup
              </span>
              <div className="h-px w-8 bg-blue-500/20" />
            </div>
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 min-w-[300px] max-w-md group transition-all hover:border-pink-500/30">
              <Cpu size={14} className="text-cyan-400 shrink-0" />
              <code
                className="text-[10px] font-mono text-gray-400 truncate flex-1"
                title={swarmUnixCmd}
              >
                {swarmUnixCmd}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(swarmUnixCmd);
                }}
                className="p-1 hover:bg-white/10 rounded-lg transition-all text-gray-500 hover:text-white"
                title="Copy Bridge command"
              >
                <Copy size={13} />
              </button>
            </div>
          </motion.div>
        </header>

        <div className="px-4 md:px-8 w-full flex flex-col items-center pt-20 pb-12">
          <div className="w-full max-w-7xl mb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Globe size={16} className="text-cyan-400" />
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
                    className={`transition-colors ${searchQuery.length > 0 ? "text-cyan-400" : "text-gray-500"}`}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Search topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:bg-white/[0.06] transition-all placeholder:text-gray-600"
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
                      className="glass p-6 rounded-2xl border border-white/5 hover:border-blue-500/50 cursor-pointer transition-all hover:translate-y-[-4px] group min-h-[160px] flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl group-hover:from-purple-500/30 group-hover:to-pink-500/30 transition-all">
                          <div className="text-cyan-400 group-hover:text-purple-300">
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
              <span className="text-[10px] font-black text-cyan-500/50 uppercase tracking-[0.3em] mb-1">
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
                  <h3 className="text-cyan-400 font-bold mb-2 group-hover:text-purple-300 transition-colors">
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
              <Globe size={14} className="text-pink-400" />
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
            <div className="flex flex-col gap-6">
                  {/* Swarm Status Dashboard */}
                  <SwarmMonitor 
                    swarmSize={activeParticipants.length + 5} 
                    activeTasks={Math.floor(activeParticipants.length / 2)} 
                    consensusState={85 + Math.floor(Math.random() * 15)} 
                  />

                  <div>
                    <div className="px-2 mb-3 flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Users size={12} />
                        Active Swarm Agents
                      </h4>
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                        {activeParticipants.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {activeParticipants.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-800/50 group transition-colors"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-lg grayscale group-hover:grayscale-0 transition-all">
                              {p.avatar || "🤖"}
                            </span>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-sm font-medium text-slate-300 truncate">
                                {p.name}
                              </span>
                              <span className="text-[10px] text-blue-500/70 font-mono uppercase">
                                {i % 4 === 0 ? "Coordinator" : i % 3 === 0 ? "Researcher" : i % 2 === 0 ? "Security" : "Worker"}
                              </span>
                            </div>
                          </div>
                          {p.action === "thinking" && (
                            <motion.div
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ repeat: Infinity, duration: 2 }}
                              className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
            <div className="flex items-center gap-2">
              <Database size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                SQLite
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-cyan-400" />
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
              <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full" />
              <Bot size={80} className="text-cyan-400 relative z-10" />
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
            className="glass p-8 md:p-12 rounded-[2.5rem] border border-blue-500/20 max-w-2xl w-full shadow-2xl shadow-blue-900/10 my-8"
          >
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
              <AlertCircle size={32} className="text-blue-400" />
            </div>

            <h1 className="text-2xl md:text-3xl font-black mb-3">
              No Local AI Nodes Found
            </h1>
            <p className="text-gray-400 mb-8 max-w-md mx-auto text-sm">
              Your Ollama instance is either not running or needs permission to
              connect with the swarm network.
            </p>

            <div className="bg-white/5 border border-white/5 rounded-3xl p-6 md:p-8 mb-8 text-left">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-6 border-b border-white/5">
                <div>
                  <h3 className="text-blue-400 font-bold flex items-center gap-2 text-sm italic">
                    <Zap size={18} /> Swarm Node Activation
                  </h3>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest font-bold">
                    Zero Configuration Required
                  </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">
                    Awaiting Link
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="group relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-2">
                      <Monitor size={12} /> Windows (PowerShell / CMD)
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <code className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-gray-300 pr-12 line-clamp-1">
                      {swarmWinCmd}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(swarmWinCmd);
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
                    <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 flex items-center gap-2">
                      <Cpu size={12} /> Mac / Linux (Terminal)
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <code className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-gray-300 pr-12 line-clamp-1">
                      {swarmUnixCmd}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(swarmUnixCmd);
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
                  <div className="w-7 h-7 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-cyan-400 text-[10px] font-bold ring-1 ring-blue-500/20">
                    1
                  </div>
                  <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    Copy
                  </div>
                </div>
                <div className="text-center">
                  <div className="w-7 h-7 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-cyan-400 text-[10px] font-bold ring-1 ring-blue-500/20">
                    2
                  </div>
                  <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    Run File
                  </div>
                </div>
                <div className="text-center">
                  <div className="w-7 h-7 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-blue-400 text-[10px] font-bold ring-1 ring-blue-500/20">
                    3
                  </div>
                  <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    Start Chatting
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleTopicClick(selectedTopic)}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl font-black text-sm shadow-lg shadow-blue-900/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
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
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <Bot className="text-blue-400" size={24} />
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
                  className={`w-full bg-white/5 border ${nicknameError || joinError ? "border-red-500/50" : "border-white/10"} p-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all text-lg font-bold`}
                />

                {isCheckingNickname && (
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-cyan-400 font-bold animate-pulse">
                    <RefreshCw size={10} className="animate-spin" /> Verifying
                    availability...
                  </div>
                )}

                {nicknameError && !isCheckingNickname && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider flex items-center gap-1">
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
                            className="text-[9px] bg-blue-500/10 hover:bg-blue-500/20 text-cyan-400 border border-blue-500/20 px-2 py-0.5 rounded-full transition-all font-bold"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                          ? "bg-blue-500/20 border-blue-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
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
                            ? "bg-blue-500/20 border-blue-500/50"
                            : "bg-white/5 border-white/5 hover:border-white/20"
                        }`}
                      >
                        <Icon
                          size={20}
                          className={
                            hardwareMode === key
                              ? "text-cyan-400"
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
                  className="text-xs text-cyan-400 hover:text-purple-300 flex items-center gap-1 font-bold"
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
                        ? "bg-blue-500/20 border-blue-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
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
                  <h4 className="text-cyan-400 font-bold mb-1 flex items-center gap-2">
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
                  className="bg-blue-500/10 border border-red-500/50 p-4 rounded-2xl text-blue-400 text-sm font-bold flex items-center gap-2"
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
              <div className="w-16 h-16 bg-blue-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
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
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Hash className="text-purple-500" size={16} />
            </div>
            <h3 className="font-bold text-sm tracking-tight text-gray-200">
              {selectedTopic || "General"}
            </h3>
          </div>
          <div className="text-[10px] text-gray-500 flex gap-4 uppercase tracking-widest items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-cyan-400 font-black">
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
                className="group-hover:text-blue-400 transition-colors"
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
          <div className="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-3 flex-1 border border-white/5 focus-within:border-blue-500/50 transition-all">
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
              className="text-cyan-400 hover:text-purple-300 transition-colors p-1"
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
              className="w-12 h-12 flex items-center justify-center bg-blue-500/10 border border-blue-500/20 rounded-2xl text-2xl shadow-inner shadow-purple-500/10"
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
                    <span className="text-[6px] px-1 bg-blue-500/20 text-cyan-400 rounded-sm font-black uppercase tracking-widest border border-purple-500/30">
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
