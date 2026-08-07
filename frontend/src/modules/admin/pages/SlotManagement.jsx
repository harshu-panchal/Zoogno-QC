import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';

const SlotManagement = () => {
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        startTime: '08:00 AM',
        endTime: '10:00 AM',
        duration: 120,
        maxSlotsPerDay: 5
    });

    const fetchSlots = async () => {
        try {
            const res = await adminApi.getSlots();
            if (res.data.success) {
                setSlots(res.data.slots);
            }
        } catch (error) {
            toast.error('Failed to fetch slots');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSlots();
    }, []);

    const TimeSelect = ({ label, value, onChange }) => {
        const match = value?.match(/(\d+):(\d+)\s*(AM|PM)/i);
        const hour = match ? match[1].padStart(2, '0') : '08';
        const minute = match ? match[2].padStart(2, '0') : '00';
        const ampm = match ? match[3].toUpperCase() : 'AM';

        const handleTimeChange = (type, val) => {
            let newHour = hour;
            let newMin = minute;
            let newAmPm = ampm;
            if (type === 'h') newHour = val.padStart(2, '0');
            if (type === 'm') newMin = val.padStart(2, '0');
            if (type === 'a') newAmPm = val;
            onChange(`${newHour}:${newMin} ${newAmPm}`);
        };

        return (
            <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-gray-600">{label}</label>
                <div className="flex items-center gap-1 p-2 border rounded-xl bg-white focus-within:ring-2 focus-within:ring-[#116A29]/20 focus-within:border-[#116A29]">
                    <select value={hour} onChange={e => handleTimeChange('h', e.target.value)} className="outline-none bg-transparent text-center font-medium cursor-pointer">
                        {Array.from({length: 12}, (_, i) => {
                            const h = (i === 0 ? 12 : i).toString().padStart(2, '0');
                            return <option key={h} value={h}>{h}</option>;
                        })}
                    </select>
                    <span className="font-bold text-gray-400">:</span>
                    <select value={minute} onChange={e => handleTimeChange('m', e.target.value)} className="outline-none bg-transparent text-center font-medium cursor-pointer">
                        {['00', '15', '30', '45'].map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                    <select value={ampm} onChange={e => handleTimeChange('a', e.target.value)} className="outline-none bg-gray-100 rounded text-sm font-bold ml-2 text-gray-700 cursor-pointer px-1 py-0.5">
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                    </select>
                </div>
            </div>
        );
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        
        // Check for duplicate on the frontend
        const isDuplicate = slots.some(slot => slot.startTime === formData.startTime && slot.endTime === formData.endTime);
        if (isDuplicate) {
            toast.error("A slot with this time already exists!");
            return;
        }

        try {
            await adminApi.createSlot(formData);
            toast.success('Slot created');
            fetchSlots();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create slot');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this slot?")) return;
        try {
            await adminApi.deleteSlot(id);
            toast.success('Slot deleted');
            fetchSlots();
        } catch (error) {
            toast.error('Failed to delete slot');
        }
    };

    const toggleStatus = async (id, currentStatus) => {
        try {
            await adminApi.updateSlot(id, { isActive: !currentStatus });
            toast.success('Slot updated');
            fetchSlots();
        } catch (error) {
            toast.error('Failed to update slot');
        }
    };

    return (
        <div className="p-4 max-w-5xl mx-auto min-h-screen bg-gray-50 flex flex-col gap-4">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Slot Management</h1>

            <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4">Create New Slot</h2>
                <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end">
                    <TimeSelect 
                        label="Start Time" 
                        value={formData.startTime} 
                        onChange={(val) => setFormData({ ...formData, startTime: val })} 
                    />
                    <TimeSelect 
                        label="End Time" 
                        value={formData.endTime} 
                        onChange={(val) => setFormData({ ...formData, endTime: val })} 
                    />
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-bold text-gray-600">Duration (mins)</label>
                        <input name="duration" type="number" value={formData.duration} onChange={handleChange} className="p-2 border rounded-xl" required />
                    </div>
                    <button type="submit" className="bg-[#116A29] hover:bg-[#0e5621] text-white rounded-lg font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 px-5 py-2.5 active:scale-95 text-sm">Create Slot</button>
                </form>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-5 text-center text-gray-500">Loading...</div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-600 text-sm border-b">
                                <th className="p-4 font-bold">Time Window</th>
                                <th className="p-4 font-bold">Duration</th>
                                <th className="p-4 font-bold">Status</th>
                                <th className="p-4 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {slots.map(slot => (
                                <tr key={slot._id} className="border-b last:border-0 hover:bg-gray-50/50">
                                    <td className="p-4 font-bold text-gray-900">{slot.startTime} - {slot.endTime}</td>
                                    <td className="p-4 text-gray-600">{slot.duration} mins</td>
                                    <td className="p-4">
                                        <button 
                                            onClick={() => toggleStatus(slot._id, slot.isActive)}
                                            className={`px-3 py-1 text-xs font-bold rounded-full ${slot.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                                        >
                                            {slot.isActive ? 'ACTIVE' : 'INACTIVE'}
                                        </button>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => handleDelete(slot._id)} className="text-red-500 font-bold hover:underline text-sm">Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {slots.length === 0 && (
                                <tr><td colSpan="4" className="p-5 text-center text-gray-500">No slots created yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default SlotManagement;
