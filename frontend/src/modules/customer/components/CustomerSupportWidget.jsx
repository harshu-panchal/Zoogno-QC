import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageCircle, Phone, X, Send, Headset,
    Store, Truck, ChevronDown, MoreVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActiveChatContext, getChatHeaderConfig, CHAT_CONTEXTS } from '../utils/chatContextUtils';

/**
 * A Context-Aware Customer Support Chat Widget.
 * It dynamically connects the user to Zoogno Support, the Seller, or the Delivery Driver
 * depending on the active order state.
 */
const CustomerSupportWidget = ({ activeOrder = null }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef(null);

    // Determine context dynamically
    const context = getActiveChatContext(activeOrder);
    const config = getChatHeaderConfig(context, activeOrder);

    // Icons mapped to context
    const ContextIcon = context === CHAT_CONTEXTS.SELLER ? Store :
        context === CHAT_CONTEXTS.DRIVER ? Truck : Headset;

    // Load initial mock messages based on context when opened
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            let initialMsg = '';
            if (context === CHAT_CONTEXTS.SELLER) {
                initialMsg = `Hi there! We are currently preparing your order. Let us know if you need any modifications before we pack it!`;
            } else if (context === CHAT_CONTEXTS.DRIVER) {
                initialMsg = `Hello! I'm on my way with your order. You can track my location or message me here if you need to provide specific delivery instructions.`;
            } else {
                initialMsg = `Welcome to Zoogno Support! How can we help you today?`;
            }

            setMessages([{ id: Date.now(), text: initialMsg, sender: 'support', time: new Date() }]);
        }
    }, [isOpen, context, messages.length]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleSend = (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        const newMsg = {
            id: Date.now(),
            text: inputText.trim(),
            sender: 'user',
            time: new Date()
        };

        setMessages(prev => [...prev, newMsg]);
        setInputText('');

        // Mock auto-reply
        setTimeout(() => {
            setMessages(prev => [...prev, {
                id: Date.now(),
                text: "Thanks for your message. We'll get back to you shortly.",
                sender: 'support',
                time: new Date()
            }]);
        }, 1500);
    };

    const handleCall = () => {
        // In a real app, this might trigger a VoIP component or use tel: link
        let phone = '+1234567890'; // Default support number
        if (context === CHAT_CONTEXTS.SELLER && activeOrder?.seller?.phone) {
            phone = activeOrder.seller.phone;
        } else if (context === CHAT_CONTEXTS.DRIVER && activeOrder?.deliveryPartner?.phone) {
            phone = activeOrder.deliveryPartner.phone;
        }
        window.location.href = `tel:${phone}`;
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 font-sans">
            <AnimatePresence>
                {/* --- CHAT WINDOW --- */}
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-16 right-0 w-80 sm:w-96 h-[500px] bg-[var(--chat-light)] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
                    >
                        {/* Header */}
                        <div
                            className="p-4 text-white flex items-center justify-between"
                            style={{ backgroundColor: config.bgColor }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 border border-white/30 backdrop-blur-sm">
                                    <ContextIcon size={20} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-[15px] font-bold leading-tight">{config.title}</h3>
                                    <p className="text-[11px] text-white/80 font-medium truncate max-w-[180px]">
                                        {config.subtitle}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleCall}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors tooltip-trigger"
                                    title="Call Support"
                                >
                                    <Phone size={18} />
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    <ChevronDown size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Status/Context Banner (Optional) */}
                        {activeOrder && (
                            <div className="bg-[var(--chat-accent)] text-[var(--chat-bg-dark)] px-4 py-1.5 text-[10px] font-bold flex items-center justify-between shadow-sm">
                                <span>Order #{activeOrder.orderId}</span>
                                <span className="uppercase">{activeOrder.status}</span>
                            </div>
                        )}

                        {/* Messages Area */}
                        <div className="flex-1 p-4 overflow-y-auto bg-[var(--chat-light)] space-y-4">
                            <div className="text-center my-2">
                                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-full uppercase tracking-widest">
                                    Today
                                </span>
                            </div>

                            {messages.map((msg) => {
                                const isUser = msg.sender === 'user';
                                return (
                                    <motion.div
                                        key={msg.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "flex flex-col max-w-[85%]",
                                            isUser ? "ml-auto items-end" : "mr-auto items-start"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "p-3 text-sm rounded-2xl shadow-sm",
                                                isUser
                                                    ? "bg-[var(--chat-primary)] text-white rounded-tr-sm"
                                                    : "bg-white text-gray-800 border border-gray-100 rounded-tl-sm"
                                            )}
                                        >
                                            {msg.text}
                                        </div>
                                        <span className="text-[9px] text-gray-400 font-semibold mt-1 px-1">
                                            {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </motion.div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Type your message..."
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--chat-bright)] focus:border-transparent transition-all text-gray-800 placeholder-gray-400"
                            />
                            <button
                                type="submit"
                                disabled={!inputText.trim()}
                                className="h-10 w-10 rounded-full bg-[var(--chat-primary)] disabled:bg-gray-200 disabled:text-gray-400 text-white flex items-center justify-center shrink-0 transition-colors shadow-sm hover:bg-[var(--chat-deep)]"
                            >
                                <Send size={18} className="ml-0.5" />
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- FAB BUTTON --- */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className="relative h-14 w-14 rounded-full flex items-center justify-center shadow-lg transition-colors border-2 border-white"
                style={{ backgroundColor: 'var(--chat-bg-dark)' }}
            >
                {isOpen ? (
                    <X size={24} className="text-[var(--chat-accent)]" />
                ) : (
                    <MessageCircle size={26} className="text-white" />
                )}

                {/* Unread badge logic can go here */}
                {!isOpen && (
                    <span className="absolute top-0 right-0 h-3.5 w-3.5 bg-[var(--chat-accent)] rounded-full border-2 border-white shadow-sm" />
                )}
            </motion.button>
        </div>
    );
};

export default CustomerSupportWidget;
