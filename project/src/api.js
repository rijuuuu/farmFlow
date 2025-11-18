import axios from "axios";

const API = "http://192.168.1.5:5000";
export default API;

/* ==========================
   EXISTING APIs
========================== */

export const recommend = (payload) =>
  axios.post(`${API}/api/recommend`, payload).then((r) => r.data);

export const createRequest = (payload) =>
  axios.post(`${API}/api/request`, payload).then((r) => r.data);

export const listRequests = (params) =>
  axios.get(`${API}/api/requests`, { params }).then((r) => r.data);

export const listNotifications = (params) =>
  axios.get(`${API}/api/notifications`, { params }).then((r) => r.data);

export const acceptRequest = (id) =>
  axios.post(`${API}/api/accept/${id}`).then((r) => r.data);

export const rejectRequest = (id) =>
  axios.post(`${API}/api/reject/${id}`).then((r) => r.data);

export const sendMessage = (payload) =>
  axios.post(`${API}/api/chat/send`, payload).then((r) => r.data);

export const getChatHistory = (room) =>
  axios.get(`${API}/api/chat/history`, { params: { room } }).then((r) => r.data);

export const getUser = (id) =>
  axios.get(`${API}/api/user`, { params: { id } }).then((r) => r.data);


/* ==========================
   NEW WEATHER APIs
========================== */

// Current Weather
export const getCurrentWeather = (lat, lon) =>
  axios
    .get(`${API}/api/weather/current`, { params: { lat, lon } })
    .then((r) => r.data);

// 5-Day / 3-Hour Forecast
export const getWeatherForecast = (lat, lon) =>
  axios
    .get(`${API}/api/weather/forecast`, { params: { lat, lon } })
    .then((r) => r.data);

// Weather Alerts (if backend sends them)
export const getWeatherAlerts = (lat, lon) =>
  axios
    .get(`${API}/api/weather/alerts`, { params: { lat, lon } })
    .then((r) => r.data);


/* ==========================
   NEW GOVERNMENT SCHEME APIs
========================== */

// Recommend scheme based on crop + state
export const getSchemeByCrop = (payload) =>
  axios
    .post(`${API}/api/scheme/bycrop`, payload)
    .then((r) => r.data);

// General fetch all schemes (if backend supports it)
export const listAllSchemes = () =>
  axios
    .get(`${API}/api/scheme/list`)
    .then((r) => r.data);


/* ==========================
   CROP MANAGEMENT APIs
========================== */

// Add crop for a user
export const addCrop = (payload) =>
  axios
    .post(`${API}/api/crops/add`, payload)
    .then((r) => r.data);

// Get crops for a user
export const getCrops = (userID) =>
  axios
    .get(`${API}/api/crops/get`, { params: { userID } })
    .then((r) => r.data);
