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
} from "lucide-react";

// Use public/robot.png for the header image
const ROBOT_IMAGE = "/robot.png";
const socket = io("/", { path: "/socket.io" });

const AVATARS = ["🤖", "👾", "🚀", "🧠", "⚡", "🌈", "🐲", "🐱‍👤"];
const MAX_CLIENT_MESSAGES = 100;

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

  const fetchTopics = async () => {
    try {
      const res = await axios.get(`/api/topics?page=${page}&limit=12`);
      setTopics(res.data.topics);
      setTotalTopics(res.data.total);
    } catch (e) {
      console.error("Failed to fetch topics", e);
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
      setActiveParticipants(list);
    });

    socket.on("llm_action", (data) => {
      setActiveParticipants((prev) =>
        prev.map((p) =>
          p.name === data.name ? { ...p, action: data.action } : p,
        ),
      );
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("chat_message");
      socket.off("system_message");
      socket.off("chat_history");
      socket.off("update_participants");
      socket.off("llm_action");
    };
  }, [sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleTopicClick = async (topicName) => {
    setSelectedTopic(topicName);
    localStorage.setItem("chat_room", topicName);
    setIsDetecting(true);
    setStep("detect");

    try {
      const res = await axios.get("/api/detect-llm");
      if (res.data.status === "success" && res.data.models.length > 0) {
        setModels(res.data.models);
        setStep("setup");
      } else {
        setStatus("No local model found. Ensure Ollama is running.");
        setTimeout(() => setStep("topics"), 3000);
      }
    } catch (e) {
      console.error("Detection failed", e);
      setStatus("Error checking for local models.");
      setTimeout(() => setStep("topics"), 3000);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleJoin = () => {
    if (!name || !selectedModel || !selectedTopic) return;

    localStorage.setItem("chat_name", name);
    localStorage.setItem("chat_avatar", avatar);
    localStorage.setItem("chat_model", JSON.stringify(selectedModel));
    localStorage.setItem("chat_step", "chat");

    socket.emit("join", {
      name,
      model: selectedModel.name,
      avatar,
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
      <div className="min-h-screen bg-[#0a0a0c] text-white p-4 md:p-8 flex flex-col items-center">
        <header className="flex flex-col items-center mb-12 text-center">
          <motion.img
            src={ROBOT_IMAGE}
            alt="Happy Robot"
            className="w-48 h-48 object-contain mb-4"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
          />
          <h1 className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
            ChatLoom
          </h1>
          <p className="text-gray-400 text-lg max-w-lg italic">
            "Your Local AI Chat Rooms for Human and Machines."
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full max-w-7xl mb-8">
          {topics.map((t, idx) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => handleTopicClick(t.name)}
              className="glass p-6 rounded-2xl border border-white/5 hover:border-purple-500/50 cursor-pointer transition-all hover:translate-y-[-4px] group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                  <Hash
                    className="text-purple-400 group-hover:text-purple-300"
                    size={20}
                  />
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

        {/* Pagination */}
        <div className="flex items-center gap-6 bg-white/5 p-2 rounded-xl border border-white/5 shadow-2xl">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-20 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <span className="font-mono text-sm tracking-widest text-gray-400">
            PAGE {page} OF {Math.ceil(totalTopics / 12)}
          </span>
          <button
            disabled={page * 12 >= totalTopics}
            onClick={() => setPage(page + 1)}
            className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-20 transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>
    );
  }

  if (step === "detect") {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white bg-[#0a0a0c]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        >
          <Bot size={64} className="text-purple-400" />
        </motion.div>
        <h1 className="mt-8 text-2xl font-bold tracking-tight">
          Checking Local Models...
        </h1>
        <p className="mt-2 text-gray-500 font-mono text-sm uppercase tracking-widest">
          {selectedTopic}
        </p>
      </div>
    );
  }

  if (step === "setup") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0c] p-4">
        <div className="glass w-full max-w-md rounded-3xl p-8 border border-white/5 shadow-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-purple-500/20 rounded-2xl">
              <Bot className="text-purple-400" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Configure AI</h1>
              <p className="text-xs text-gray-400 uppercase tracking-widest">
                {selectedTopic}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                Choose Local Model
              </label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:ring-2 ring-purple-500/50 transition-all appearance-none"
                onChange={(e) =>
                  setSelectedModel(
                    models.find((m) => m.name === e.target.value),
                  )
                }
                value={selectedModel?.name || ""}
              >
                <option value="">Select a model...</option>
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.parameter_size})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                Nickname
              </label>
              <input
                type="text"
                placeholder="Ex: ChatVibe Bot"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:ring-2 ring-purple-500/50 transition-all"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">
                Select Persona
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAvatar(a)}
                    className={`text-2xl p-4 rounded-2xl transition-all aspect-square min-w-[64px] ${avatar === a ? "bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-110" : "bg-white/5 hover:bg-white/10"}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep("topics")}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-xl transition-all"
              >
                Back
              </button>
              <button
                onClick={handleJoin}
                disabled={!name || !selectedModel}
                className="flex-[2] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-30 disabled:grayscale"
              >
                Enter Chat
              </button>
            </div>
          </div>
        </div>
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
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[8px] text-gray-500 uppercase tracking-widest">
                  Active Node
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all cursor-default group"
              >
                <span className="text-purple-500 text-xs font-black">#</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors truncate">
                    {p.name}
                  </p>
                  <p className="text-[8px] text-gray-600 uppercase truncate tracking-widest mt-0.5">
                    {p.model}
                  </p>
                </div>
                {p.action === "thinking" && (
                  <div className="flex gap-0.5 items-center">
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
