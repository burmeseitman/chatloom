import React from 'react';
import { 
  Share2, Shield, Activity, 
  Cpu, Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

const SwarmMonitor = ({ 
  swarmSize = 0, 
  activeTasks = 0, 
  consensusState = 87,
  bridgeActive = false,
  setupCommand = "",
  uninstallCommand = ""
}) => {
  return (
    <div className="w-full font-mono select-none py-4 border-b border-white/5 bg-white/[0.01]">
      <div className="max-w-7xl mx-auto px-6 flex flex-col gap-4">
        
        <div className="flex flex-wrap items-center justify-between gap-6">
          {/* Compact Status Header */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3.5">
               <div className="relative flex items-center justify-center">
                  <Share2 size={18} className="text-blue-400" />
               </div>
               <h3 className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase leading-none">Swarm Mesh Active</h3>
            </div>
            <div className="h-4 w-px bg-white/10 hidden md:block" />
            
            {/* Neural Bridge Status Integrated */}
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${bridgeActive ? "bg-green-400 shadow-[0_0_8px_#4ade80]" : "bg-red-500 shadow-[0_0_8px_#ef4444]"}`} />
              <span className={`text-[9px] font-black uppercase tracking-widest ${bridgeActive ? "text-green-400" : "text-red-500"}`}>
                Neural Link: {bridgeActive ? "Online" : "Offline"}
              </span>
            </div>
          </div>

          {/* Real-time stats */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[8px] uppercase font-black text-gray-600 tracking-tighter">Nodes</span>
                <span className="text-sm font-black text-[var(--irc-text)] tabular-nums">{swarmSize}</span>
              </div>
              <Activity size={14} className="text-blue-500/30" />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[8px] uppercase font-black text-gray-600 tracking-tighter">Thinking</span>
                <span className="text-sm font-black text-cyan-400 tabular-nums">{activeTasks}</span>
              </div>
              <Cpu size={14} className="text-cyan-500/30" />
            </div>

            {/* Mini Progress */}
            <div className="flex flex-col gap-1 w-24">
              <div className="flex justify-between text-[7px] uppercase font-black text-gray-500 tracking-widest">
                <span>Sync</span>
                <span className="text-blue-400">{consensusState}%</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${consensusState}%` }}
                  className="h-full bg-blue-500"
                  transition={{ duration: 1 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Offline Warning & Action */}
        {!bridgeActive && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="w-full flex flex-col md:flex-row items-center gap-3 py-2 px-4 bg-red-500/10 border border-red-500/20 rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-2 text-red-400 shrink-0">
              <Zap size={14} className="animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Bridge Needed:</span>
            </div>
            <p className="text-[10px] text-gray-400 flex-1 text-center md:text-left">
              To use your local AI models in this swarm, please run the activation command in your terminal.
            </p>
            <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-lg px-2 py-1 max-w-sm w-full md:w-auto">
              <code className="text-[9px] font-mono text-gray-500 truncate flex-1">{setupCommand}</code>
              <button 
                onClick={() => navigator.clipboard.writeText(setupCommand)}
                className="text-[9px] font-black text-cyan-400 hover:text-white uppercase transition-colors"
              >
                Copy
              </button>
            </div>
          </motion.div>
        )}

        {bridgeActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="w-full flex flex-col md:flex-row items-center gap-3 py-2 px-4 bg-green-500/10 border border-green-500/20 rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-2 text-green-400 shrink-0">
              <Shield size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Node Active:</span>
            </div>
            <p className="text-[10px] text-gray-400 flex-1 text-center md:text-left">
              If you no longer want to join your local AI node, run the uninstall command in your terminal.
            </p>
            <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-lg px-2 py-1 max-w-sm w-full md:w-auto">
              <code className="text-[9px] font-mono text-gray-500 truncate flex-1">{uninstallCommand}</code>
              <button
                onClick={() => navigator.clipboard.writeText(uninstallCommand)}
                className="text-[9px] font-black text-green-400 hover:text-white uppercase transition-colors"
              >
                Copy
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SwarmMonitor;
