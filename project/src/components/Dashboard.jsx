import React from "react";
import "../style/Dashboard.css";
import { FaLocationDot } from "react-icons/fa6";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";

const BASE_URL = "http://192.168.1.5:5000";

export default function Dashboard() {
  const userID = localStorage.getItem("uniqueID");

  const [district, setDistrict] = React.useState("");
  const [state, setState] = React.useState("");
  const [error, setError] = React.useState("");

  const [farmInput, setFarmInput] = React.useState("");
  const [farmDate, setFarmDate] = React.useState("");
  const [farmList, setFarmList] = React.useState([]);

  const [schemes, setSchemes] = React.useState([]);
  const [forecast, setForecast] = React.useState([]);
  const [weatherNow, setWeatherNow] = React.useState(null);
  const [weatherAlert, setWeatherAlert] = React.useState(null);

  const fetchWeatherForecast = async (lat, lon) => {
    try {
      const res = await fetch(`${BASE_URL}/api/weather/forecast?lat=${lat}&lon=${lon}`);
      const data = await res.json();

      if (res.ok && data.forecast) {
        const to12Hour = (timeStr) => {
          let [hour, minute] = timeStr.split(":");
          hour = parseInt(hour, 10);
          const suffix = hour >= 12 ? "PM" : "AM";
          hour = hour % 12 || 12;
          return `${hour}:${minute} ${suffix}`;
        };

        const formatted = data.forecast.map((item) => {
          const time24 = item.dt_txt.split(" ")[1].slice(0, 5);
          return {
            time: to12Hour(time24),
            temp: item.main.temp,
            humidity: item.main.humidity,
            rain: item.rain?.["3h"] || 0,
          };
        });

        setForecast(formatted);
      }
    } catch (err) {
      console.log("Forecast error:", err);
    }
  };

  const fetchCurrentWeather = async (lat, lon) => {
    try {
      const res = await fetch(`${BASE_URL}/api/weather/current?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (res.ok) {
        setWeatherNow(data);
      }
    } catch (err) {
      console.log("Current weather error:", err);
    }
  };

  const fetchWeatherAlerts = async (lat, lon) => {
    try {
      const res = await fetch(`${BASE_URL}/api/weather/forecast?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (res.ok) {
        const alerts = data.alerts || null;
        setWeatherAlert(alerts ? alerts[0] : null);
      }
    } catch (err) {
      console.log("Weather alert error:", err);
    }
  };

  const fetchCrops = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/crops/get?userID=${userID}`);
      const data = await res.json();
      if (res.ok) setFarmList(data);
    } catch (err) {
      console.log("Fetch crops error:", err);
    }
  };

  const fetchSchemeForCrop = async (cropText, cropDate = null, shownList = []) => {
    if (!state) return null;

    try {
      const payload = { crop: cropText, state, shown_schemes: shownList };

      const res = await fetch(`${BASE_URL}/api/scheme/bycrop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.recommended_scheme) {
        return {
          ...data.recommended_scheme,
          crop: cropText,
          cropDate: cropDate || new Date().toISOString(),
        };
      } else {
        return null;
      }
    } catch (err) {
      console.log("Scheme fetch error:", err);
      return null;
    }
  };

  const fetchInitialSchemes = async () => {
    if (!state || farmList.length === 0) return;

    const localShown = [];
    const loadedSchemes = [];

    for (const item of farmList) {
      if (item && item.text) {
        const sch = await fetchSchemeForCrop(item.text, item.date, localShown);
        if (sch) {
          loadedSchemes.push(sch);
          localShown.push(sch.scheme_name);
        }
      }
    }

    setSchemes(loadedSchemes);
  };

  const addFarmDetail = async () => {
    if (!farmInput.trim() || !farmDate.trim()) return;

    const payload = { userID, text: farmInput, date: farmDate };

    try {
      const res = await fetch(`${BASE_URL}/api/crops/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFarmList((prev) => [...prev, payload]);
        setFarmInput("");
        setFarmDate("");

        const shownNow = schemes.map((s) => s.scheme_name);
        const sch = await fetchSchemeForCrop(payload.text, payload.date, shownNow);
        if (sch) setSchemes((prev) => [sch, ...prev]);
      }
    } catch (err) {
      console.log("Save error:", err);
    }
  };

  React.useEffect(() => {
    fetchCrops();
    getLocation();
  }, []);

  React.useEffect(() => {
    if (state && farmList.length > 0 && schemes.length === 0) {
      fetchInitialSchemes();
    }
  }, [state, farmList]);

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

          fetchWeatherAlerts(latitude, longitude);
          fetchWeatherForecast(latitude, longitude);
          fetchCurrentWeather(latitude, longitude);
        } catch {
          setError("Cannot fetch location data");
        }
      },
      () => setError("Location permission denied")
    );
  };

  const getTimeLeftLabel = (targetDate) => {
    const end = new Date(targetDate).getTime();
    const now = Date.now();
    const diff = end - now;

    if (diff <= 0) return "Completed";

    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    const months = Math.ceil(days / 30);
    const years = Math.floor(months / 12);

    if (years >= 1) return `${years} year${years > 1 ? "s" : ""} left`;
    if (months > 1) return `${months} months left`;
    return `${days} days left`;
  };

  const getProgressPercent = (targetDate) => {
    const now = Date.now();
    const end = new Date(targetDate).getTime();
    const diff = end - now;

    if (diff <= 0) return 100;

    const days = diff / (1000 * 60 * 60 * 24);

    let totalCycleDays = 30;
    if (days > 365) totalCycleDays = 365 * 2;
    else if (days > 30) totalCycleDays = 365;

    const progress = 1 - days / totalCycleDays;
    return Math.min(Math.max(progress * 100, 0), 100);
  };

  const sortedFarmList = [...farmList].sort((a, b) => new Date(b.date) - new Date(a.date));

  const ForecastChart = ({ data }) => (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(113, 113, 113, 0.77)" />
        <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="rgba(255, 255, 255, 0.77)" />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="rgba(255, 255, 255, 0.77)" />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="rgba(255, 255, 255, 0.77)" />
        <Tooltip />
        <Line yAxisId="left" type="monotone" dataKey="temp" stroke="#ff5722" strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="rain" stroke="#2196f3" strokeWidth={2} dot={false} />
        <Line yAxisId="left" type="monotone" dataKey="humidity" stroke="#4caf50" strokeWidth={2} dot={false} />
        <Legend verticalAlign="bottom" height={30} />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard">
        <div className="grid-container">

          {/* USER */}
          <div className="dashcard name-location">
            <h1>Hello, {userID}</h1>
            <div className="loc-row">
              <FaLocationDot />
              <p>{district && state ? `${district}, ${state}` : "Fetching..."}</p>
            </div>

            {weatherNow && (
              <div className="current-weather">
                <div className="cw-row">
                  <img
                    src={`https://openweathermap.org/img/wn/${weatherNow.icon}@2x.png`}
                    alt="icon"
                    className="cw-icon"
                  />
                  <span className="cw-temp">{Math.round(weatherNow.temp)}°C</span>
                </div>
                <p className="cw-extra">
                  💧 {weatherNow.humidity}% &nbsp;|&nbsp; 🌧 {weatherNow.rain} mm
                </p>
              </div>
            )}
            {error && <p style={{ color: "red" }}>{error}</p>}
          </div>

          {/* WEATHER */}
          <div className="dashcard weather">
            <h3>Weather Alerts</h3>
            <div className="weather-grid">
              <div className="weather-left">
                {weatherNow ? (
                  <>
                    <img
                      src={`https://openweathermap.org/img/wn/${weatherNow.icon}@2x.png`}
                      alt="icon"
                      className="weather-icon-large"
                    />
                    <p className="weather-cond-text">
                      {weatherNow.condition.replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                  </>
                ) : (
                  <p>Loading...</p>
                )}
              </div>

              <div className="weather-right">
                {weatherAlert ? (
                  <>
                    <p className="alert-title">⚠ {weatherAlert.event}</p>
                    <p className="alert-desc">{weatherAlert.description.slice(0, 80)}...</p>
                  </>
                ) : (
                  <p className="no-alerts">No weather alerts right now 🌤</p>
                )}
              </div>
            </div>
          </div>

          {/* CROPS */}
          <div className="dashcard name-location-2">
            <div className="farm-wrapper">
              <h3>
                Manage your <strong>Crops</strong>
              </h3>
              <div className="farm-input-row">
                <input
                  type="text"
                  className="farm-input"
                  value={farmInput}
                  onChange={(e) => setFarmInput(e.target.value)}
                  placeholder="Enter crop name"
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
                    <span style={{ fontWeight: "bold", fontSize: "16px" }}>{item.text}</span>
                    <span style={{ marginLeft: "10px", color: "#444" }}>
                      {getTimeLeftLabel(item.date)}
                    </span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${getProgressPercent(item.date)}%` }}
                      ></div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* SCHEMES */}
          <div className="dashcard schemes">
            <h3>Govt. Schemes</h3>
            {schemes.length === 0 ? (
              <p>Loading recommendations...</p>
            ) : (
              <ul className="scheme-list">
                {schemes.map((sch, i) => (
                  <li key={i} className="scheme-item">
                    <a
                      href={sch.scheme_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <h4>{sch.scheme_name}</h4>
                      <p className="scheme-dept">{sch.state_ministry}</p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* FORECAST */}
          <div className="dashcard forecast">
            <h3>Forecast</h3>
            {forecast.length === 0 ? (
              <p>Loading forecast...</p>
            ) : (
              <ForecastChart data={forecast} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
