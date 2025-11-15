// src/components/BuyerSellerChat.jsx

import { useState, useEffect, useRef } from "react";
import { sendMessage, getChatHistory } from "../api";
import { toast } from "react-hot-toast";
import "../style/BuyerSellerChat.css"; // Ensure this file path is correct

export default function BuyerSellerChat({ user, partner }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const chatEndRef = useRef(null); // Determine chat room ID

  const room = [user, partner].sort().join(":"); // Function to load message history

  const loadHistory = async () => {
    try {
      const history = await getChatHistory(room);
      setMessages(history);
    } catch (error) {
      console.error("Failed to load chat history:", error);
      toast.error("Failed to load chat history.");
    }
  }; // Function to send a new message

  const handleSend = async () => {
    if (!inputText.trim()) return;

    try {
      const payload = {
        sender: user,
        receiver: partner,
        text: inputText,
        room: room,
      };

      await sendMessage(payload);
      setInputText(""); // Reload history to show the new message (simple polling approach)
      loadHistory();
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message.");
    }
  }; // Scroll to the bottom of the chat box

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }; // Load history on mount and when dependencies change

  useEffect(() => {
    loadHistory(); // Simple polling mechanism to refresh the chat every 3 seconds
    const interval = setInterval(loadHistory, 3000);
    return () => clearInterval(interval);
  }, [room]); // Scroll to bottom whenever messages update

  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Handle Enter key for sending

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="buyer-seller-chat-container">
           {" "}
      <div className="buyer-seller-chat-header">
                Chatting with {partner}     {" "}
      </div>
                 {" "}
      <div className="buyer-seller-chat-messages">
               {" "}
        {messages.length === 0 ? (
          <div className="buyer-seller-empty-chat">
            Say hello to start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`buyer-seller-chat-message ${
                msg.sender === user
                  ? "buyer-seller-user-message"
                  : "buyer-seller-partner-message"
              }`}
            >
                           {" "}
              <div className="buyer-seller-message-text">{msg.text}</div>       
                   {" "}
              <div className="buyer-seller-message-time">
                               {" "}
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                             {" "}
              </div>
                         {" "}
            </div>
          ))
        )}
                <div ref={chatEndRef} />     {" "}
      </div>
           {" "}
      <div className="buyer-seller-chat-input-area">
               {" "}
        <input
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
                <button onClick={handleSend}>Send</button>     {" "}
      </div>
         {" "}
    </div>
  );
}
