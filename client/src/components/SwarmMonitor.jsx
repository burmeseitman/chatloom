import React from 'react';
import { Share2, Shield, Search, Zap, Activity } from 'lucide-react';

const SwarmMonitor = ({ swarmSize, activeTasks, consensusState }) => {
  return (
    <div className="bg-slate-900/80 backdrop-blur-md rounded-xl p-4 border border-blue-500/30 shadow-lg shadow-blue-500/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-blue-400 font-bold flex items-center gap-2">
          <Share2 size={18} className="animate-pulse" />
          SWARM NETWORK ACTIVE
        </h3>
        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30">
          P2P MESH: CONNECTED
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Peers Discovery</div>
          <div className="text-xl font-mono text-white flex items-baseline gap-2">
            {swarmSize} <span className="text-xs text-blue-400">DHT Nodes</span>
          </div>
        </div>
        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Active Collations</div>
          <div className="text-xl font-mono text-white flex items-baseline gap-2">
            {activeTasks} <span className="text-xs text-blue-400">Threads</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Consensus Engine</span>
          <span className="text-blue-400 font-mono">{consensusState}% Synchronized</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-blue-600 to-indigo-400 h-full transition-all duration-500Ease"
            style={{ width: `${consensusState}%` }}
          />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700/50 flex justify-around opacity-70">
        <div className="flex flex-col items-center gap-1">
          <Shield size={14} className="text-indigo-400" title="Noise Protocol" />
          <span className="text-[10px] text-slate-500">Noise</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Zap size={14} className="text-yellow-400" title="Ed25519 Keys" />
          <span className="text-[10px] text-slate-500">Ed25519</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Search size={14} className="text-blue-400" title="Gossipsub" />
          <span className="text-[10px] text-slate-500">Gossip</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Activity size={14} className="text-green-400" title="Kademlia" />
          <span className="text-[10px] text-slate-500">Kad DHT</span>
        </div>
      </div>
    </div>
  );
};

export default SwarmMonitor;
