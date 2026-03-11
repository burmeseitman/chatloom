import React from 'react';
import { 
  Share2, Shield, Search, Zap, Activity, 
  Cpu, Globe, Database, Rocket, Bot, Terminal, Layers
} from 'lucide-react';
import { motion } from 'framer-motion';

const SwarmMonitor = ({ swarmSize = 5, activeTasks = 0, consensusState = 87 }) => {
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

      {/* Tech Stack Icons Header */}
      <div className="flex flex-wrap items-center justify-center gap-8 mb-12 opacity-60">
        <div className="flex items-center gap-2 group">
          <Rocket size={14} className="group-hover:text-blue-400 transition-colors" />
          <span className="text-[9px] font-black tracking-widest uppercase">Vite</span>
        </div>
        <div className="flex items-center gap-2 group">
          <Globe size={14} className="group-hover:text-cyan-400 transition-colors" />
          <span className="text-[9px] font-black tracking-widest uppercase">React</span>
        </div>
        <div className="flex items-center gap-2 group">
          <Shield size={14} className="group-hover:text-indigo-400 transition-colors" />
          <span className="text-[9px] font-black tracking-widest uppercase">Tailwind</span>
        </div>
        <div className="flex items-center gap-2 group">
          <Terminal size={14} className="group-hover:text-green-400 transition-colors" />
          <span className="text-[9px] font-black tracking-widest uppercase">Python</span>
        </div>
        <div className="flex items-center gap-2 group">
          <Zap size={14} className="group-hover:text-yellow-400 transition-colors" />
          <span className="text-[9px] font-black tracking-widest uppercase">Socket.io</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-10">
        {/* Main Swarm Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-black/40 border border-white/5 rounded-3xl p-8 backdrop-blur-xl relative overflow-hidden"
        >
          {/* Subtle Background Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -z-10" />
          
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Share2 size={18} className="text-[#64748b]" />
                <h3 className="text-sm font-black text-gray-400 tracking-wider">SWARM NETWORK ACTIVE</h3>
              </div>
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 px-2 py-0.5 rounded-full">
                <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_5px_#22d3ee]" />
                <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">P2P MESH: CONNECTED</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl group hover:border-white/10 transition-all">
                <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-gray-500 mb-2">Peers Discovery</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-gray-100 italic tabular-nums">{swarmSize}</span>
                  <span className="text-[9px] uppercase font-black text-gray-600">DHT Nodes</span>
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl group hover:border-white/10 transition-all">
                <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-gray-500 mb-2">Active Collations</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-gray-100 italic tabular-nums">{activeTasks}</span>
                  <span className="text-[9px] uppercase font-black text-gray-600">Threads</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[10px] uppercase font-black tracking-widest text-gray-500">Consensus Engine</span>
                <span className="text-[10px] font-black text-gray-400 tabular-nums uppercase tracking-widest">{consensusState}% Synchronized</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden p-[2px]">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${consensusState}%` }}
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full"
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-4 border-t border-white/5">
              <div className="flex flex-col items-center gap-2 group">
                <Shield size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-600">Noise</span>
              </div>
              <div className="flex flex-col items-center gap-2 group">
                <Layers size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-600">Ed25519</span>
              </div>
              <div className="flex flex-col items-center gap-2 group">
                <Search size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-600">Gossip</span>
              </div>
              <div className="flex flex-col items-center gap-2 group">
                <Activity size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-600">Kad DHT</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Database & Local AI Icons */}
        <div className="flex flex-col gap-8 opacity-40">
           <div className="flex items-center gap-4 group cursor-default">
              <Database size={20} className="group-hover:text-cyan-400 transition-colors" />
              <span className="text-[11px] font-black tracking-[0.3em] uppercase">SQLite</span>
           </div>
           <div className="flex items-center gap-4 group cursor-default">
              <Layers size={20} className="group-hover:text-blue-400 transition-colors" />
              <span className="text-[11px] font-black tracking-[0.3em] uppercase">Ollama</span>
           </div>
        </div>
      </div>

      {/* Footer Info Section */}
      <div className="flex items-center justify-center gap-4 mt-12 opacity-40">
        <Bot size={14} />
        <span className="text-[10px] tracking-[0.4em] font-black uppercase whitespace-nowrap">
          Active Swarm Agents
        </span>
        <div className="flex items-center justify-center w-5 h-5 rounded bg-white/10 text-[9px] font-black text-gray-300">
          {swarmSize}
        </div>
      </div>
    </div>
  );
};

export default SwarmMonitor;
