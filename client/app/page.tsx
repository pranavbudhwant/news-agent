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
    <div className="h-screen bg-white overflow-hidden flex flex-col">
      {/* Full width header - always visible */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white w-full flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Chat</h1>
        <div className={clsx(
          "px-3 py-1 rounded-full text-xs font-medium",
          isConnected 
            ? "bg-green-100 text-green-800 border border-green-300" 
            : "bg-red-100 text-red-800 border border-red-300"
        )}>
          {isConnected ? "Connected" : "Disconnected"}
        </div>
      </div>

      {/* Main content area with sidebar and chat */}
      <div className="flex-1 flex bg-gray-50 overflow-hidden">
        {/* Preferences Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex-shrink-0 p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Preferences</h2>
            <p className="text-sm text-gray-600">Your chat preferences</p>
          </div>
          
          <div className="space-y-3">
            {preferences.map((preference) => (
              <div
                key={preference.id}
                className={clsx(
                  "p-3 rounded-lg border transition-all duration-200",
                  preference.isCompleted
                    ? "bg-green-100 border-green-300"
                    : "bg-gray-100 border-gray-300"
                )}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {preference.isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {preference.label}
                    </div>
                    {preference.isCompleted && preference.value && (
                      <div className="text-xs text-gray-600 mt-1">
                        {preference.value}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area - centered with max width */}
        <div className="flex-1 flex justify-center bg-gray-50 overflow-hidden">
          <div className="w-full max-w-4xl flex flex-col">
            {/* Messages area with transparent scrollbar - only this scrolls */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 scrollbar-hide" style={{
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
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bot className="w-8 h-8 text-gray-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Chat</h2>
                    <p className="text-gray-600">
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
                            message.role === "user" ? "bg-blue-600" : "bg-gray-500"
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
                              : "bg-white text-gray-900 rounded-bl-md border border-gray-200"
                          )}
                        >
                          <div className={message.role === "user" ? "text-white [&_*]:text-white" : ""}>
                            <ReactMarkdown
                              className={clsx(
                                "prose prose-sm",
                                "prose-p:leading-relaxed prose-p:m-0",
                                "prose-pre:bg-gray-100 prose-pre:text-gray-800",
                                "prose-code:text-gray-800 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded",
                                message.role === "user" 
                                  ? "prose-a:text-blue-200 prose-a:hover:text-blue-100 prose-p:text-white prose-strong:text-white prose-em:text-white prose-ul:text-white prose-ol:text-white prose-li:text-white prose-blockquote:text-white prose-h1:text-white prose-h2:text-white prose-h3:text-white prose-h4:text-white prose-h5:text-white prose-h6:text-white prose:text-white [&_*]:text-white" 
                                  : "prose-a:text-blue-600 prose-a:hover:text-blue-700"
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
                          </div>
                          
                          {/* Timestamp */}
                          <div
                            className={clsx(
                              "text-xs mt-1 opacity-70",
                              message.role === "user" ? "text-blue-100" : "text-gray-500"
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
                    className="w-full resize-none bg-white border border-gray-300 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={disabled}
                  className={clsx(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0",
                    disabled
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                  )}
                >
                  {isLoading ? (
                    <LoadingCircle />
                  ) : (
                    <SendIcon
                      className={clsx(
                        "w-5 h-5",
                        disabled ? "text-gray-500" : "text-white"
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
