import React, { useEffect, useState } from "react";
import BuyerSellerChat from "./BuyerSellerChat";
import API from "../api";
import "../style/ChatSidebar.css";
import { toast } from "react-hot-toast";

export default function ChatSidebar({ open, onClose, userID, initialActiveChat }) { 
  const [role] = useState(localStorage.getItem("role") || "farmer");
  const [uniqueID] = useState(userID || localStorage.getItem("uniqueID"));
  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);

  const loadChats = async () => {
    let url =
      role === "seller"
        ? `${API}/api/requests?fpc_id=${uniqueID}`
        : `${API}/api/requests?farmer_id=${uniqueID}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const accepted = Array.isArray(data)
          ? data.filter((r) => r.status === "accepted")
          : [];

        setChats(accepted);
        if (!accepted.length) setActive(null);
        
        if (active && !accepted.some(c => c.id === active.c.id)) {
            setActive(null);
        }

    } catch (e) {
        console.error("Failed to load chats:", e);
        setChats([]);
        setActive(null);
    }
  };

  useEffect(() => {
    if (open) loadChats();
    const iv = setInterval(() => {
      if (open) loadChats();
    }, 2000);
    return () => clearInterval(iv);
  }, [open]);

  useEffect(() => {
    if (open && initialActiveChat && !active) {
        if (chats.some(c => c.id === initialActiveChat.c.id)) {
            setActive(initialActiveChat);
        }
    }
  }, [open, initialActiveChat, chats, active]);


  const del = async (rid) => {
    await fetch(`${API}/api/request/delete/${rid}`, { method: "POST" });
    setActive(null);
    loadChats();
  };
  
  const handleSetActive = (c) => {
    // FIX: Use String() and trim() for stricter validation
    const farmerId = String(c.farmer_id || "").trim();
    const fpcId = String(c.fpc_id || "").trim();

    if (!farmerId || !fpcId) {
        toast.error("Required chat IDs are missing. Cannot open chat.");
        return;
    }

    const partnerId = role === "seller" ? farmerId : fpcId;

    const farmerIdStr = farmerId.toLowerCase();
    const fpcIdStr = fpcId.toLowerCase();

    const room =
        farmerIdStr < fpcIdStr
          ? `${farmerIdStr}_${fpcIdStr}`
          : `${fpcIdStr}_${farmerIdStr}`;

    setActive({ c, partnerId, room });
  }

  return (
    <div className={`chat-sidebar ${open ? "open" : ""}`} role="dialog" inert={!open}>
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-title">Chats</div>
        <button className="chat-sidebar-close" onClick={onClose}>✕</button>
      </div>

      <div className="chat-list">
        {chats.map((c) => {
          const partnerName = role === "seller" ? c.farmer_name : c.fpc_name;
          
          // FIX: Use strict validation to filter out malformed chat items
          if (!String(c.farmer_id || "").trim() || !String(c.fpc_id || "").trim()) return null;

          return (
            <div
              key={c.id}
              className={`chat-list-item ${active && active.c.id === c.id ? 'active' : ''}`}
              onClick={() => handleSetActive(c)}
            >
              <div className="chat-list-title">{partnerName}</div>
              <div className="chat-list-sub">{c.crop} • {c.region}</div>

              <button className="chat-delete-btn" onClick={(e) => { e.stopPropagation(); del(c.id); }}>
                Delete
              </button>
            </div>
          );
        })}
      </div>

      <div className="chat-active-window">
        {active ? (
          <BuyerSellerChat
            user={uniqueID}
            partner={active.partnerId}
            room={active.room}
          />
        ) : (
          <div className="select-chat-hint">Select chat</div>
        )}
      </div>
    </div>
  );
}