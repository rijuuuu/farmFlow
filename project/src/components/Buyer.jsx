// Buyer.jsx (Farmer Portal)

import { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import { recommend, createRequest, listRequests } from "../api";
import "../style/Buyer.css";
import BuyerSellerChat from "./BuyerSellerChat";
import ChatBox from "./Chatbot"; // FIX 1: Import the ChatBox component

export default function Buyer() {
  const userID = localStorage.getItem("uniqueID");
  const [farmerId, setFarmerId] = useState("F001");
  const [farmerName, setFarmerName] = useState(userID);

  // search fields
  const [crop, setCrop] = useState("");
  const [region, setRegion] = useState("");
  const [price, setPrice] = useState(2000);

  // data lists
  const [recs, setRecs] = useState([]);
  const [reqs, setReqs] = useState([]);

  // ---------------------------------------------------
  // SEARCH SELLERS
  // ---------------------------------------------------
  const search = async () => {
    try {
      const data = await recommend({ crop, region });
      setRecs(data);
      toast.success(`Found ${data.length} sellers`);
    } catch (err) {
      toast.error("Failed to fetch sellers");
    }
  };

  // ---------------------------------------------------
  // SEND REQUEST
  // ---------------------------------------------------
  const connect = async (seller) => {
    try {
      await createRequest({
        farmer_id: farmerId,
        farmer_name: farmerName,
        crop,
        region,
        price,
        seller_id: seller.seller_id, // IMPORTANT FIX
      });

      toast.success(`Request sent to ${seller.FPC_Name}`);
      loadReqs();
    } catch (err) {
      toast.error("Error sending request");
    }
  };

  // ---------------------------------------------------
  // LOAD EXISTING REQUESTS
  // ---------------------------------------------------
  const loadReqs = async () => {
    try {
      const data = await listRequests({ farmer_id: farmerId });
      setReqs(data);
    } catch {
      toast.error("Failed to load requests");
    }
  };

  useEffect(() => {
    loadReqs();
  }, [farmerId]);

  return (
    <div className="panel">
      <Toaster />
      <ChatBox /> {/* FIX 2: Render the ChatBox component */}
      <h2>Farmer Portal</h2>
      {/* Inputs */}
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
          placeholder="Price (竄ｹ)"
        />

        <button onClick={search} className="primary-btn">
          Search Sellers
        </button>
      </div>
      {/* Recommended Sellers */}
      <h3>Recommended Sellers</h3>
      <div className="card-list">
        {recs.length === 0 && <p>No sellers found.</p>}

        {recs.map((r, i) => (
          <div key={i} className="card">
            <div className="card-logo">{(r.FPC_Name || "S")[0]}</div>

            <div className="card-title">{r.FPC_Name}</div>
            <div className="card-district">{r.District}</div>
            <div className="card-commodities">{r.Commodities}</div>

            <button onClick={() => connect(r)} className="connect-btn">
              ､Connect
            </button>
          </div>
        ))}
      </div>
      {/* Requests */}
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
      {/* Chat section */}
      <h3>💬 Chat</h3>
      {reqs
        .filter((r) => r.status === "accepted")
        .map((r) => (
          <BuyerSellerChat
            key={r.id}
            user={farmerName} // The farmer is the user for the chat
            partner={r.seller_id} // The seller is the partner
          />
        ))}
    </div>
  );
}
