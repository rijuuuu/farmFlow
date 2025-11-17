import React, { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import ChatIcon from "./ChatIcon";
import ChatSidebar from "./ChatSidebar";
import API, { recommend, createRequest, listRequests } from "../api"; 
import "../style/Farmers.css";

export default function Farmer() {
  const [crop, setCrop] = useState("");
  const [region, setRegion] = useState("");
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acceptedDeals, setAcceptedDeals] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeChat, setActiveChat] = useState(null); 

  const farmer_id = localStorage.getItem("uniqueID");
  const farmer_name = localStorage.getItem("username");

  const handleSearch = async () => {
    if (!crop || !region) return toast.error("Enter crop & region");
    setLoading(true);
    try {
      const data = await recommend({ crop, region });
      setSellers(Array.isArray(data) ? data : []);
    } catch (e) {
      setSellers([]);
    }
    setLoading(false);
  };

  const sendReq = async (s) => {
    const price = prompt("Enter your price");
    if (!price || isNaN(price)) return toast.error("Invalid price");
    try {
      const payload = {
        farmer_id,
        farmer_name,
        crop: s.crop,
        region: s.region,
        price,
        fpc_name: (s.fpc_name || s.FPC_Name || "").toString().toLowerCase(),
        fpc_id: s.fpc_id || ""
      };
      const j = await createRequest(payload);
      if (j && j.ok) toast.success("Request sent");
      else toast.error("Request failed");
    } catch (e) {
      toast.error("Request failed");
    }
  };

  const loadAccepted = async () => {
    try {
      const data = await listRequests({ farmer_id });
      setAcceptedDeals(Array.isArray(data) ? data.filter((r) => r.status === "accepted") : []);
    } catch {
      setAcceptedDeals([]);
    }
  };

  useEffect(() => {
    loadAccepted();
    const iv = setInterval(loadAccepted, 3000);
    return () => clearInterval(iv);
  }, []);

  const deleteReq = async (rid) => {
    if (!window.confirm("Delete permanently?")) return;
    try {
      await fetch(`${API}/api/request/delete/${rid}`, { method: "POST" });
      await loadAccepted();
    } catch {}
  };
  
  const handleOpenChat = (deal) => {
    // FIX: Use String() and trim() for stricter validation against null/undefined/empty strings
    const fpc_id = String(deal.fpc_id || "").trim();
    
    if (!fpc_id) {
        toast.error("Seller ID is missing for this deal. Cannot open chat.");
        return; 
    }

    const partnerId = fpc_id;
    
    const farmerIdStr = String(farmer_id).toLowerCase();
    const fpcIdStr = String(fpc_id).toLowerCase();

    const room =
        farmerIdStr < fpcIdStr
          ? `${farmerIdStr}_${fpcIdStr}`
          : `${fpcIdStr}_${farmerIdStr}`;
    
    setActiveChat({ c: deal, partnerId, room });
    setSidebarOpen(true);
  };

  const handleOpenSidebarIcon = () => {
    setActiveChat(null); 
    setSidebarOpen(true);
  }
  
  const handleCloseSidebar = () => {
    setSidebarOpen(false);
    setActiveChat(null); 
  }

  return (
    <div className="farmer-panel">
      <Toaster />
      <h2>Farmer Marketplace</h2>

      <div className="search-box">
        <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Crop" />
        <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region" />
        <button onClick={handleSearch}>Search</button>
      </div>

      {loading && <p>Loading...</p>}

      <div className="seller-list">
        {sellers.map((s, i) => (
          <div key={i} className="seller-card">
            <div className="card-logo">{(s.FPC_Name || s.fpc_name || "F").charAt(0)}</div>
            <h3>{s.FPC_Name || s.fpc_name}</h3>
            <p>{s.District}</p>
            <p className="commodities">{s.Commodities}</p>
            <button onClick={() => sendReq(s)}>Send Request</button>
          </div>
        ))}
      </div>

      <h2>Active Chats</h2>

      {acceptedDeals.map((d) => (
        <div key={d.id} style={{ marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, color: "#155c34" }}>{d.fpc_name}</div>
            <div style={{ fontSize: 13 }}>{d.crop} • {d.region}</div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleOpenChat(d)} style={{ background: "#46b96b", padding: "8px 10px", color: "white", borderRadius: 8, border: "none" }}>
              Open Chat
            </button>

            <button onClick={() => deleteReq(d.id)} style={{ background: "#ffe8e8", padding: "8px 10px", color: "#b72833", borderRadius: 8, border: "1px solid #ffbdbd" }}>
              Delete
            </button>
          </div>
        </div>
      ))}

      <ChatIcon onClick={handleOpenSidebarIcon} />
      <ChatSidebar 
        open={sidebarOpen} 
        onClose={handleCloseSidebar} 
        userID={farmer_id}
        initialActiveChat={activeChat} 
      />
    </div>
  );
}