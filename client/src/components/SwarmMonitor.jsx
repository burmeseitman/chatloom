import React from 'react';
import { 
  Share2, Shield, Activity, 
  Cpu, Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

const SwarmMonitor = ({ 
  swarmSize = 5, 
  activeTasks = 0, 
  consensusState = 87
}) => {
  return (
    <div className="w-full font-mono select-none py-4 border-b border-white/5 bg-white/[0.01]">
      <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-6">
        
        {/* Compact Status Header */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3.5">
             <div className="relative flex items-center justify-center">
                <Share2 size={18} className="text-blue-400" />
                <div className="absolute top-[2.5px] right-[3.2px] w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_12px_#22c55e] z-10" />
             </div>
             <h3 className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase leading-none">Swarm Mesh Active</h3>
          </div>
          <div className="h-4 w-px bg-white/10 hidden md:block" />
          <div className="hidden md:flex items-center gap-2">
            <Shield size={12} className="text-gray-600" />
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">E2E Encrypted</span>
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
    </div>
  );
};

export default SwarmMonitor;
