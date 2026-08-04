"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { Link } from "react-router-dom";

export interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
}

interface ChatMessageProps {
  message: Message;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const isBot = message.sender === "bot";

  const renderMessage = (text: string) => {
    const linkRegex = /(\/booking|https?:\/\/[^\s]+)/g;
    const parts = text.split(linkRegex);

    return parts.map((part, i) => {
      if (part.match(linkRegex)) {
        if (part.startsWith("/")) {
          return (
            <Link key={i} to={part} className="text-primary underline">
              {part}
            </Link>
          );
        } else {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {part}
            </a>
          );
        }
      }
      return part;
    });
  };

  return (
    <div
      className={cn(
        "flex items-start space-x-3",
        isBot ? "" : "justify-end"
      )}
    >
      {isBot && (
        <Avatar className="w-8 h-8">
          <AvatarFallback>
            <Bot size={20} />
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "p-3 rounded-lg max-w-[80%]",
          isBot ? "bg-muted" : "bg-primary text-primary-foreground"
        )}
      >
        <p className="text-sm whitespace-pre-line">{renderMessage(message.text)}</p>
      </div>
      {!isBot && (
        <Avatar className="w-8 h-8">
          <AvatarFallback>
            <User size={20} />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

export default ChatMessage;

