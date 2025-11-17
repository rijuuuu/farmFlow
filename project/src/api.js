import axios from "axios";

// FIX: Use localhost for the API URL if running the frontend and backend on the same machine.
const API = "http://http://192.168.1.5/:5000"; 

export default API;

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