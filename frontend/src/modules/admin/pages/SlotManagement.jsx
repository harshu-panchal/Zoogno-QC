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

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCreate = async (e) => {
        e.preventDefault();
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
        <div className="p-6 max-w-5xl mx-auto min-h-screen bg-gray-50 flex flex-col gap-6">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Slot Management</h1>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4">Create New Slot</h2>
                <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-bold text-gray-600">Start Time</label>
                        <input name="startTime" value={formData.startTime} onChange={handleChange} className="p-2 border rounded-xl" placeholder="e.g. 08:00 AM" required />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-bold text-gray-600">End Time</label>
                        <input name="endTime" value={formData.endTime} onChange={handleChange} className="p-2 border rounded-xl" placeholder="e.g. 10:00 AM" required />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-bold text-gray-600">Duration (mins)</label>
                        <input name="duration" type="number" value={formData.duration} onChange={handleChange} className="p-2 border rounded-xl" required />
                    </div>
                    <button type="submit" className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-bold shadow-md">Create Slot</button>
                </form>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
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
                                <tr><td colSpan="4" className="p-8 text-center text-gray-500">No slots created yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default SlotManagement;
