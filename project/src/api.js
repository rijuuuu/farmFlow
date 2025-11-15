// src/api.js
import axios from "axios";

const API = "http://192.168.0.104:5000";

export const recommend = async (payload) => {
  const res = await axios.post(`${API}/api/recommend`, payload);
  return res.data;
};

export const createRequest = (payload) => axios.post(`${API}/api/request`, payload).then(r => r.data);
export const listRequests = (params) => axios.get(`${API}/api/requests`, { params }).then(r => r.data);
export const listNotifications = (params) => axios.get(`${API}/api/notifications`, { params }).then(r => r.data);
export const acceptRequest = (id) => axios.post(`${API}/api/accept/${id}`).then(r => r.data);
export const rejectRequest = (id) => axios.post(`${API}/api/reject/${id}`).then(r => r.data);
export const sendMessage = (payload) => axios.post(`${API}/api/chat/send`, payload).then(r => r.data);
export const getChatHistory = (room) => axios.get(`${API}/api/chat/history`, { params: { room } }).then(r => r.data);

// The extra '}' has been removed from here.