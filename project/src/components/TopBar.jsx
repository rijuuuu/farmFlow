import "../style/TopBar.css";
import icon from "../icon/logo.png";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { FaBell, FaChevronDown, FaChevronUp, FaBars, FaTimes } from "react-icons/fa";

function TopBar() {
  const navigate = useNavigate();
  const userID = localStorage.getItem("uniqueID");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [weatherAlerts, setWeatherAlerts] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  const goToLogin = () => navigate("/login");
  const handleLogout = () => {
    localStorage.removeItem("uniqueID");
    window.location.reload();
  };
  const goToHome = () => navigate("/home");
  const goToMarket = () => navigate("/market");

  const handleNavigation = (path) => {
    navigate(`/${path}`);
    setMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const toggleNotifications = () => {
    setShowNotification(!showNotification);
  };

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowNotification(false);
        setMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (showNotification) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const apiKey = "YOUR_OPENWEATHER_API_KEY";
        try {
          const response = await fetch(
            `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=current,minutely,hourly,daily&appid=${apiKey}`
          );
          const data = await response.json();
          if (data.alerts && data.alerts.length > 0) {
            setWeatherAlerts(data.alerts);
          } else {
            setWeatherAlerts([{ event: "No active weather alerts at your location." }]);
          }
        } catch (error) {
          setWeatherAlerts([{ event: "Failed to fetch weather alerts." }]);
        }
      });
    }
  }, [showNotification]);

  return (
    <div className="topbar">
      {/* LEFT: Logo */}
      <div className="name" onClick={goToHome}>
        <img src={icon} alt="icon" />
      </div>

      {/* CENTER: Market + More Options (desktop only) */}
      <div className="center-section">
        <p className="marketLink" onClick={goToMarket}>
          Market
        </p>

        <div className="menu-container" ref={dropdownRef}>
          <button className="menu-button" onClick={toggleMenu}>
            More Options{" "}
            <span className="menu-icon">
              {menuOpen ? <FaChevronUp size={14} /> : <FaChevronDown size={14} />}
            </span>
          </button>

          {menuOpen && (
            <div className="menu-dropdown">
              <p onClick={() => handleNavigation("crop_recommendation")}>
                Crop Recommendation
              </p>
              <p onClick={() => handleNavigation("disease_detection")}>
                Disease Detection
              </p>
              <p onClick={() => handleNavigation("fertilizer_pesticide_advice")}>
                Fertilizer & Pesticide Advice
              </p>
              <p onClick={() => handleNavigation("soil_health")}>Soil Health</p>
              <p onClick={() => handleNavigation("weather_query")}>Weather Query</p>
              <p onClick={() => handleNavigation("market_price_info")}>
                Market Price Info
              </p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Notifications + Login + Mobile Hamburger */}
      <div className="right-section">
        <div className="notification-icon" onClick={toggleNotifications}>
          <FaBell size={20} />
          {weatherAlerts.length > 0 && !showNotification && (
            <span className="notif-dot"></span>
          )}
        </div>

        {showNotification && (
          <div className="notification-box">
            <h4>Weather Alerts</h4>
            <div className="alert-list">
              {weatherAlerts.map((alert, index) => (
                <div key={index} className="alert-item">
                  <p className="alert-event">{alert.event}</p>
                  {alert.description && <p className="alert-desc">{alert.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          className={userID ? "logoutBtn" : "loginBtn"}
          onClick={userID ? handleLogout : goToLogin}
        >
          {userID ? "Logout" : "Login"}
        </button>

        {/* Mobile Hamburger */}
        <div className="hamburger" onClick={toggleMobileMenu}>
          {mobileMenuOpen ? <FaTimes size={22} /> : <FaBars size={22} />}
        </div>

        {mobileMenuOpen && (
          <div className="mobile-menu">
            <p onClick={goToMarket}>Market</p>
            <p onClick={() => handleNavigation("crop_recommendation")}>
              Crop Recommendation
            </p>
            <p onClick={() => handleNavigation("disease_detection")}>Disease Detection</p>
            <p onClick={() => handleNavigation("fertilizer_pesticide_advice")}>
              Fertilizer & Pesticide Advice
            </p>
            <p onClick={() => handleNavigation("soil_health")}>Soil Health</p>
            <p onClick={() => handleNavigation("weather_query")}>Weather Query</p>
            <p onClick={() => handleNavigation("market_price_info")}>Market Price Info</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TopBar;
