import React, { useState, useEffect } from 'react';

import { adminApi } from '../services/adminApi';
import { BarChart as LucideBarChart, Users, CheckCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444'];

const SlotAnalytics = () => {
    const [stats, setStats] = useState({
        totalBooked: 0,
        activeDrivers: 0,
        totalCompleted: 0,
        utilizationRate: 0,
        statusDistribution: [],
        dailyBookings: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await adminApi.getSlotAnalytics();
                if (res.data.success) {
                    setStats(res.data.data);
                }
            } catch (error) {
                toast.error('Failed to load analytics');
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
        
        // Refresh every 30 seconds
        const intervalId = setInterval(fetchAnalytics, 30000);
        return () => clearInterval(intervalId);
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto min-h-screen bg-gray-50 flex flex-col gap-6">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Slot Analytics</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-4 bg-brand-50 text-brand-600 rounded-2xl">
                        <LucideBarChart className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Booked</p>
                        <p className="text-3xl font-black text-gray-900">{stats.totalBooked}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Active Drivers</p>
                        <p className="text-3xl font-black text-gray-900">{stats.activeDrivers}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-4 bg-green-50 text-green-600 rounded-2xl">
                        <CheckCircle className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Completed Slots</p>
                        <p className="text-3xl font-black text-gray-900">{stats.totalCompleted}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
                        <Zap className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Utilization</p>
                        <p className="text-3xl font-black text-gray-900">{stats.utilizationRate}%</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col min-h-[400px]">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Slot Utilization Over Time</h3>
                    <div className="flex-1">
                        {stats.dailyBookings?.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.dailyBookings}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} />
                                    <Tooltip cursor={{fill: '#F3F4F6'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                    <Bar dataKey="bookings" fill="#4F46E5" radius={[6, 6, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400">No booking data available</div>
                        )}
                    </div>
                </div>

                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col min-h-[400px]">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Slot Status Distribution</h3>
                    <div className="flex-1 flex justify-center items-center">
                        {stats.statusDistribution?.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.statusDistribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={120}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.statusDistribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400">No distribution data available</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SlotAnalytics;
