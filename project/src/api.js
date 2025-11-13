// src/api.js
import axios from "axios";

// ✅ Base URL updated to match your Flask backend
const API = axios.create({
  baseURL: "http://127.0.0.1:5000//api",
});

// ------------------------------
// 🔍 RECOMMENDATION
// ------------------------------
export const recommend = async (payload) => {
  const res = await API.post("/recommend", payload);
  try {
    // Flask returns a JSON string (from pandas.to_json)
    return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  } catch (err) {
    console.error("Error parsing recommend response:", err);
    return [];
  }
};

// ------------------------------
// 📨 CREATE REQUEST
// ------------------------------
export const createRequest = async (payload) => {
  const res = await API.post("/request", payload);
  return res.data;
};

// ------------------------------
// 📋 LIST REQUESTS
// ------------------------------
export const listRequests = async (params) => {
  const res = await API.get("/requests", { params });
  return res.data;
};

// ------------------------------
// 🔔 LIST NOTIFICATIONS
// ------------------------------
export const listNotifications = async (params) => {
  const res = await API.get("/notifications", { params });
  return res.data;
};

// ------------------------------
// ✅ ACCEPT REQUEST
// ------------------------------
export const acceptRequest = async (id) => {
  const res = await API.post(`/accept/${id}`);
  return res.data;
};

// ------------------------------
// ❌ REJECT REQUEST
// ------------------------------
export const rejectRequest = async (id) => {
  const res = await API.post(`/reject/${id}`);
  return res.data;
};

// ------------------------------
// 💬 CHAT SYSTEM
// ------------------------------
export const sendMessage = async (payload) => {
  const res = await API.post("/chat/send", payload);
  return res.data;
};

export const getChatHistory = async (params) => {
  const res = await API.get("/chat/history", { params });
  return res.data;
};
