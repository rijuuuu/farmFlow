import React, { useState, useEffect, useRef } from "react";
import Dashboard from "./Dashboard";
import "../style/Home.css";

export default function Home() {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(true);
  const chatEndRef = useRef(null);

  const handleChange = (e) => setMessage(e.target.value);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 900) setIsChatOpen(false);
      else setIsChatOpen(true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setError("");
    setLoading(true);

    setChatHistory((prev) => [...prev, { sender: "user", text: message }]);

    try {
      const response = await fetch("http://127.0.0.1:5000/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const result = await response.json();

      if (response.ok) {
        setChatHistory((prev) => [
          ...prev,
          { sender: "bot", text: result.reply || "No reply received" },
        ]);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Server error");
    } finally {
      setLoading(false);
      setMessage("");
    }
  };

  return (
    <div className="homeContainer">
      <div className="homeContent">
        <Dashboard />
      </div>

      {!isChatOpen && (
        <div className="chatbot-icon" onClick={() => setIsChatOpen(true)}>
          💬
        </div>
      )}

      {isChatOpen && (
        <div className="chatbot show">
          <div className="chat-header">
            <h4>Chatbot</h4>
            <button className="close-btn" onClick={() => setIsChatOpen(false)}>
              ✕
            </button>
          </div>

          <div className="msgs">
            {chatHistory.map((msg, index) => (
              <div
                key={index}
                className={`chat-bubble ${
                  msg.sender === "user" ? "user-bubble" : "bot-bubble"
                }`}
              >
                <p>{msg.text}</p>
              </div>
            ))}
            {error && <p className="error-msg">{error}</p>}
            <div ref={chatEndRef} />
          </div>

          <div className="msg-box">
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={message}
                onChange={handleChange}
                placeholder="Type your message..."
                className="chat-input"
                disabled={loading}
              />
              <button type="submit" disabled={loading}>
                {loading ? "..." : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
