import React, { useState, useEffect } from "react";
import "../style/Dashboard.css";
import { FaLocationDot } from "react-icons/fa6";
import { WiHumidity, WiStrongWind, WiThermometer } from "react-icons/wi";

export default function Dashboard() {
  const userID = localStorage.getItem("uniqueID");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [location, setLocation] = useState(null);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const WEATHER_API_KEY = "385f3a70954dc475b842c86c76933dd0";

  const [farmInput, setFarmInput] = useState("");
  const [farmList, setFarmList] = useState([]);

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({ latitude, longitude });
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            );
            const data = await response.json();
            const districtName =
              data.address.city_district ||
              data.address.suburb ||
              data.address.county ||
              data.address.state_district ||
              data.address.city ||
              "District not found";
            const stateName = data.address.state || "State not found";
            setDistrict(districtName);
            setState(stateName);
            getWeather(latitude, longitude);
          } catch (err) {
            setError("Unable to fetch district/state details");
          }
        },
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setError("User denied the request for Geolocation.");
              break;
            case error.POSITION_UNAVAILABLE:
              setError("Location information is unavailable.");
              break;
            case error.TIMEOUT:
              setError("The request to get user location timed out.");
              break;
            default:
              setError("An unknown error occurred.");
          }
        }
      );
    } else {
      setError("Geolocation is not supported by this browser.");
    }
  };

  const getWeather = async (lat, lon) => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_API_KEY}`
      );
      const data = await response.json();
      if (response.ok) {
        setWeather(data);
      } else {
        setError(data.message || "Unable to fetch weather data");
      }
    } catch (err) {
      setError("Failed to fetch weather details");
    } finally {
      setLoading(false);
    }
  };

  const addFarmDetail = () => {
    if (farmInput.trim() === "") return;
    setFarmList([...farmList, farmInput]);
    setFarmInput("");
  };

  return (
    <div className="dashboard">
      <div className="grid-container">

        <div className="card name-location">
          <h1>Hello, {userID || "User"}</h1>
          <div className="loc-row">
            <FaLocationDot className="loc-icon" />
            <p>
              {district && state ? `${district}, ${state}` : "Fetching location..."}
            </p>
          </div>
          {error && <p className="error">{error}</p>}
        </div>

        {/* FARM DETAILS FIXED */}
        <div className="card name-location-2">
          <h3>Farm Details</h3>

          <div className="farm-input-row">
            <input
              type="text"
              value={farmInput}
              onChange={(e) => setFarmInput(e.target.value)}
              className="farm-input"
              placeholder="Enter farm detail"
            />

            <button className="farm-btn" onClick={addFarmDetail}>
              Submit
            </button>
          </div>

          <ul className="farm-list">
            {farmList.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="card schemes">
          <h3>Gov Schemes</h3>
          <p>Latest agriculture schemes and subsidies will appear here.</p>
        </div>

        <div className="card weather">
          <h3>Current Weather</h3>
          {loading && <p>Fetching weather...</p>}
          {weather && !loading && (
            <div className="weather-details">
              <p>{weather.weather[0].description.toUpperCase()}</p>
              <div className="stats">
                <div className="stat">
                  <WiThermometer size={28} />
                  <p>{Math.round(weather.main.temp)}°C</p>
                </div>
                <div className="stat">
                  <WiHumidity size={28} />
                  <p>{weather.main.humidity}%</p>
                </div>
                <div className="stat">
                  <WiStrongWind size={28} />
                  <p>{weather.wind.speed} m/s</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card forecast">
          <h3>5-Day Weather Forecast</h3>
          <p>Coming soon...</p>
        </div>
      </div>
    </div>
  );
}
