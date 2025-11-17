import { useState, useEffect } from "react";
import { sendMessage, getChatHistory } from "../api";

export default function BuyerSellerChat({ user, partner, room }) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);

  const load = async () => {
    // Only load chat history if the room ID is valid
    if (room && room.includes("_") && !room.includes("undefined")) {
        const res = await getChatHistory(room);
        if (Array.isArray(res)) setMessages(res);
    }
  };

  useEffect(() => {
    load();
    // Only set up interval if room is valid
    if (room && room.includes("_") && !room.includes("undefined")) {
        const iv = setInterval(load, 2000);
        return () => clearInterval(iv);
    }
    return () => {}; // Cleanup function if no interval was set
  }, [room]);

  const send = async () => {
    const messageText = text.trim();
    
    // Check if the message is empty
    if (!messageText) return;

    // FIX: Check if essential chat IDs are missing before calling the API
    if (!user || !partner || !room || room.includes("undefined")) {
        console.error("Chat send failed: Missing user, partner, or room ID.", { user, partner, room });
        // Since this component can't access toast, we rely on the console error.
        return; 
    }

    await sendMessage({
      sender: user,
      receiver: partner,
      text: messageText,
      room,
    });
    setText("");
    load();
  };

  return (
    <div className="buyer-seller-chatbox">
      <div className="buyer-seller-chat-header">Chat</div>

      <div className="buyer-seller-chat-body">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`msg ${m.sender === user ? "sent" : "recv"}`}
          >
            <div className="bubble">{m.text}</div>
          </div>
        ))}
      </div>

      <div className="buyer-seller-chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type message…"
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}