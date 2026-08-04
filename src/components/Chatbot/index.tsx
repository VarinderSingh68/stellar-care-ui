"use client";

import { useState } from "react";
import ChatbotToggleButton from "./ChatbotToggleButton";
import ChatbotWindow from "./ChatbotWindow";
import { Message } from "./ChatMessage";
import { getBotResponse } from "@/lib/chatbot-logic";

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "bot",
      text: "Hello! I'm the StellarCare Assistant. How can I help you today?",
    },
  ]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const onSendMessage = (text: string) => {
    const userMessage: Message = {
      id: String(Date.now()),
      sender: "user",
      text,
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    const botResponseText = getBotResponse(text);

    setTimeout(() => {
      const botResponse: Message = {
        id: String(Date.now() + 1),
        sender: "bot",
        text: botResponseText,
      };
      setMessages((prevMessages) => [...prevMessages, botResponse]);
    }, 1000);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && <ChatbotWindow messages={messages} onSendMessage={onSendMessage} />}
      <ChatbotToggleButton onClick={toggleChat} isOpen={isOpen} />
    </div>
  );
};

export default Chatbot;

