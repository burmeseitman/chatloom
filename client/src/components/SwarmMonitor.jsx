import React from 'react';
import { 
  Share2, Shield, Search, Zap, Activity, 
  Cpu, Globe, Database, Rocket, Bot, Terminal, Layers
} from 'lucide-react';
import { motion } from 'framer-motion';

const SwarmMonitor = ({ 
  swarmSize = 5, 
  activeTasks = 0, 
  consensusState = 87,
  summaryNotes = [
    { label: "Current Era", value: "Stardust 1.0", color: "text-blue-400" },
    { label: "Security", value: "Level 5 (Max)", color: "text-green-400" },
    { label: "Network Load", value: "Minimal", color: "text-cyan-400" },
    { label: "Protocol", value: "Noise-IK v2", color: "text-indigo-400" }
  ]
}) => {
  return (
    <div className="w-full text-[#64748b] font-mono select-none py-10">
      {/* Top Header Section */}
      <div className="flex items-center gap-4 mb-8 opacity-40">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#64748b]/30" />
        <span className="text-[10px] tracking-[0.5em] font-black uppercase whitespace-nowrap">
          Distributed Infrastructure
        </span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#64748b]/30" />
      </div>

      <div className="flex flex-col xl:flex-row items-center justify-center gap-8 px-6">
        
        {/* Left: Summary Notes/Insights */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-[280px] space-y-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-blue-500/50" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-gray-400">Network Insights</h4>
          </div>
          <div className="space-y-3">
            {summaryNotes.map((note, idx) => (
              <div key={idx} className="bg-[var(--irc-border)] border border-[var(--irc-border)] rounded-xl p-3 hover:bg-[var(--irc-sidebar)] transition-all">
                <div className="text-[8px] uppercase tracking-widest text-gray-500 mb-1">{note.label}</div>
                <div className={`text-xs font-black uppercase tracking-wider ${note.color}`}>{note.value}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Center: Main Swarm Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[var(--irc-sidebar)] border border-[var(--irc-border)] rounded-3xl p-8 backdrop-blur-xl relative overflow-hidden ring-1 ring-white/5 shadow-2xl"
        >
          {/* Subtle Background Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -z-10" />
          
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Share2 size={18} className="text-[#64748b]" />
                <h3 className="text-sm font-black text-gray-300 tracking-wider">SWARM NETWORK ACTIVE</h3>
              </div>
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 px-2 py-0.5 rounded-full">
                <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_5px_#22d3ee]" />
                <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">ENCRYPTED</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--irc-bg)] border border-[var(--irc-border)] p-4 rounded-2xl group hover:border-[var(--irc-accent)] transition-all">
                <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-gray-500 mb-2">Active Peers</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-[var(--irc-text)] italic tabular-nums text-blue-400">{swarmSize}</span>
                  <span className="text-[9px] uppercase font-black text-gray-600">Nodes</span>
                </div>
              </div>
              <div className="bg-[var(--irc-bg)] border border-[var(--irc-border)] p-4 rounded-2xl group hover:border-[var(--irc-accent)] transition-all">
                <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-gray-500 mb-2">Thread Count</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-[var(--irc-text)] italic tabular-nums text-cyan-400">{activeTasks}</span>
                  <span className="text-[9px] uppercase font-black text-gray-600">Active</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[10px] uppercase font-black tracking-widest text-gray-500">Sync Pipeline</span>
                <span className="text-[10px] font-black text-blue-400 tabular-nums uppercase tracking-widest">{consensusState}% Synchronized</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden p-[2px]">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${consensusState}%` }}
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-4 border-t border-white/5">
              {[
                { icon: Shield, label: "Noise" },
                { icon: Layers, label: "Ed25519" },
                { icon: Search, label: "Gossip" },
                { icon: Database, label: "Kad DHT" }
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-2 group cursor-help">
                  <item.icon size={13} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-gray-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right: Technical Badges */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col gap-6 opacity-60 ml-4 hidden xl:flex"
        >
          <div className="flex items-center gap-4 group cursor-default">
            <div className="w-10 h-10 rounded-xl bg-blue-500/5 border border-white/5 flex items-center justify-center group-hover:border-blue-500/30 transition-all">
              <Terminal size={18} className="text-gray-500 group-hover:text-blue-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black tracking-widest uppercase text-gray-400">Execution</span>
              <span className="text-[9px] font-bold text-gray-600 uppercase italic">Python 3.12+</span>
            </div>
          </div>
          <div className="flex items-center gap-4 group cursor-default">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/5 border border-white/5 flex items-center justify-center group-hover:border-cyan-500/30 transition-all">
              <Bot size={18} className="text-gray-500 group-hover:text-cyan-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black tracking-widest uppercase text-gray-400">Brain Engine</span>
              <span className="text-[9px] font-bold text-gray-600 uppercase italic">Ollama Llama3</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tech Stack Horizontal Footer */}
      <div className="flex flex-wrap items-center justify-center gap-10 mt-16 opacity-30 px-6">
        {[
          { icon: Rocket, label: "Vite" },
          { icon: Globe, label: "React" },
          { icon: Shield, label: "Tailwind" },
          { icon: Zap, label: "Socket.io" },
          { icon: Database, label: "SQLite" }
        ].map((tech, idx) => (
          <div key={idx} className="flex items-center gap-2 group grayscale hover:grayscale-0 transition-all duration-500">
            <tech.icon size={12} className="group-hover:text-blue-400" />
            <span className="text-[8px] font-black tracking-widest uppercase">{tech.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SwarmMonitor;
