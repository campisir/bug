import { useEffect, useRef } from 'react';
import '../styles/ChatBox.css';

export interface ChatMessage {
  id: number;
  sender: 'Partner' | 'Bot 1' | 'Bot 2' | 'System';
  message: string;
  timestamp: number;
}

interface ChatBoxProps {
  messages: ChatMessage[];
}

export function ChatBox({ messages }: ChatBoxProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-box">
      <div className="chat-header">
        <h3>Team Chat</h3>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet...</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.sender.toLowerCase().replace(' ', '-')}`}>
            <span className="chat-sender">[{msg.sender}]:</span>
            <span className="chat-text">{msg.message}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
