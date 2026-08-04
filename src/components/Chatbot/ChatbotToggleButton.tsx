"use client";

import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatbotToggleButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

const ChatbotToggleButton = ({ onClick, isOpen }: ChatbotToggleButtonProps) => {
  return (
    <Button
      onClick={onClick}
      className="rounded-full w-16 h-16 shadow-lg"
    >
      {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
    </Button>
  );
};

export default ChatbotToggleButton;
