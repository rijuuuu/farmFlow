import { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import "../style/Buyer.css";
import {
  recommend,
  createRequest,
  listRequests,
  listNotifications,
  acceptRequest,
  rejectRequest,
} from "../api";
import ChatBox from "./ChatBox";

function Farmer() {
  const [farmerId, setFarmerId] = useState("F001");
  const [farmerName, setFarmerName] = useState("Ravi Kumar");
  const [crop, setCrop] = useState("Vegetables");
  const [region, setRegion] = useState("Alipurduar");
  const [price, setPrice] = useState(2000);
  const [recs, setRecs] = useState([]);
  const [reqs, setReqs] = useState([]);

  const search = async () => {
    try {
      const data = await recommend({ crop, region });
      console.log("Recommended sellers:", data);
      setRecs(data);
      toast.success(`Found ${data.length} sellers`);
    } catch (error) {
      console.error("Error fetching sellers:", error);
      toast.error("Failed to fetch sellers. Check server connection.");
    }
  };

  const connect = async (seller) => {
    await createRequest({
      farmer_id: farmerId,
      farmer_name: farmerName,
      crop,
      region,
      price,
      seller_id: seller,
    });
    toast.success(`Request sent to ${seller}`);
    loadReqs();
  };

  const loadReqs = async () => {
    const data = await listRequests({ farmer_id: farmerId });
    setReqs(data);
  };

  useEffect(() => {
    loadReqs();
  }, [farmerId]);

  return (
    <div className="panel">
      <h2>👨‍🌾 Farmer Portal</h2>

      {/* 🔍 Search Form */}
      <div className="form-grid">
        <input
          placeholder="Farmer ID"
          value={farmerId}
          onChange={(e) => setFarmerId(e.target.value)}
        />
        <input
          placeholder="Farmer Name"
          value={farmerName}
          onChange={(e) => setFarmerName(e.target.value)}
        />
        <input
          placeholder="Crop"
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
        />
        <input
          placeholder="Region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price (₹)"
        />
        <button onClick={search} className="primary-btn">
          🔍 Search Sellers
        </button>
      </div>

      {/* 🧾 Recommendations */}
      <h3>Recommended Sellers</h3>
      <div className="card-list">
        {recs.map((r, i) => (
          <div key={i} className="card">
            <div className="card-left">
              <strong>{r.FPC_Name}</strong>
              <small>{r.District}</small>
              <span className="tag">{r.Commodities}</span>
              <div className="score">{r.match_score}% match</div>
            </div>
            <div className="card-right">
              <button
                onClick={() => connect(r.FPC_Name)}
                className="connect-btn"
              >
                🤝 Connect
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 📋 Requests */}
      <h3>Your Requests</h3>
      <div className="table-container">
        {reqs.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Seller</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id}>
                  <td>{r.timestamp}</td>
                  <td>{r.seller_id}</td>
                  <td className={r.status}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 💬 Chat */}
      <h3>Chat</h3>
      {reqs
        .filter((r) => r.status === "accepted")
        .map((r) => (
          <ChatBox key={r.id} user={farmerName} partner={r.seller_id} />
        ))}
    </div>
  );
}

function Seller() {
  const [seller, setSeller] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [done, setDone] = useState([]);

  const load = async () => {
    if (!seller) return;
    setNotifs(await listNotifications({ seller }));
    const all = await listRequests({ seller_id: seller });
    setReqs(all.filter((r) => r.status === "pending"));
    setDone(all.filter((r) => r.status !== "pending"));
  };

  const accept = async (id, farmer) => {
    await acceptRequest(id);
    toast.success(`Accepted ${farmer}`);
    load();
  };

  const reject = async (id, farmer) => {
    await rejectRequest(id);
    toast(`Rejected ${farmer}`);
    load();
  };

  return (
    <div className="panel">
      <h2>🏪 Seller Portal</h2>

      <div className="form-grid">
        <input
          placeholder="Enter your FPC name"
          value={seller}
          onChange={(e) => setSeller(e.target.value)}
        />
        <button onClick={load} className="primary-btn">
          Load
        </button>
      </div>

      {/* 🔔 Notifications */}
      <h3>Notifications</h3>
      {notifs.length === 0 ? (
        <p>No new notifications.</p>
      ) : (
        <ul className="notif-list">
          {notifs.map((n, i) => (
            <li key={i}>🔔 {n.msg}</li>
          ))}
        </ul>
      )}

      {/* 🕒 Pending Requests */}
      <h3>Pending Requests</h3>
      <div className="card-list">
        {reqs.map((r) => (
          <div key={r.id} className="card">
            <div className="card-left">
              <strong>{r.farmer_name}</strong>
              <span>({r.crop}) ₹{r.price}</span>
              <small>{r.region}</small>
            </div>
            <div className="card-right">
              <button
                onClick={() => accept(r.id, r.farmer_name)}
                className="accept-btn"
              >
                ✅
              </button>
              <button
                onClick={() => reject(r.id, r.farmer_name)}
                className="reject-btn"
              >
                ❌
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ✅ Responded Requests */}
      <h3>Responded Requests</h3>
      <div className="table-container">
        {done.length === 0 ? (
          <p>No responded requests yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Farmer</th>
                <th>Crop</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {done.map((r) => (
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
        )}
      </div>

      {/* 💬 Chat */}
      <h3>Chat</h3>
      {done
        .filter((r) => r.status === "accepted")
        .map((r) => (
          <ChatBox key={r.id} user={seller} partner={r.farmer_name} />
        ))}
    </div>
  );
}

export default function Buyer() {
  const [mode, setMode] = useState("farmer");

  return (
    <div className="app-container">
      <Toaster />
      <header>
        <h1>🌾 Agri Connect</h1>
        <div className="tab-switch">
          <button
            className={mode === "farmer" ? "active" : ""}
            onClick={() => setMode("farmer")}
          >
            Farmer
          </button>
          <button
            className={mode === "seller" ? "active" : ""}
            onClick={() => setMode("seller")}
          >
            Seller
          </button>
        </div>
      </header>

      {mode === "farmer" ? <Farmer /> : <Seller />}

      <footer>© 2025 Agri Connect Portal</footer>
    </div>
  );
}
