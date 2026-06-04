import React, { useEffect, useRef, useState, useMemo } from "react";
import { ChevronLeft, Send, Paperclip, Smile } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@core/context/AuthContext";
import { useToast } from "@shared/components/ui/Toast";
import axiosInstance from "@core/api/axios";
import { onOrderChatMessage } from "@/core/services/orderSocket";
import { ref, onValue } from "firebase/database";
import { getRealtimeDb } from "@/core/firebase/client";

function formatTime(value) {
    if (!value) return "";
    try {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return "";
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

const emojis = ["😀", "😂", "😍", "🥺", "😎", "😭", "😡", "👍", "👎", "🎉", "❤️", "🔥", "✅", "❌", "👋", "🙏", "👀", "💯"];

const DeliveryOrderChatModal = ({ isOpen, onClose, orderId, customerName }) => {
    const { token } = useAuth();
    const { showToast } = useToast();
    
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [selectedImageFile, setSelectedImageFile] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    
    const getToken = useMemo(() => () => token, [token]);

    useEffect(() => {
        if (!isOpen || !orderId || !token) return;

        let db = null;
        try {
            db = getRealtimeDb();
        } catch (e) {
            console.warn("[DeliveryOrderChatModal] Firebase RTDB init skipped/failed:", e.message);
        }

        if (db) {
            const chatRef = ref(db, `/chats/orders/${orderId}/messages`);
            const unsubscribe = onValue(chatRef, (snapshot) => {
                const val = snapshot.val();
                if (val) {
                    const rawList = Object.keys(val).map(key => ({
                        ...val[key],
                        _id: val[key]._id || key
                    }));
                    rawList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    setMessages(rawList.map(msg => ({
                        ...msg,
                        time: formatTime(msg.createdAt)
                    })));
                } else {
                    setMessages([]);
                }
                setIsLoading(false);
            }, (error) => {
                console.warn("[DeliveryOrderChatModal] Firebase RTDB read error:", error);
            });

            return () => unsubscribe();
        } else {
            // Fallback: fetch initial messages using REST
            let mounted = true;
            async function fetchChat() {
                try {
                    setIsLoading(true);
                    const res = await axiosInstance.get(`/chat/order/${orderId}`);
                    if (mounted && res.data?.result?.messages) {
                        setMessages(res.data.result.messages.map(msg => ({
                            ...msg,
                            time: formatTime(msg.createdAt)
                        })));
                    }
                } catch (error) {
                    if (mounted) showToast("Failed to load chat history", "error");
                } finally {
                    if (mounted) setIsLoading(false);
                }
            }
            fetchChat();
            return () => { mounted = false; };
        }
    }, [isOpen, orderId, token]);

    // Socket.IO fallback listener
    useEffect(() => {
        if (!isOpen || !token) return;

        const off = onOrderChatMessage(getToken, (payload) => {
            if (payload?.orderId !== orderId || !payload?.message) return;
            
            setMessages(prev => {
                const exists = prev.find(m => String(m._id) === String(payload.message._id));
                if (exists) return prev;
                return [...prev, { ...payload.message, time: formatTime(payload.message.createdAt) }];
            });
        });

        return () => off();
    }, [isOpen, orderId, token]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, selectedImage]);

    const handleSend = async () => {
        const text = String(inputText || "").trim();
        if (!text && !selectedImageFile) return;
        if (isSending) return;

        try {
            setIsSending(true);
            setShowEmojiPicker(false);

            let mediaUrl = "";
            let mediaType = "";
            if (selectedImageFile) {
                const uploadForm = new FormData();
                uploadForm.append("file", selectedImageFile);
                const uploadRes = await axiosInstance.post("/media/upload", uploadForm, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
                mediaUrl = uploadRes.data?.result?.url || "";
                mediaType = "image";
                if (!mediaUrl) throw new Error("Failed to upload image");
            }

            const payload = { text, mediaUrl, mediaType };
            
            // Optimistic update
            const tempMsg = {
                _id: Date.now().toString(),
                senderType: "Delivery",
                text,
                mediaUrl,
                time: formatTime(new Date()),
            };
            setMessages(prev => [...prev, tempMsg]);
            
            setInputText("");
            setSelectedImage(null);
            setSelectedImageFile(null);

            const res = await axiosInstance.post(`/chat/order/${orderId}/send`, payload);
            
            // Replace optimistic with real
            if (res.data?.result?.messages) {
                const updatedMessages = res.data.result.messages;
                setMessages(updatedMessages.map(msg => ({
                    ...msg,
                    time: formatTime(msg.createdAt)
                })));
            }
        } catch (error) {
            showToast("Failed to send message", "error");
        } finally {
            setIsSending(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            setSelectedImageFile(file);
            setSelectedImage(evt?.target?.result || null);
        };
        reader.readAsDataURL(file);
        if (e.target) e.target.value = "";
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-white flex flex-col z-[999] overflow-hidden">
            <div className="bg-white px-4 py-4 flex items-center justify-between shadow-sm border-b z-30 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
                        <ChevronLeft size={24} className="text-gray-700" />
                    </button>
                    <div>
                        <h1 className="text-base font-bold text-gray-900">
                            {customerName || "Customer Chat"}
                        </h1>
                        <p className="text-xs text-brand-600 font-medium">Order #{orderId}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
                {isLoading ? (
                    <div className="text-center text-xs font-bold text-gray-400 mt-10">Loading chat...</div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-xs font-bold text-gray-400 mt-10">No messages yet. Say hi!</div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg._id} className={`flex ${msg.senderType === "Delivery" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] flex flex-col ${msg.senderType === "Delivery" ? "items-end" : "items-start"}`}>
                                <div className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm ${
                                    msg.senderType === "Delivery"
                                        ? "bg-brand-500 text-white rounded-tr-none"
                                        : "bg-white text-gray-800 border rounded-tl-none"
                                }`}>
                                    {msg.mediaUrl && (
                                        <img src={msg.mediaUrl} alt="Attachment" className="max-w-[200px] rounded-lg mb-2" />
                                    )}
                                    {msg.text}
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 px-1">{msg.time}</span>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="bg-white p-3 border-t z-30 relative pb-safe">
                <AnimatePresence>
                    {showEmojiPicker && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full left-4 mb-2 bg-white rounded-xl shadow-lg border p-3 grid grid-cols-6 gap-2 w-64 z-50"
                        >
                            {emojis.map((emoji) => (
                                <button key={emoji} onClick={() => setInputText(prev => prev + emoji)} className="text-xl hover:bg-gray-100 p-1 rounded">
                                    {emoji}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {selectedImage && (
                    <div className="absolute bottom-full right-4 mb-2 bg-white rounded-xl shadow-lg border p-2 z-50 relative inline-block">
                        <img src={selectedImage} alt="Preview" className="h-20 w-20 object-cover rounded-lg" />
                        <button onClick={() => { setSelectedImage(null); setSelectedImageFile(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
                            <ChevronLeft size={12} className="rotate-45" />
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-full border border-gray-200">
                    <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full">
                        <Smile size={20} />
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-gray-600 rounded-full">
                        <Paperclip size={20} />
                    </button>
                    
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder="Message customer..."
                        className="bg-transparent text-sm w-full py-2 outline-none text-gray-700 placeholder-gray-400"
                    />
                    
                    <button
                        onClick={handleSend}
                        disabled={!String(inputText || "").trim() && !selectedImageFile || isSending}
                        className="p-2.5 rounded-full bg-brand-500 text-white disabled:opacity-50 transition-colors"
                    >
                        <Send size={18} className="ml-0.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeliveryOrderChatModal;
