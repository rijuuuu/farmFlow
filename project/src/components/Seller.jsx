import React, { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import API from "../api";
import BuyerSellerChat from "./BuyerSellerChat"; 
import "../style/Seller.css";

export default function Seller() {
  const uniqueID = localStorage.getItem("uniqueID");
  const [fpcName, setFpcName] = useState("");
  const [reqs, setReqs] = useState([]);
  const [done, setDone] = useState([]);
  const [currentChatDeal, setCurrentChatDeal] = useState(null); 

  async function loadFPC() {
    try {
      const res = await fetch(`${API}/api/user?id=${uniqueID}`);
      const j = await res.json();
      setFpcName((j.fpcName || "").toString());
    } catch {
      setFpcName("");
    }
  }

  async function loadData() {
    try {
      const res = await fetch(`${API}/api/requests?fpc_name=${encodeURIComponent((fpcName || "").toLowerCase())}`);
      const j = await res.json();
      const arr = Array.isArray(j) ? j : [];
      setReqs(arr.filter((r) => r.status === "pending"));
      setDone(arr.filter((r) => r.status !== "pending"));
    } catch {
      setReqs([]);
      setDone([]);
    }
  }

  useEffect(() => {
    loadFPC();
  }, []);

  useEffect(() => {
    if (fpcName) loadData();
    const iv = setInterval(() => { if (fpcName) loadData(); }, 3000);
    return () => clearInterval(iv);
  }, [fpcName]);

  async function accept(id) {
    await fetch(`${API}/api/accept/${id}`, { method: "POST" });
    loadData();
  }

  async function reject(id) {
    await fetch(`${API}/api/reject/${id}`, { method: "POST" });
    loadData();
  }

  const handleOpenChat = (deal) => {
    const farmer_id = String(deal.farmer_id || "").trim();
    
    if (!farmer_id || !uniqueID) {
        toast.error("Required IDs are missing for this deal. Cannot open chat.");
        return;
    }

    setCurrentChatDeal(deal);
  };
  
  const handleCloseChat = () => {
    setCurrentChatDeal(null);
  }
  
  // UseEffect to toggle the global body class for scrolling
  useEffect(() => {
      if (currentChatDeal) {
          document.body.classList.add('chat-mode-active');
      } else {
          document.body.classList.remove('chat-mode-active');
      }
      return () => {
          document.body.classList.remove('chat-mode-active');
      };
  }, [currentChatDeal]);

  // Conditional Rendering: If a chat deal is active, show the chat window
  if (currentChatDeal) {
      const deal = currentChatDeal;
      const partnerId = String(deal.farmer_id).trim();
      const partnerName = deal.farmer_name;
      
      const farmerIdStr = String(partnerId).toLowerCase();
      const fpcIdStr = String(uniqueID).toLowerCase();

      const room = farmerIdStr < fpcIdStr
          ? `${farmerIdStr}_${fpcIdStr}`
          : `${fpcIdStr}_${farmerIdStr}`;

      return (
        <div className="seller-wrapper">
          <Toaster />
          {/* REMOVED: <h1>{fpcName || "Seller"}</h1> */}
          <BuyerSellerChat 
            user={uniqueID} 
            partnerId={partnerId} 
            partnerName={partnerName} 
            room={room} 
            onCloseChat={handleCloseChat}
          />
        </div>
      );
  }

  return (
    <div className="seller-wrapper">
      <Toaster />
      <div className="seller-header">
        <h1>{fpcName || "Seller"}</h1>
        <div className="sub">Seller Portal</div>
      </div>

      <section className="glass-box">
        <h3>Pending Requests ({reqs.length})</h3>
        <div className="card-list">
          {reqs.map((r) => (
            <div key={r.id} className="card">
              <div className="card-title">{r.farmer_name}</div>
              <div className="card-district">Region: {r.region}</div>
              <div className="card-commodities">{r.crop} • ₹{r.price}</div>

              <button className="connect-btn" onClick={() => accept(r.id)}>Accept</button>
              <button className="reject-btn" onClick={() => reject(r.id)}>Reject</button>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-box">
        <h3>Accepted Chats</h3>
        {done.filter((r) => r.status === "accepted").map((d) => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{d.farmer_name}</div>
              <div style={{ fontSize: 13 }}>{d.crop} • {d.region}</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => handleOpenChat(d)} style={{ background: "#46b96b", padding: "8px 10px", color: "white", borderRadius: 8, border: "none" }}>
                Open Chat
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}