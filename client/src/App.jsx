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
  X,
} from "lucide-react";

// Use public/robot.png for the header image
const ROBOT_IMAGE = "/robot.png";
// Configure Backend URL for production
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
const socket = io(BACKEND_URL, { path: "/socket.io" });

const AVATARS = ["🤖", "👾", "🚀", "🧠", "⚡", "🌈", "🐲", "🐱‍👤"];
const MAX_CLIENT_MESSAGES = 100;
const HARDWARE_PROFILES = {
  low: {
    label: "Power Saver (PC-B)",
    icon: "Zap",
    num_predict: 150, // Increased for complete thoughts
    num_ctx: 1024,
    timeout: 240000, // 4 mins
    description: "Compact answers. Optimized for PC-B hardware.",
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
    new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
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

  const chatEndRef = useRef(null);

  // Fetch topics
  useEffect(() => {
    if (step === "topics") {
      fetchTopics();
    }
  }, [step, page]);

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

  const fetchTopics = async () => {
    setIsTopicsLoading(true);
    try {
      // Small delay for smooth transition feel
      const startTime = Date.now();
      const res = await axios.get(
        `${BACKEND_URL}/api/topics?page=${page}&limit=12`,
      );
      const endTime = Date.now();

      // Ensure the skeleton is visible for at least 300ms for visual stability
      const waitTime = Math.max(0, 300 - (endTime - startTime));
      setTimeout(() => {
        setTopics(res.data.topics);
        setTotalTopics(res.data.total);
        setIsTopicsLoading(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
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
    setSelectedTopic(topicName);
    localStorage.setItem("chat_room", topicName);
    setIsDetecting(true);
    setStep("detect");
    setStatus("Looking for your brain node...");
    setModels([]); // Absolute reset

    try {
      // 1. First Attempt: Direct Browser Access (127.0.0.1 is often more reliable than localhost)
      const targets = [
        "http://localhost:11434/api/tags",
        "http://127.0.0.1:11434/api/tags",
      ];
      for (const target of targets) {
        try {
          const localRes = await axios.get(target, { timeout: 1200 });
          if (localRes.data.models && localRes.data.models.length > 0) {
            const mod = localRes.data.models.map((m) => ({
              name: m.name,
              parameter_size: m.details?.parameter_size || "unknown",
              origin: "Local PC",
            }));
            setModels(mod);
            setStep("setup");
            setIsDetecting(false);
            return;
          }
        } catch (e) {
          console.log(`Direct connection to ${target} failed.`);
        }
      }

      // 2. Second Attempt: Server-Side Bridge
      setStatus("Establishing network bridge...");
      try {
        const res = await axios.get(`${BACKEND_URL}/api/detect-llm`);
        if (
          res.data.status === "success" &&
          res.data.models &&
          res.data.models.length > 0
        ) {
          const mod = res.data.models.map((m) => ({
            ...m,
            origin: res.data.origin || "Remote",
          }));
          setModels(mod);
          setStep("setup");
        } else {
          setStatus(
            res.data.message || "No local brains found on this machine.",
          );
          setIsDetecting(false);
        }
      } catch (err) {
        // Axios error might contain the response message
        const msg = err.response?.data?.message || "PC Node Not Responsive.";
        setStatus(msg);
        setIsDetecting(false);
      }
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

    // Generation Queue to prevent PC-B/Low-end hardware crashes
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
        const res = await axios.post(
          "http://localhost:11434/api/generate",
          {
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
          },
          { timeout: profile.timeout },
        );

        socket.emit("llm_response", {
          room_id,
          text: res.data.response || "...",
          metadata,
        });
      } catch (e) {
        console.error("Queue Task Failed", e);
        socket.emit("llm_response", {
          room_id,
          text: `System Error: My brain (${hardwareRef.current}) is overloaded.`,
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
    socket.emit("message", {
      text: inputValue,
      sender: "Human",
      room_id: selectedTopic,
    });
    setInputValue("");
  };

  if (step === "topics") {
    return (
      <div className="h-screen bg-[#0a0a0c] text-white overflow-y-auto flex flex-col items-center custom-scrollbar">
        <header className="flex flex-col items-center py-6 md:py-10 px-4 text-center w-full">
          <motion.img
            src={ROBOT_IMAGE}
            alt="Happy Robot"
            className="w-32 h-32 md:w-48 md:h-48 object-contain mb-4"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
          />
          <h1 className="text-3xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
            ChatLoom
          </h1>
          <p className="text-gray-500 text-sm md:text-lg max-w-lg italic font-medium">
            "Your Local AI Chat Rooms for Human and Machines."
          </p>
        </header>

        <div className="px-4 md:px-8 w-full flex flex-col items-center pb-12">
          <div className="w-full max-w-7xl mb-10">
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
          <div className="flex items-center gap-4 md:gap-6 bg-white/5 p-2 rounded-xl border border-white/5 shadow-2xl backdrop-blur-md sticky bottom-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2.5 md:p-3 hover:bg-white/10 disabled:opacity-20 rounded-lg transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-purple-500 uppercase tracking-[0.2em] mb-0.5">
                Page
              </span>
              <span className="text-lg md:text-xl font-black leading-none">
                {page}
              </span>
            </div>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 12 >= totalTopics}
              className="p-2.5 md:p-3 hover:bg-white/10 disabled:opacity-20 rounded-lg transition-all"
            >
              <ChevronRight size={20} />
            </button>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a
                  href="/scripts/setup_windows.bat"
                  download
                  className="flex items-center justify-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group"
                >
                  <Monitor size={20} className="text-blue-400" />
                  <div className="text-left">
                    <div className="text-sm font-bold">Windows Setup</div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      setup_windows.bat
                    </div>
                  </div>
                </a>

                <a
                  href="/scripts/setup_unix.sh"
                  download
                  className="flex items-center justify-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group"
                >
                  <Cpu size={20} className="text-pink-400" />
                  <div className="text-left">
                    <div className="text-sm font-bold">Mac / Linux Setup</div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      setup_unix.sh
                    </div>
                  </div>
                </a>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="w-7 h-7 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-purple-400 text-[10px] font-bold ring-1 ring-purple-500/20">
                    1
                  </div>
                  <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    Download
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
          className="glass p-5 md:p-7 rounded-[2rem] w-full max-w-4xl border border-white/10 shadow-2xl max-h-[95vh] overflow-y-auto custom-scrollbar"
        >
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
                  className={`w-full bg-white/5 border ${joinError ? "border-red-500/50" : "border-white/10"} p-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all text-lg font-bold`}
                />
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
              disabled={!name || !selectedModel || !selectedPersona}
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
          <div className="max-w-4xl mx-auto space-y-[2px]">
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
                {name}
              </h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                <span className="text-[8px] text-blue-400 font-black uppercase tracking-widest bg-blue-500/10 px-1.5 py-0.5 rounded-sm border border-blue-500/20">
                  Human Guardian
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
