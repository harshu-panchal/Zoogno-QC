import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  PlusCircle,
  X,
  Send,
  Loader2,
  ChevronLeft,
  Paperclip,
  Smile,
  Shield,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import { useAuth } from "@core/context/AuthContext";
import { useToast } from "@shared/components/ui/Toast";
import axiosInstance from "@core/api/axios";
import { sellerApi } from "../services/sellerApi";
import { joinTicketRoom, leaveTicketRoom, onTicketMessage } from "@/core/services/orderSocket";
import { ref, onValue } from "firebase/database";
import { getRealtimeDb } from "@/core/firebase/client";

const emojis = ["😀", "😂", "😍", "🥺", "😎", "😭", "😡", "👍", "👎", "🎉", "❤️", "🔥", "✅", "❌", "👋", "🙏", "👀", "💯"];

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

const HelpSupport = () => {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const getToken = () => token;

  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [reply, setReply] = useState("");
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [newTicket, setNewTicket] = useState({
    subject: "",
    description: "",
    priority: "medium"
  });

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectedTicketRoomRef = useRef(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await sellerApi.getMyTickets();
      if (res.data.success) {
        const list = res.data.result || [];
        setTickets(list.map(t => ({
          ...t,
          id: t._id,
          date: new Date(t.createdAt).toLocaleString(),
          messages: (t.messages || []).map((m, i) => ({
            ...m,
            id: m._id || m.id || `msg-${t._id}-${i}`,
            time: formatTime(m.createdAt)
          }))
        })));
      }
    } catch (error) {
      showToast("Failed to load support tickets", "error");
    } finally {
      setLoading(false);
    }
  };

  // Firebase Realtime Database Live Stream for Selected Ticket
  useEffect(() => {
    if (!selectedTicket?.id) return;

    let db = null;
    try {
      db = getRealtimeDb();
    } catch (e) {
      console.warn("[SellerSupport] Firebase RTDB init skipped/failed:", e.message);
    }

    if (db) {
      const messagesRef = ref(db, `/chats/tickets/${selectedTicket.id}/messages`);
      const unsubscribe = onValue(messagesRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const rawList = Object.keys(val).map(key => ({
            ...val[key],
            _id: val[key]._id || key
          }));
          rawList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          
          const normalized = rawList.map((m, idx) => ({
            ...m,
            id: m._id || `msg-${selectedTicket.id}-${idx}`,
            time: formatTime(m.createdAt)
          }));

          setSelectedTicket(prev => {
            if (!prev || prev.id !== selectedTicket.id) return prev;
            return { ...prev, messages: normalized };
          });

          setTickets(prevTickets => prevTickets.map(t => {
            if (t.id === selectedTicket.id) {
              return { ...t, messages: normalized };
            }
            return t;
          }));
        }
      }, (error) => {
        console.warn("[SellerSupport] Firebase RTDB read error:", error);
      });

      return () => unsubscribe();
    }
  }, [selectedTicket?.id]);

  // Socket.IO Fallback & Room Management
  useEffect(() => {
    if (!token) return;
    const nextId = selectedTicket?.id ? String(selectedTicket.id) : null;
    const prevId = selectedTicketRoomRef.current;

    if (prevId && prevId !== nextId) {
      leaveTicketRoom(prevId, getToken);
    }
    if (nextId && prevId !== nextId) {
      joinTicketRoom(nextId, getToken);
    }
    selectedTicketRoomRef.current = nextId;

    const offMessage = onTicketMessage(getToken, (payload) => {
      const tid = String(payload?.ticketId || "").trim();
      if (!tid) return;
      if (selectedTicketRoomRef.current !== tid) return;

      const message = payload?.message || {};
      const normalized = {
        ...message,
        id: message._id || message.id || `msg-${tid}-${Date.now()}`,
        time: formatTime(message.createdAt)
      };

      setSelectedTicket(prev => {
        if (!prev || prev.id !== tid) return prev;
        const exists = prev.messages?.find(m => String(m.id) === String(normalized.id));
        if (exists) return prev;
        return { ...prev, messages: [...(prev.messages || []), normalized] };
      });
    });

    return () => {
      offMessage?.();
      const current = selectedTicketRoomRef.current;
      if (current) leaveTicketRoom(current, getToken);
      selectedTicketRoomRef.current = null;
    };
  }, [token, selectedTicket?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedTicket?.messages?.length, selectedImage]);

  const handleTicketSubmit = async (e) => {
    e.preventDefault();
    try {
      setTicketLoading(true);
      const res = await sellerApi.createTicket({
        ...newTicket,
        userType: "Seller"
      });
      if (res.data.success) {
        showToast("Support ticket raised successfully", "success");
        setIsTicketModalOpen(false);
        setNewTicket({ subject: "", description: "", priority: "medium" });
        await fetchTickets();
      }
    } catch (error) {
      showToast("Failed to raise ticket", "error");
    } finally {
      setTicketLoading(false);
    }
  };

  const handleSendReply = async () => {
    const text = String(reply || "").trim();
    if (!text && !selectedImageFile) return;
    if (isSending || !selectedTicket) return;

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

      await sellerApi.replyTicket(selectedTicket.id, text, {
        mediaUrl,
        mediaType,
        mimeType: selectedImageFile?.type || ""
      });

      setReply("");
      setSelectedImage(null);
      setSelectedImageFile(null);
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

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6 font-['Outfit']">
      {/* Left Sidebar: Tickets List */}
      <div className="lg:w-[380px] flex flex-col gap-4 h-full">
        <Card className="flex-1 flex flex-col border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-2xl overflow-hidden bg-white">
          <div className="p-6 border-b border-slate-50 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Support Desk</h2>
              <Button
                onClick={() => setIsTicketModalOpen(true)}
                className="bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-wider py-2.5 px-4 rounded-xl flex items-center gap-1.5"
              >
                <PlusCircle size={14} /> NEW TICKET
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-slate-400" size={24} />
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-10 text-xs font-bold text-slate-400">
                No tickets created yet. Need help? Raise a ticket above.
              </div>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className={`w-full text-left p-4 rounded-xl transition-all border relative overflow-hidden ${
                    selectedTicket?.id === t.id
                      ? "bg-slate-900 text-white shadow-lg border-black"
                      : "hover:bg-slate-50 hover:border-slate-300 bg-white border-slate-100 text-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                      t.priority === 'high' ? 'bg-red-100 text-red-700' : t.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {t.priority}
                    </span>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                      t.status === 'open' ? 'bg-emerald-100 text-emerald-700' : t.status === 'processing' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-800'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                  <h4 className="text-xs font-black truncate">{t.subject}</h4>
                  <p className={`text-[10px] font-bold mt-1 ${selectedTicket?.id === t.id ? "text-white/60" : "text-slate-400"}`}>
                    Opened on: {t.date}
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Right Pane: Live Support Chat Thread */}
      <div className="flex-1 flex flex-col h-full min-h-0">
        {selectedTicket ? (
          <Card className="flex-1 min-h-0 flex flex-col border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-2xl overflow-hidden bg-white">
            {/* Thread Header */}
            <div className="p-6 border-b border-slate-50 bg-slate-50/20 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-900">{selectedTicket.subject}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Ticket ID: {selectedTicket.id} • Status: {selectedTicket.status}
                </p>
              </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-slate-50/30 pb-36">
              {selectedTicket.messages.map((m) => {
                // If message is admin, render on left side. If seller, render on right side.
                const isMe = m.senderType !== "Admin";
                
    // Handle body scroll locking for modals
    React.useEffect(() => {
        const hasOpenModal = isTicketModalOpen;
        if (hasOpenModal) {
            document.body.style.overflow = 'hidden';
            if (window.lenis) window.lenis.stop();
        } else {
            document.body.style.overflow = '';
            if (window.lenis) window.lenis.start();
        }
        return () => {
            document.body.style.overflow = '';
            if (window.lenis) window.lenis.start();
        };
    }, [isTicketModalOpen]);

    return (
                  <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm ${
                        isMe
                          ? "bg-slate-900 text-white rounded-tr-none"
                          : "bg-white text-slate-700 border border-slate-200 rounded-tl-none"
                      }`}>
                        {m.mediaUrl && (
                          <img src={m.mediaUrl} alt="Attachment" className="max-w-[200px] rounded-lg mb-2" />
                        )}
                        {m.text}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 mt-1 px-1 uppercase tracking-widest">
                        {m.sender} • {m.time}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Send Reply Input bar */}
            <div className="p-4 border-t bg-white relative shrink-0 z-30">
              <AnimatePresence>
                {showEmojiPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-full left-4 mb-2 bg-white rounded-xl shadow-xl border p-3 grid grid-cols-6 gap-2 w-64 z-50 animate-in fade-in"
                  >
                    {emojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setReply(prev => prev + emoji)}
                        className="text-xl hover:bg-slate-50 p-1.5 rounded transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {selectedImage && (
                <div className="absolute bottom-full right-4 mb-2 bg-white rounded-xl shadow-lg border p-2 z-50 inline-block">
                  <img src={selectedImage} alt="Preview" className="h-20 w-20 object-cover rounded-lg" />
                  <button
                    onClick={() => { setSelectedImage(null); setSelectedImageFile(null); }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-2xl border-2 border-slate-800/60 focus-within:border-slate-900 transition-all">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50"
                >
                  <Smile size={20} />
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50"
                >
                  <Paperclip size={20} />
                </button>

                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                  placeholder="Message customer support..."
                  className="bg-transparent text-sm w-full py-2 outline-none text-slate-700 placeholder-slate-400 font-bold"
                />

                <button
                  onClick={handleSendReply}
                  disabled={(!reply.trim() && !selectedImageFile) || isSending}
                  className="p-3 bg-slate-900 hover:bg-black text-white rounded-xl disabled:opacity-50 transition-all shadow-md active:scale-95"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-5 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
            <div className="h-20 w-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6 ring-1 ring-slate-100">
              <MessageSquare className="h-8 w-8 text-slate-300" />
            </div>
            <h4 className="text-lg font-black text-slate-950 uppercase tracking-wide">Seller Support Desk</h4>
            <p className="text-xs font-bold text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed">
              Select an active query from the sidebar or raise a new ticket to chat live with our support team.
            </p>
          </div>
        )}
      </div>

      {/* Ticket Creation Modal */}
      <AnimatePresence>
        {isTicketModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTicketModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 overflow-hidden z-10 space-y-6"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-black text-slate-900">Raise Support Ticket</h3>
                <button
                  onClick={() => setIsTicketModalOpen(false)}
                  className="p-1 rounded-full hover:bg-slate-50 text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleTicketSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</label>
                  <input
                    type="text"
                    required
                    value={newTicket.subject}
                    onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                    placeholder="Enter support query subject"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-800 rounded-xl px-4 py-3 text-xs font-bold outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Priority</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["low", "medium", "high"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewTicket({ ...newTicket, priority: p })}
                        className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                          newTicket.priority === p
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                  <textarea
                    required
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                    placeholder="Describe your query in detail..."
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-800 rounded-xl px-4 py-3 text-xs font-bold min-h-[100px] outline-none transition-all resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={ticketLoading}
                  className="w-full bg-slate-900 hover:bg-black text-white font-black uppercase text-xs tracking-wider py-4 rounded-xl shadow-lg transition-all"
                >
                  {ticketLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={16} /> SUBMITTING...
                    </div>
                  ) : (
                    "SUBMIT TICKET"
                  )}
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HelpSupport;
