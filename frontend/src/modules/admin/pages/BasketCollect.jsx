import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShoppingBasket, QrCode, CheckCircle, Package, User, RotateCcw } from 'lucide-react';
import axiosInstance from '@core/api/axios';
import { toast } from 'sonner';

const BasketCollect = () => {
    const [basketId, setBasketId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [scannedData, setScannedData] = useState(null);

    const handleCollect = async (e) => {
        e.preventDefault();
        if (!basketId.trim()) return;

        setIsLoading(true);
        try {
            const res = await axiosInstance.post('/admin/baskets/collect', {
                basketId: basketId.trim()
            });

            if (res.data.success) {
                toast.success('Basket collected successfully!');
                setScannedData(res.data.result);
                setBasketId('');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to collect basket');
            setScannedData(null);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-100 text-teal-600 rounded-xl">
                    <ShoppingBasket size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Collect Baskets</h1>
                    <p className="text-slate-500">Scan or enter basket ID returned by delivery boys</p>
                </div>
            </div>

            <Card className="shadow-sm border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <QrCode size={18} />
                        Scan / Enter Basket ID
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCollect} className="flex gap-3">
                        <Input 
                            placeholder="e.g. BSK-ABCD1234" 
                            value={basketId}
                            onChange={(e) => setBasketId(e.target.value.toUpperCase())}
                            className="flex-1 max-w-md h-12"
                            autoFocus
                        />
                        <Button type="submit" disabled={isLoading || !basketId} className="h-12 px-8 bg-teal-600 hover:bg-teal-700">
                            {isLoading ? 'Processing...' : 'Collect'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {scannedData && (
                <Card className="border-green-200 bg-green-50 shadow-sm animate-in fade-in slide-in-from-bottom-4">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="text-green-600" size={24} />
                            </div>
                            <div className="space-y-4 flex-1">
                                <div>
                                    <h3 className="text-xl font-bold text-green-900">Successfully Collected</h3>
                                    <p className="text-green-700 font-medium">Basket ID: {scannedData.basketId}</p>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                                        <div className="text-sm text-slate-500 mb-1 flex items-center gap-2">
                                            <RotateCcw size={14} /> Reuse Count
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">{scannedData.reuseCount} times</div>
                                    </div>
                                    
                                    {scannedData.lastOrderDetails ? (
                                        <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                                            <div className="text-sm text-slate-500 mb-1 flex items-center gap-2">
                                                <Package size={14} /> Last Used Order
                                            </div>
                                            <div className="font-bold text-slate-800">#{scannedData.lastOrderDetails.orderId}</div>
                                            <div className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                                                <User size={12} /> Boy: {scannedData.lastOrderDetails.deliveryBoyName}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                                            <div className="text-sm text-slate-500 mb-1">Last Used Info</div>
                                            <div className="text-slate-400 text-sm">No recent order history</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default BasketCollect;
