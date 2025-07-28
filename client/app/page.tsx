"use client";

import { useRef, useState, useEffect } from "react";
import clsx from "clsx";
import { LoadingCircle, SendIcon } from "./icons";
import { Bot, User, CheckCircle, Circle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Textarea from "react-textarea-autosize";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";

interface Message {
  id: string;
  content: string;
  author: string;
  role: 'user' | 'assistant';
  timestamp: string;
}

interface PreferenceItem {
  id: string;
  label: string;
  value: string;
  isCompleted: boolean;
}

export default function Chat() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [username] = useState("User" + Math.floor(Math.random() * 1000));
  
  // Preferences checklist state
  const [preferences, setPreferences] = useState<PreferenceItem[]>([
    { id: 'tone_of_voice', label: 'Preferred Tone of Voice', value: '', isCompleted: false },
    { id: 'response_format', label: 'Preferred Response Format', value: '', isCompleted: false },
    { id: 'language', label: 'Language Preference', value: '', isCompleted: false },
    { id: 'interaction_style', label: 'Interaction Style', value: '', isCompleted: false },
    { id: 'news_topics', label: 'Preferred News Topics', value: '', isCompleted: false },
  ]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Connect to WebSocket server
    const newSocket = io('http://localhost:5001');
    setSocket(newSocket);

    // Connection events
    newSocket.on('connect', () => {
      console.log('Connected to chat server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from chat server');
      setIsConnected(false);
    });

    newSocket.on('connection_response', (data) => {
      console.log('Connection response:', data);
    });

    // Chat events
    newSocket.on('chat_history', (data) => {
      console.log('Chat history:', data);
      const formattedMessages = data.messages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        author: msg.author,
        role: msg.author === 'User' ? 'user' : 'assistant',
        timestamp: msg.timestamp
      }));
      setMessages(formattedMessages);
    });

    newSocket.on('new_message', (msg) => {
      console.log('New message:', msg);
      const formattedMessage: Message = {
        id: msg.id,
        content: msg.content,
        author: msg.author,
        role: msg.author === 'User' ? 'user' : 'assistant',
        timestamp: msg.timestamp
      };
      setMessages(prev => [...prev, formattedMessage]);
      setIsLoading(false);
    });

    // Preference update events
    newSocket.on('preference_update', (data) => {
      console.log('Preference update:', data);
      updatePreference(data.preferenceId, data.value);
    });

    newSocket.on('preferences_reset', () => {
      console.log('Resetting preferences');
      resetPreferences();
    });

    newSocket.on('error', (data) => {
      console.error('Socket error:', data);
      toast.error(data.message || 'An error occurred');
      setIsLoading(false);
    });

    // Cleanup
    return () => {
      newSocket.close();
    };
  }, [username]);

  // Method to update a specific preference
  const updatePreference = (preferenceId: string, value: string) => {
    setPreferences(prev => prev.map(pref => 
      pref.id === preferenceId 
        ? { ...pref, value, isCompleted: true }
        : pref
    ));
  };

  // Method to reset all preferences
  const resetPreferences = () => {
    setPreferences(prev => prev.map(pref => ({
      ...pref,
      value: '',
      isCompleted: false
    })));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !input.trim() || isLoading) return;

    setIsLoading(true);
    
    // Send message to server
    socket.emit('send_message', { content: input.trim() });
    setInput("");
  };

  const disabled = isLoading || input.length === 0 || !isConnected;

  return (
    <div className="h-screen bg-black overflow-hidden flex flex-col">
      {/* Full width header - always visible */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900 w-full flex-shrink-0">
        <h1 className="text-xl font-semibold text-white">Chat</h1>
        <div className={clsx(
          "px-3 py-1 rounded-full text-xs font-medium",
          isConnected 
            ? "bg-green-900 text-green-300 border border-green-700" 
            : "bg-red-900 text-red-300 border border-red-700"
        )}>
          {isConnected ? "Connected" : "Disconnected"}
        </div>
      </div>

      {/* Main content area with sidebar and chat */}
      <div className="flex-1 flex bg-black overflow-hidden">
        {/* Preferences Sidebar */}
        <div className="w-80 bg-gray-900 border-r border-gray-800 flex-shrink-0 p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white mb-2">Preferences</h2>
            <p className="text-sm text-gray-400">Your chat preferences</p>
          </div>
          
          <div className="space-y-3">
            {preferences.map((preference) => (
              <div
                key={preference.id}
                className={clsx(
                  "p-3 rounded-lg border transition-all duration-200",
                  preference.isCompleted
                    ? "bg-green-900/20 border-green-700/50"
                    : "bg-gray-800/50 border-gray-700/50"
                )}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {preference.isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">
                      {preference.label}
                    </div>
                    {preference.isCompleted && preference.value && (
                      <div className="text-xs text-gray-300 mt-1">
                        {preference.value}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Progress indicator */}
          <div className="mt-6 p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">Progress</span>
              <span className="text-sm text-gray-300">
                {preferences.filter(p => p.isCompleted).length}/{preferences.length}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${(preferences.filter(p => p.isCompleted).length / preferences.length) * 100}%` 
                }}
              />
            </div>
          </div>
        </div>

        {/* Chat area - centered with max width */}
        <div className="flex-1 flex justify-center bg-black overflow-hidden">
          <div className="w-full max-w-4xl flex flex-col">
            {/* Messages area with transparent scrollbar - only this scrolls */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black scrollbar-hide" style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}>
              <style jsx>{`
                .scrollbar-hide::-webkit-scrollbar {
                  display: none;
                }
              `}</style>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bot className="w-8 h-8 text-gray-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Welcome to Chat</h2>
                    <p className="text-gray-400">
                      {isConnected 
                        ? "Send a message to start the conversation" 
                        : "Connecting to chat server..."}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={clsx(
                        "flex w-full",
                        message.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={clsx(
                          "flex items-start space-x-2 max-w-xs lg:max-w-md xl:max-w-lg",
                          message.role === "user" ? "flex-row-reverse space-x-reverse" : "flex-row"
                        )}
                      >
                        {/* Avatar */}
                        <div
                          className={clsx(
                            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                            message.role === "user" ? "bg-blue-600" : "bg-gray-600"
                          )}
                        >
                          {message.role === "user" ? (
                            <User className="w-4 h-4 text-white" />
                          ) : (
                            <Bot className="w-4 h-4 text-white" />
                          )}
                        </div>

                        {/* Message bubble */}
                        <div
                          className={clsx(
                            "px-4 py-2 rounded-2xl shadow-sm",
                            message.role === "user" 
                              ? "bg-blue-600 text-white rounded-br-md" 
                              : "bg-gray-700 text-white rounded-bl-md"
                          )}
                        >
                          <ReactMarkdown
                            className={clsx(
                              "prose prose-sm prose-invert",
                              "prose-p:leading-relaxed prose-p:m-0",
                              "prose-pre:bg-black prose-pre:text-gray-300",
                              "prose-code:text-gray-300 prose-code:bg-black prose-code:px-1 prose-code:rounded",
                              message.role === "user" 
                                ? "prose-a:text-blue-200 prose-a:hover:text-blue-100" 
                                : "prose-a:text-blue-400 prose-a:hover:text-blue-300"
                            )}
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: (props: any) => (
                                <a {...props} target="_blank" rel="noopener noreferrer" />
                              ),
                              p: ({ children }) => <div>{children}</div>,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                          
                          {/* Timestamp */}
                          <div
                            className={clsx(
                              "text-xs mt-1 opacity-70",
                              message.role === "user" ? "text-blue-100" : "text-gray-300"
                            )}
                          >
                            {new Date(message.timestamp).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input area - always visible at bottom */}
            <div className="p-4 flex-shrink-0">
              <form
                ref={formRef}
                onSubmit={handleSubmit}
                className="flex items-center space-x-3"
              >
                <div className="flex-1">
                  <Textarea
                    ref={inputRef}
                    rows={1}
                    maxRows={4}
                    placeholder={isConnected ? "Type a message..." : "Connecting..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        formRef.current?.requestSubmit();
                        e.preventDefault();
                      }
                    }}
                    disabled={!isConnected}
                    className="w-full resize-none bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={disabled}
                  className={clsx(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0",
                    disabled
                      ? "bg-gray-700 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                  )}
                >
                  {isLoading ? (
                    <LoadingCircle />
                  ) : (
                    <SendIcon
                      className={clsx(
                        "w-5 h-5",
                        disabled ? "text-gray-400" : "text-white"
                      )}
                    />
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
