import React from 'react';
import { X, Printer, Download, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@core/context/SettingsContext';
import { generateInvoicePdf } from '@/shared/utils/invoiceGenerator';
import { generateAdminInvoicePdf } from '@/shared/utils/adminInvoiceGenerator';

const InvoiceModal = ({ isOpen, onClose, order }) => {
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const primaryColor = settings?.primaryColor || 'var(--primary)';
    if (!order) return null;

    // Normalize order data to handle both raw API responses and pre-mapped frontend models
    const displayOrderId = order.orderId || order.id || order._id || "N/A";
    const bill = {
        itemTotal: order.pricing?.subtotal || order.pricing?.itemTotal || order.bill?.itemTotal || 0,
        deliveryFee: order.pricing?.deliveryFee || order.bill?.deliveryFee || 0,
        tip: order.pricing?.tip || order.bill?.tip || 0,
        tax: order.pricing?.taxTotal || order.pricing?.gst || order.bill?.tax || 0,
        discount: order.pricing?.discount || order.bill?.discount || 0,
        grandTotal: order.pricing?.total || order.bill?.grandTotal || 0,
    };
    const items = (order.items || []).map(item => ({
        name: item.product?.name || item.name || 'Product',
        qty: item.quantity || item.qty || 1,
        price: item.price || 0,
    }));

    const handlePrint = () => {
        window.print();
    };

    const handleSaveCombinedPdf = async () => {
        try {
            // Generate the first invoice (Seller) but don't save yet
            const doc = await generateInvoicePdf(order, settings, true, null);
            
            // Add a new page for the platform invoice
            doc.addPage();
            
            // Generate the second invoice (Platform) on the new page
            await generateAdminInvoicePdf(order, settings, true, doc);
            
            // Finally save the combined PDF
            doc.save(`Complete_Invoice_${displayOrderId}.pdf`);
        } catch (error) {
            console.error("Failed to generate combined PDF:", error);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pb-20 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative flex flex-col max-h-[75vh]"
                        >
                            {/* Header */}
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-black text-slate-800">Invoice</h2>
                                    <p className="text-xs text-slate-500 font-medium">#{displayOrderId}</p>
                                </div>
                                <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-200 transition-colors shadow-sm border border-slate-100">
                                    <X size={20} className="text-slate-500" />
                                </button>
                            </div>

                            {/* Printable Area */}
                            <div className="p-4 sm:p-8 space-y-6 overflow-y-auto flex-1" id="printable-invoice">
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                    <div className="max-w-full sm:max-w-[65%]">
                                        {appName.toLowerCase() === 'zoogno' ? (
                                            <h1 className="text-2xl font-black tracking-tight flex items-center">
                                                <span style={{ color: primaryColor }}>Zoog</span>
                                                <span style={{ color: '#135d1f' }}>no</span>
                                            </h1>
                                        ) : (
                                            <h1 className="text-2xl font-black tracking-tight" style={{ color: primaryColor }}>{appName}</h1>
                                        )}
                                        <p className="text-xs text-slate-500 mt-1 break-words">{settings?.companyName || 'Quick Commerce'}<br />{settings?.address || '—'}</p>
                                    </div>
                                    <div className="text-left sm:text-right">
                                        <p className="text-sm font-bold text-slate-800">Bill To:</p>
                                        <p className="text-xs text-slate-500 mt-1">{order.address.name}<br />{order.address.phone}</p>
                                    </div>
                                </div>

                                <div className="border rounded-xl overflow-hidden border-slate-100">
                                    <table className="w-full text-sm text-left table-fixed">
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                                            <tr>
                                                <th className="px-4 py-3 w-[60%] sm:w-[70%]">Item</th>
                                                <th className="px-4 py-3 text-right w-[20%] sm:w-[15%]">Qty</th>
                                                <th className="px-4 py-3 text-right w-[20%] sm:w-[15%]">Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-4 py-3 text-slate-700 font-medium break-words">{item.name}</td>
                                                    <td className="px-4 py-3 text-slate-500 text-right">{item.qty}</td>
                                                    <td className="px-4 py-3 text-slate-800 font-bold text-right whitespace-nowrap">₹{item.price}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>Subtotal</span>
                                        <span>₹{bill.itemTotal}</span>
                                    </div>
                                    {bill.deliveryFee > 0 && (
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>Delivery Fee</span>
                                            <span>₹{bill.deliveryFee}</span>
                                        </div>
                                    )}
                                    {bill.tax > 0 && (
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>Tax</span>
                                            <span>₹{bill.tax}</span>
                                        </div>
                                    )}
                                    {bill.tip > 0 && (
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>Tip</span>
                                            <span>₹{bill.tip}</span>
                                        </div>
                                    )}
                                    {bill.discount > 0 && (
                                        <div className="flex justify-between text-sm text-red-500">
                                            <span>Discount</span>
                                            <span>-₹{bill.discount}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-base font-black text-slate-800 pt-2 border-t border-slate-100">
                                        <span>Total Paid</span>
                                        <span>₹{bill.grandTotal}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                                <button onClick={handlePrint} className="flex-1 py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg" style={{ backgroundColor: primaryColor }}>
                                    <Printer size={18} /> Print
                                </button>
                                <button onClick={handleSaveCombinedPdf} className="flex-1 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
                                    <Download size={18} /> Save PDF
                                </button>
                            </div>

                            <style>
                                {`
                                    @media print {
                                        body * { visibility: hidden; }
                                        #printable-invoice, #printable-invoice * { visibility: visible; }
                                        #printable-invoice { position: absolute; left: 0; top: 0; width: 100%; }
                                    }
                                `}
                            </style>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default InvoiceModal;

