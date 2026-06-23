import React, { useState, useEffect } from 'react';
import { deliveryApi } from '../services/deliveryApi';
import { toast } from 'sonner';
import { CalendarDays, Clock, CheckCircle } from 'lucide-react';

const AvailableSlots = () => {
    const [slots, setSlots] = useState([]);
    const [driverSlots, setDriverSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bookingId, setBookingId] = useState(null);
    
    // Default to today
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });

    // Also allow tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const fetchSlots = async () => {
        try {
            const [availableRes, driverRes] = await Promise.all([
                deliveryApi.getAvailableSlots(),
                deliveryApi.getDriverSlots()
            ]);
            
            if (availableRes.data.success) {
                setSlots(availableRes.data.slots);
            }
            if (driverRes.data.success) {
                setDriverSlots(driverRes.data.slots);
            }
        } catch (error) {
            toast.error('Failed to load slots');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSlots();
    }, []);

    const handleBook = async (slotId) => {
        try {
            setBookingId(slotId);
            const res = await deliveryApi.bookSlot({
                slotId,
                date: selectedDate
            });
            if (res.data.success) {
                toast.success('Slot booked successfully!');
                fetchSlots(); // Refetch to update UI with booked status
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to book slot');
        } finally {
            setBookingId(null);
        }
    };

    if (loading) return <div className="p-4 text-center mt-20">Loading available slots...</div>;

    return (
        <div className="pb-24 pt-4 px-4 max-w-lg mx-auto min-h-screen bg-gray-50 flex flex-col gap-6">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Available Slots</h1>

            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                    onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                    className={`flex-shrink-0 px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm ${selectedDate === new Date().toISOString().split('T')[0] ? 'bg-gray-900 text-white shadow-gray-900/30' : 'bg-white text-gray-600 border border-gray-200'}`}
                >
                    Today
                </button>
                <button 
                    onClick={() => setSelectedDate(tomorrowStr)}
                    className={`flex-shrink-0 px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm ${selectedDate === tomorrowStr ? 'bg-gray-900 text-white shadow-gray-900/30' : 'bg-white text-gray-600 border border-gray-200'}`}
                >
                    Tomorrow
                </button>
            </div>

            <div className="flex flex-col gap-4">
                {slots.map(slot => {
                    const isBooked = driverSlots.some(ds => 
                        ds.date === selectedDate && 
                        ds.status !== 'CANCELLED' && 
                        (ds.slotId?._id === slot._id || ds.slotId === slot._id)
                    );
                    
                    return (
                        <div key={slot._id} className={`p-5 rounded-3xl shadow-sm border flex flex-col gap-4 transition-all ${isBooked ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl ${isBooked ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-800'}`}>
                                    <Clock className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 text-lg">{slot.startTime} - {slot.endTime}</p>
                                    <p className="text-sm font-medium text-gray-500">{slot.duration / 60} Hours</p>
                                </div>
                            </div>
                            {isBooked ? (
                                <div className="w-full py-3 bg-gray-200 text-gray-800 rounded-xl font-bold shadow-sm text-center flex justify-center items-center gap-2">
                                    <CheckCircle size={18} strokeWidth={2.5} /> Booked
                                </div>
                            ) : (
                                <button 
                                    onClick={() => handleBook(slot._id)}
                                    disabled={bookingId === slot._id}
                                    className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-bold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    {bookingId === slot._id ? 'Booking...' : 'Book Slot'}
                                </button>
                            )}
                        </div>
                    );
                })}
                
                {slots.length === 0 && (
                    <div className="text-center p-8 bg-white rounded-3xl border border-gray-100 shadow-sm mt-4">
                        <CalendarDays className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No slots available right now.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AvailableSlots;
