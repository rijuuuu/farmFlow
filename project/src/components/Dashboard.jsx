import React, { useState, useEffect } from "react";
import "../style/Dashboard.css";
import { FaLocationDot } from "react-icons/fa6";

export default function Dashboard() {
  const userID = localStorage.getItem("uniqueID");

  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");

  const [farmInput, setFarmInput] = useState("");
  const [farmDate, setFarmDate] = useState("");
  const [farmList, setFarmList] = useState([]);

  // Re-run countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      setFarmList((prev) => [...prev]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchCrops();
    getLocation();
  }, []);

  const fetchCrops = async () => {
    try {
      const res = await fetch(
        `http://127.0.0.1:5000/api/crops/get?userID=${userID}`
      );
      const data = await res.json();
      if (res.ok) setFarmList(data);
    } catch (err) {
      console.log("Fetch error:", err);
    }
  };

  const addFarmDetail = async () => {
    if (!farmInput.trim() || !farmDate.trim()) return;

    const payload = {
      userID: userID,
      text: farmInput,
      date: farmDate,
    };

    try {
      const res = await fetch("http://127.0.0.1:5000/api/crops/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFarmList((prev) => [...prev, payload]);
        setFarmInput("");
        setFarmDate("");
      }
    } catch (err) {
      console.log("Save error:", err);
    }
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await res.json();

          setDistrict(
            data.address.city_district ||
              data.address.suburb ||
              data.address.county ||
              data.address.state_district ||
              data.address.city
          );

          setState(data.address.state);
        } catch (err) {
          setError("Cannot fetch location data");
        }
      },
      () => setError("Location permission denied")
    );
  };

  // 🎯 COUNTDOWN FUNCTION
  const getCountdown = (targetDate) => {
    const end = new Date(targetDate).getTime();
    const now = Date.now();
    const diff = end - now;

    if (diff <= 0) return "⏳ Completed";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  return (
    <div className="dashboard">
      <div className="grid-container">
        <div className="card name-location">
          <h1>Hello, {userID}</h1>
          <div className="loc-row">
            <FaLocationDot className="loc-icon" />
            <p>
              {district && state
                ? `${district}, ${state}`
                : "Fetching location..."}
            </p>
          </div>
          {error && <p className="error">{error}</p>}
        </div>

        {/* Farm Details */}
        <div className="card name-location-2">
          <div className="farm-input-row">
            <input
              type="text"
              className="farm-input"
              value={farmInput}
              onChange={(e) => setFarmInput(e.target.value)}
              placeholder="Enter farm detail"
            />

            <input
              type="date"
              className="farm-input"
              value={farmDate}
              onChange={(e) => setFarmDate(e.target.value)}
            />

            <button className="farm-btn" onClick={addFarmDetail}>
              Add
            </button>
          </div>

          <ul className="farm-list">
            {farmList.map((item, index) => (
              <li key={index}>
                <b>{item.text}</b>  - {getCountdown(item.date)}
              </li>
            ))}
          </ul>
        </div>

        <div className="card schemes">
          <h3>Gov Schemes</h3>
          <p>Latest agriculture schemes will appear here.</p>
        </div>

        <div className="card weather">
          <h3>Weather</h3>
          <p>Coming soon...</p>
        </div>

        <div className="card forecast">
          <h3>Forecast</h3>
          <p>Coming soon...</p>
        </div>
      </div>
    </div>
  );
}
