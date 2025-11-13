import { useEffect, useState, useRef } from "react";
import { sendMessage, getChatHistory } from "../api";
// import "../style/BuyerChatBox.css";

export default function BuyerChatBox({ user, partner }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const room = [user, partner].sort().join("_");

  const loadMessages = async () => {
    try {
      const data = await getChatHistory(room);
      if (Array.isArray(data)) {
        setMessages(data);
      }
    } catch (err) {
      console.error("Chat load error:", err);
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    const payload = { sender: user, receiver: partner, text, room };
    try {
      const res = await sendMessage(payload);
      if (res && res.msg) {
        setMessages((prev) => [...prev, res.msg]);
        setText("");
      } else {
        await loadMessages();
        setText("");
      }
    } catch (err) {
      console.error("Send error:", err);
    }
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [room]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="buyerchatbot">
      <div className="buyerchatbot-header">
        <span>💬 Chat with {partner}</span>
      </div>

      <div className="buyerchatbot-msgs">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`buyerchatbot-bubble ${
              m.sender === user
                ? "buyerchatbot-user-bubble"
                : "buyerchatbot-partner-bubble"
            }`}
          >
            <div className="buyerchatbot-text">{m.text}</div>
            {m.timestamp && (
              <div className="buyerchatbot-timestamp">{m.timestamp}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef}></div>
      </div>

      <div className="buyerchatbot-msg-box">
        <input
          className="buyerchatbot-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button className="buyerchatbot-send-btn" onClick={handleSend}>
          Send
        </button>
      </div>
    </div>
  );
}
