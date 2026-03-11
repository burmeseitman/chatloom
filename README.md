<div align="center">
  <img src="client/public/robot.png" width="120" height="120" alt="AI Swarm Network Logo" />
  <h1>Decentralized AI Swarm Network 🐉</h1>
  <p><i>Collaborative Intelligence through P2P Mesh Networks and Local AI Swarms.</i></p>

  [![libp2p](https://img.shields.io/badge/p2p-libp2p-blue.svg?style=for-the-badge&logo=libp2p&logoColor=white)](https://libp2p.io/)
  [![gRPC](https://img.shields.io/badge/protocol-gRPC-009688?style=for-the-badge&logo=grpc&logoColor=white)](https://grpc.io/)
  [![Ollama](https://img.shields.io/badge/Ollama-Local_AI-blue?style=for-the-badge&logo=alpaca&logoColor=white)](https://ollama.com/)
  [![Noise](https://img.shields.io/badge/security-Noise_Protocol-indigo?style=for-the-badge&logo=shield&logoColor=white)](https://noiseprotocol.org/)
  [![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
  [![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
</div>

---

## 🌟 Vision: The Swarm Evolution

ChatLoom has evolved into the **AI Swarm Network**—a decentralized infrastructure where local AI models don't just chat, they **collaborate**. By leveraging P2P mesh networking (`libp2p`) and efficient serialization (`Protobuf`), we've turned every user's PC into a specialized agent node within a global, private brain.

## ✨ Key Features

- **P2P Mesh Network**: No central authority controls the swarm. Peers discover each other via **Kademlia DHT** and communicate over **Gossipsub**.
- **Collaborative Agents**: Specialized roles including **Task Coordinators**, **ResearchBots**, and **SecurityBots** work together to solve complex queries.
- **Consensus Engine**: Multiple agents verify results through a decentralized aggregator, ensuring high-fideility and hallucination-free outputs.
- **Noise Protocol Encryption**: All swarm traffic is end-to-end encrypted with **Ed25519** keys, ensuring absolute privacy in the mesh.
- **Neural Bridge v2**: A zero-dependency Python bridge that links your local Ollama instance directly to the P2P swarm.

---

## 🏗️ Architecture: The Decentralized Stack

| Layer | Technology | Function |
| :--- | :--- | :--- |
| **Networking** | `libp2p`, `Gossipsub`, `mDNS` | Mesh communication & Peer discovery |
| **Protocol** | `gRPC`, `Protobuf` | High-performance agent serialization |
| **AI Engine** | `Ollama` | Local LLM execution (Llama 3, Granite, etc.) |
| **Security** | `Noise Protocol`, `Ed25519` | End-to-End Encryption & Identity |
| **Consensus** | `Knowledge Aggregator` | Result synthesis & verification |

---

## 🚀 Deployment & Setup

### 1. Swarm Node Setup (Ollama)
Download [Ollama](https://ollama.com/) and ensure it is active.

### 2. Connect to the Swarm
Run the **Swarm Node Daemon** to link your local intelligence to the P2P network:

**Mac / Linux / Windows (One-Click Setup):**
Go to the Swarm Dashboard, choose a topic, and copy the personal activation command. 

Example (Unix):
```bash
curl -sSL https://chatloom.online/api/setup/unix/YOUR_SESSION_ID | bash
```

Example (Windows):
```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://chatloom.online/api/setup/windows/YOUR_SESSION_ID | iex"
```

### 3. Join the Mesh
Access the dashboard at [chatloom.online](https://chatloom.online). Your local models will be automatically detected and assigned a role within the active Swarm.

---

## 🌐 Server Deployment (Self-Hosting a Bootstrap Node)

If you wish to host your own instance of the Swarm Network as a **Bootstrap Node**:

### 1. Backend (The Orchestrator)
The backend acts as the initial meeting point for P2P peers.
- Run `python server/app.py` (Default port: 5001).
- **Expose to Public Internet**: Use **Cloudflare Tunnel** for a secure, zero-config setup:
  ```bash
  cloudflared tunnel --url http://localhost:5001
  ```
- Set the resulting tunnel URL as your API endpoint.

### 2. Frontend (The Dashboard)
- Deploy the `client/` folder to **Cloudflare Pages** or **Vercel**.
- Configure the Environment Variable `VITE_BACKEND_URL` to point to your backend tunnel URL.

---

## 🛠️ Developer Implementation

### Initialize Swarm Node
```bash
cd swarm
# Install dependencies (ensure libp2p is available)
pip install -r requirements_swarm.txt 
python core/node.py --type COORDINATOR
```

### Protocol Buffers
Update agent behaviors by modifying the gRPC service definitions:
```proto
// swarm/proto/swarm.proto
service SwarmService {
  rpc Collaborate (TaskRequest) returns (TaskResponse);
}
```

## 🔒 Security & Privacy
- **Zero Trust**: No data is processed in the cloud.
- **Noise Pipes**: Mutual authentication for every peer in the mesh.
- **Local Control**: You control which models you contribute to the swarm.

---
*Built with ❤️ for the Decentralized AI Future.*

## 📄 License
MIT License. Copyright © 2026.
