// Seller.jsx  (Seller Portal)

import { useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  listNotifications,
  listRequests,
  acceptRequest,
  rejectRequest
} from "../api";
import BuyerSellerChat from "./BuyerSellerChat"; // FIX: Import the BuyerSellerChat component
import "../style/Seller.css";

export default function Seller() {
  const [seller, setSeller] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [done, setDone] = useState([]);

  // FIX: Ensure load function uses the input seller ID for fetching
  const load = async () => {
    if (!seller) return;

    // NOTE: Relying on server to handle case-insensitivity/cleaning for API calls
    setNotifs(await listNotifications({ seller })); 

    const all = await listRequests({ seller_id: seller });
    setReqs(all.filter(r => r.status === "pending"));
    setDone(all.filter(r => r.status !== "pending"));
  };

  // FIX: Ensure accept is correctly defined here
  const accept = async (id, farmer) => {
    await acceptRequest(id);
    toast.success(`Accepted ${farmer}`);
    load();
  };

  // FIX: Ensure reject is correctly defined here
  const reject = async (id, farmer) => {
    await rejectRequest(id);
    toast(`Rejected ${farmer}`);
    load();
  };

  return (
    <div className="seller-wrapper">
      <Toaster />

      {/* Header */}
      <div className="seller-header">
        <h1>AgriConnect</h1>
        <div className="sub">Seller Portal</div>
      </div>

      {/* Seller Login */}
      <section className="seller-login">
        <h2 className="section-title">🏪 Seller Portal</h2>

        <div className="input-group">
          <label>Enter your FPC Name</label>
          <input
            placeholder="e.g., Alipurduar FPC"
            value={seller}
            onChange={e => setSeller(e.target.value)}
          />

          <button onClick={load} className="load-btn">Load</button>
        </div>
      </section>

      {/* Notifications */}
      <section className="glass-box">
        <h3>🔔 Notifications</h3>
        {notifs.length === 0 ? (
          <div className="empty-msg">No new notifications.</div>
        ) : (
          <ul className="notif-list">
            {notifs.map((n, i) => <li key={i}>🔔 {n.msg}</li>)}
          </ul>
        )}
      </section>

      {/* Pending Requests */}
      <section className="glass-box">
        <h3>📩 Pending Requests</h3>

        <div className="card-list">
          {reqs.map(r => (
            <div key={r.id} className="card">
              <div className="card-title">{r.farmer_name}</div>
              <div className="card-district">{r.region}</div>
              <div className="card-commodities">{r.crop} — ₹{r.price}</div>

              <button
                onClick={() => accept(r.id, r.farmer_name)} // References the local accept function
                className="connect-btn"
              >
                ✅ Accept
              </button>

              <button
                onClick={() => reject(r.id, r.farmer_name)} // References the local reject function
                className="reject-btn"
              >
                ❌ Reject
              </button>
            </div>
          ))}
        </div>

        {reqs.length === 0 && <div className="empty-msg">No pending requests.</div>}
      </section>

      {/* Responded */}
      <section className="glass-box">
        <h3>📘 Responded Requests</h3>

        {done.length === 0 ? (
          <div className="empty-msg">No responded requests yet.</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Time</th><th>Farmer</th><th>Crop</th><th>Price</th><th>Status</th></tr>
              </thead>
              <tbody>
                {done.map(r => (
                  <tr key={r.id}>
                    <td>{r.timestamp}</td>
                    <td>{r.farmer_name}</td>
                    <td>{r.crop}</td>
                    <td>{r.price}</td>
                    <td className={r.status}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Chat */}
      <section className="glass-box">
        <h3>💬 Chat</h3>
        {done.filter(r => r.status === "accepted").map(r => (
          <BuyerSellerChat 
            key={r.id} 
            user={r.seller_id} // FIX: Use canonical seller ID for consistent chat room generation
            partner={r.farmer_name} 
          />
        ))}
      </section>
    </div>
  );
}