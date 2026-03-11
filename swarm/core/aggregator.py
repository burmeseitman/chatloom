from typing import List, Dict, Any
import statistics

class KnowledgeAggregator:
    """
    Synthesizes results from multiple AI agents and performs consensus checks.
    """
    def __init__(self):
        self.knowledge_vault = {} # Final synthesized results
        self.pending_consensus = {} # task_id -> list of agent responses

    def add_result(self, task_id: str, agent_id: str, result: str, confidence: float = 1.0):
        """Collect a response from a swarm agent."""
        if task_id not in self.pending_consensus:
            self.pending_consensus[task_id] = []
        
        self.pending_consensus[task_id].append({
            "agent": agent_id,
            "result": result,
            "confidence": confidence
        })

    def run_consensus(self, task_id: str) -> Dict[str, Any]:
        """
        Consensus Engine: Evaluates multiple agent outputs to find the best result.
        Uses a weighted majority or synthesis approach.
        """
        results = self.pending_consensus.get(task_id, [])
        if not results:
            return {"status": "no_data"}

        if len(results) == 1:
            return {"status": "final", "result": results[0]["result"], "confidence": results[0]["confidence"]}

        # Basic Consensus logic: Return the one with highest confidence or most frequent
        # In a real swarm, this would be another LLM summarizing the results (Synthesis)
        best_result = max(results, key=lambda x: x["confidence"])
        
        # Move to knowledge vault
        self.knowledge_vault[task_id] = best_result["result"]
        del self.pending_consensus[task_id]
        
        return {
            "status": "final",
            "result": best_result["result"],
            "agent_count": len(results),
            "consensus_score": sum(r["confidence"] for r in results) / len(results)
        }

    def get_shared_knowledge(self) -> Dict[str, str]:
        """Retrieve the global state of the swarm knowledge."""
        return self.knowledge_vault
