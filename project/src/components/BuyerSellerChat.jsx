import { useState, useEffect, useRef } from "react"; // FIXED: Changed '=> "react"' to 'from "react"'
import { sendMessage, getChatHistory } from "../api";
import { toast } from "react-hot-toast";
import "../style/BuyerSellerChat.css";

// Accepts user, partnerId (the ID), partnerName (the display name), room, AND onCloseChat
export default function BuyerSellerChat({ user, partnerId, partnerName, room, onCloseChat }) { 
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const chatEndRef = useRef(null);

  // Strict check on room validity
  const isValidChat = room && partnerId && user && !room.includes("undefined"); 

  const loadHistory = async () => {
    if (!isValidChat) return;
    try {
      const history = await getChatHistory(room);
      setMessages(history);
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  };

  const handleSend = async () => {
    const textToSend = inputText.trim();
    if (!textToSend) return;

    if (!isValidChat) {
        toast.error("Cannot send message: Chat room is invalid or IDs are missing.");
        return;
    }

    try {
      const payload = {
        sender: user,
        receiver: partnerId, 
        text: textToSend,
        room: room,
      };

      await sendMessage(payload);
      setInputText(""); 
      loadHistory();
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message.");
    }
  };

  const scrollToBottom = () => {
    // FIX: This correctly targets the ref placed at the end of the scrollable messages div
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    loadHistory(); 
    if (!isValidChat) return;

    const interval = setInterval(loadHistory, 3000);
    return () => clearInterval(interval);
  }, [room, user, partnerId]); 

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="buyer-seller-chat-container">
      <div className="buyer-seller-chat-header">
          {/* Back icon element */}
          <button className="chat-back-icon" onClick={onCloseChat}>
            &larr;
          </button>
          Chatting with {partnerName || partnerId}      
      </div>
          
      <div className="buyer-seller-chat-messages">
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
              <div className="buyer-seller-message-text">{msg.text}</div>      
              <div className="buyer-seller-message-time">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>
      
      <div className="buyer-seller-chat-input-area">
        <input
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}