import React from "react";
import "../style/Dashboard.css";
import { FaLocationDot } from "react-icons/fa6";

export default function Dashboard() {
  const userID = localStorage.getItem("uniqueID");

  const [district, setDistrict] = React.useState("");
  const [state, setState] = React.useState("");
  const [error, setError] = React.useState("");

  const [farmInput, setFarmInput] = React.useState("");
  const [farmDate, setFarmDate] = React.useState("");
  const [farmList, setFarmList] = React.useState([]);

  React.useEffect(() => {
    const timer = setInterval(() => setFarmList((p) => [...p]), 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    fetchCrops();
    getLocation();
  }, []);

  const fetchCrops = async () => {
    try {
      const res = await fetch(
        `http://192.168.0.104:5000/api/crops/get?userID=${userID}`
      );
      const data = await res.json();
      if (res.ok) setFarmList(data);
    } catch (err) {
      console.log("Fetch error:", err);
    }
  };

  const addFarmDetail = async () => {
    if (!farmInput.trim() || !farmDate.trim()) return;

    const payload = { userID, text: farmInput, date: farmDate };

    try {
      const res = await fetch("http://192.168.0.104:5000/api/crops/add", {
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
        } catch {
          setError("Cannot fetch location data");
        }
      },
      () => setError("Location permission denied")
    );
  };

  const getCountdown = (targetDate) => {
    const end = new Date(targetDate).getTime();
    const now = Date.now();
    const diff = end - now;

    if (diff <= 0) return "Completed";

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);

    return `${d}d ${h}h ${m}m ${s}s`;
  };

  const sortedFarmList = [...farmList].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  return (
    <div className="dashboard">
      <div className="grid-container">

        {/* USER dashcard */}
        <div className="dashcard name-location">
          <h1>Hello, {userID}</h1>
          <div className="loc-row">
            <FaLocationDot />
            <p>{district && state ? `${district}, ${state}` : "Fetching..."}</p>
          </div>
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>

        {/* WEATHER */}
        <div className="dashcard weather">
          <h3>Weather</h3>
          <p>Coming soon...</p>
        </div>

        {/* FARM DETAILS */}
        <div className="dashcard name-location-2">
          <div className="farm-wrapper">
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
                className="farm-input date-input"
                value={farmDate}
                onChange={(e) => setFarmDate(e.target.value)}
              />

              <button className="farm-btn" onClick={addFarmDetail}>
                Add
              </button>
            </div>

            <ul className="farm-list">
              {sortedFarmList.map((item, i) => (
                <li key={i} className="farm-item">
                  <span className="farm-countdown">
                    {getCountdown(item.date)}
                  </span>
                  <span className="farm-text"> — {item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* GOV SCHEMES */}
        <div className="dashcard schemes">
          <h3>Gov Schemes</h3>
          <p>Latest agriculture schemes will appear here.</p>
        </div>

        {/* FORECAST */}
        <div className="dashcard forecast">
          <h3>Forecast</h3>
          <p>Coming soon...</p>
        </div>

      </div>
    </div>
  );
}
