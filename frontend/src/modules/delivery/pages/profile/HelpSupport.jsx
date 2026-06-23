import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  X,
  Send,
  Loader2
} from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { motion, AnimatePresence } from "framer-motion";
import { deliveryApi } from "../../services/deliveryApi";
import DeliveryOrderChatModal from "../../components/DeliveryOrderChatModal";
import DeliveryTicketChatModal from "../../components/DeliveryTicketChatModal";
import { useSettings } from "@core/context/SettingsContext";
import { useToast } from "@shared/components/ui/Toast";

const HelpSupport = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { showToast } = useToast();
  
  const supportPhone = settings?.supportPhone || "+91 98765 43210";

  const faqs = [
    {
      question: "How do I change my bank account details?",
      answer: "Go to Profile > Bank Account and tap on 'Request Change'. You will need to upload a cancelled cheque or passbook copy for verification.",
    },
    {
      question: "What if I can't find the customer's location?",
      answer: "Use the in-app map navigation. If you're still stuck, you can call the customer directly using the 'Call' button on the order screen.",
    },
    {
      question: "How are my earnings calculated?",
      answer: "Earnings are based on base fare + distance pay + surge pricing (if applicable). You can view detailed breakdown in the Earnings tab.",
    },
    {
      question: "I had an accident during delivery. What to do?",
      answer: "Use the SOS button immediately in the Safety section. Our emergency response team will contact you and provide assistance.",
    },
  ];

  const [openIndex, setOpenIndex] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const [selectedChatOrder, setSelectedChatOrder] = useState(null);
  
  // Support Tickets State
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [newTicket, setNewTicket] = useState({
    subject: "",
    description: "",
    priority: "medium"
  });
  const [isChatListModalOpen, setIsChatListModalOpen] = useState(false);
  const [activeChatTab, setActiveChatTab] = useState("support"); // "support" | "customer"
  const [customerChats, setCustomerChats] = useState([]);
  const [customerChatsLoading, setCustomerChatsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchActiveChats = async () => {
      try {
        const res = await deliveryApi.getAssignedOrders();
        if (mounted && res.data?.result) {
          const active = res.data.result.filter(o => 
            o.status === "packed" || o.status === "out_for_delivery"
          );
          setActiveOrders(active);
        }
      } catch (err) {
        console.error("Failed to fetch assigned orders", err);
      }
    };
    fetchActiveChats();
    return () => { mounted = false; };
  }, []);

  const fetchTickets = async () => {
    try {
      setTicketsLoading(true);
      const res = await deliveryApi.getMyTickets();
      if (res.data.success) {
        const list = res.data.result || [];
        setTickets(list.map(t => ({
          ...t,
          id: t._id,
          date: new Date(t.createdAt).toLocaleDateString()
        })));
      }
    } catch (error) {
      console.error("Failed to load tickets", error);
    } finally {
      setTicketsLoading(false);
    }
  };

  const fetchCustomerChats = async () => {
    try {
      setCustomerChatsLoading(true);
      const res = await deliveryApi.getMyChats();
      if (res.data.success) {
        setCustomerChats(res.data.result || []);
      }
    } catch (error) {
      console.error("Failed to load customer chats", error);
    } finally {
      setCustomerChatsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchCustomerChats();
  }, []);

  const toggleAccordion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const handleTicketSubmit = async (e) => {
    e.preventDefault();
    try {
      setTicketLoading(true);
      const res = await deliveryApi.createTicket({
        ...newTicket,
        userType: "Delivery"
      });
      if (res.data.success) {
        showToast("Support ticket raised successfully", "success");
        setIsTicketModalOpen(false);
        setNewTicket({ subject: "", description: "", priority: "medium" });
        await fetchTickets();
      }
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to raise ticket", "error");
    } finally {
      setTicketLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Help & Support</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Support Channels */}
        <section className="grid grid-cols-2 gap-4">
          <Card 
            className="p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setIsTicketModalOpen(true)}
          >
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 mb-3">
              <PlusCircle size={24} />
            </div>
            <h4 className="font-bold text-gray-800 text-sm">Raise Ticket</h4>
          </Card>
          
          <a href={`tel:${supportPhone}`} className="block h-full">
            <Card className="p-4 flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow h-full">
              <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 mb-3">
                <Phone size={24} />
              </div>
              <h4 className="font-bold text-gray-800 text-sm">Call Support</h4>
            </Card>
          </a>
        </section>



        {/* Active Customer Chats */}
        {activeOrders.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <MessageCircle size={20} className="mr-2 text-brand-600" /> Active Customer Chats
            </h2>
            <div className="space-y-3">
              {activeOrders.map(order => (
                <Card 
                  key={order.orderId} 
                  className="p-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow bg-brand-50 border border-brand-100"
                  onClick={() => setSelectedChatOrder(order)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-200 rounded-full flex items-center justify-center text-brand-700 font-bold">
                      {(order.shippingAddress?.fullName || "C")[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{order.shippingAddress?.fullName || "Customer"}</h4>
                      <p className="text-xs text-brand-600 font-medium">Order #{order.orderId}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="border-brand-300 text-brand-700 hover:bg-brand-100">
                    Chat
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* FAQs */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <HelpCircle size={20} className="mr-2 text-primary" /> Frequently
            Asked Questions
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <Card
                key={index}
                className="overflow-hidden cursor-pointer"
                onClick={() => toggleAccordion(index)}>
                <div className="p-4 flex justify-between items-center bg-white">
                  <h4 className="font-medium text-gray-800 text-sm pr-4">
                    {faq.question}
                  </h4>
                  {openIndex === index ? (
                    <ChevronUp size={18} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={18} className="text-gray-400" />
                  )}
                </div>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-gray-50">
                      <div className="p-4 text-sm text-gray-600 border-t border-gray-100 leading-relaxed">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))}
          </div>
        </section>

      </div>

      <DeliveryOrderChatModal
        isOpen={!!selectedChatOrder}
        onClose={() => setSelectedChatOrder(null)}
        orderId={selectedChatOrder?.orderId}
        customerName={selectedChatOrder?.shippingAddress?.fullName}
      />

      <DeliveryTicketChatModal
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        ticket={selectedTicket}
      />

      {/* Chat List Modal */}
      <AnimatePresence>
        {isChatListModalOpen && (
          <div className="fixed inset-0 z-[9998] flex flex-col bg-white">
            <div className="bg-white shadow-sm sticky top-0 z-10">
              <div className="flex items-center p-4 border-b border-gray-100">
                <button
                  onClick={() => setIsChatListModalOpen(false)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2">
                  <ArrowLeft size={20} className="text-gray-600" />
                </button>
                <h2 className="ds-h3 text-gray-900">My Chats</h2>
              </div>
              <div className="flex px-4 py-2 gap-4 border-b border-gray-100">
                <button 
                  className={`pb-2 text-sm font-bold border-b-2 transition-colors ${activeChatTab === "support" ? "border-primary text-primary" : "border-transparent text-gray-500"}`}
                  onClick={() => setActiveChatTab("support")}
                >
                  Support Tickets
                </button>
                <button 
                  className={`pb-2 text-sm font-bold border-b-2 transition-colors ${activeChatTab === "customer" ? "border-primary text-primary" : "border-transparent text-gray-500"}`}
                  onClick={() => setActiveChatTab("customer")}
                >
                  Customer Chats
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0 bg-white">
              {activeChatTab === "support" && (
                <div className="divide-y divide-gray-100">
                  {ticketsLoading ? (
                    <div className="text-center py-6 text-xs font-bold text-gray-400">Loading support chats...</div>
                  ) : tickets.length > 0 ? (
                    tickets.map(t => (
                      <div 
                        key={t.id} 
                        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          setSelectedTicket(t);
                        }}
                      >
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0 relative">
                          <MessageCircle size={20} className="text-primary" />
                          {t.status === 'open' && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-0.5">
                            <h4 className="font-bold text-gray-900 truncate">Admin Support</h4>
                            <span className="text-[10px] text-gray-400 font-medium shrink-0 ml-2">{t.date}</span>
                          </div>
                          <p className="text-xs text-gray-500 truncate mb-1">Subject: {t.subject}</p>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded inline-block ${
                            t.status === 'open' ? 'bg-emerald-100 text-emerald-700' : t.status === 'processing' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center flex flex-col items-center justify-center">
                       <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                         <MessageCircle size={24} className="text-gray-300" />
                       </div>
                       <h3 className="text-sm font-bold text-gray-800 mb-1">No support chats</h3>
                       <p className="text-xs text-gray-500 font-medium mb-4 text-center max-w-[200px]">You haven't contacted admin support yet.</p>
                       <Button variant="outline" size="sm" className="border-primary text-primary hover:bg-primary/5 font-bold rounded-full px-6" onClick={() => {
                         setIsChatListModalOpen(false);
                         setIsTicketModalOpen(true);
                       }}>Start New Chat</Button>
                    </div>
                  )}
                </div>
              )}

              {activeChatTab === "customer" && (
                <div className="divide-y divide-gray-100">
                  {customerChatsLoading ? (
                    <div className="text-center py-6 text-xs font-bold text-gray-400">Loading customer chats...</div>
                  ) : customerChats.length > 0 ? (
                    customerChats.map(chat => (
                      <div 
                        key={chat._id} 
                        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          setSelectedChatOrder({ orderId: chat.orderId, shippingAddress: { fullName: chat.customer?.name || "Customer" } });
                        }}
                      >
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold text-lg shrink-0">
                          {(chat.customer?.name || "C")[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-0.5">
                            <h4 className="font-bold text-gray-900 truncate">{chat.customer?.name || "Customer"}</h4>
                            {chat.lastMessage && (
                              <span className="text-[10px] text-gray-400 font-medium shrink-0 ml-2">
                                {new Date(chat.lastMessage.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-xs text-gray-500 truncate pr-2">
                              {chat.lastMessage ? chat.lastMessage.text || "Photo" : "No messages yet"}
                            </p>
                          </div>
                          <p className="text-[10px] text-primary font-bold mt-1">Order #{chat.orderId}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center flex flex-col items-center justify-center">
                       <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                         <MessageCircle size={24} className="text-gray-300" />
                       </div>
                       <h3 className="text-sm font-bold text-gray-800 mb-1">No customer chats</h3>
                       <p className="text-xs text-gray-500 font-medium text-center max-w-[200px]">You have no recent chat history with any customers.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Ticket Creation Modal */}
      <AnimatePresence>
        {isTicketModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTicketModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 overflow-hidden z-10 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <h3 className="text-xl font-black text-gray-900">Raise Support Ticket</h3>
                <button
                  onClick={() => setIsTicketModalOpen(false)}
                  className="p-2 rounded-full hover:bg-gray-50 text-gray-400 hover:text-gray-600 bg-gray-50/50"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleTicketSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Subject</label>
                  <input
                    type="text"
                    required
                    value={newTicket.subject}
                    onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                    placeholder="Enter support query subject"
                    className="w-full bg-gray-50 border border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl px-4 py-3.5 text-sm font-bold outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Priority</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["low", "medium", "high"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewTicket({ ...newTicket, priority: p })}
                        className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          newTicket.priority === p
                            ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                            : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Description</label>
                  <textarea
                    required
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                    placeholder="Describe your query in detail..."
                    className="w-full bg-gray-50 border border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl px-4 py-3 text-sm font-bold min-h-[120px] outline-none transition-all resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={ticketLoading}
                  className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black uppercase text-sm tracking-wider rounded-2xl shadow-xl shadow-primary/20 transition-all"
                >
                  {ticketLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={18} /> SUBMITTING...
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
