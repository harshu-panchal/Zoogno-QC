import React, { useEffect, useRef, useState } from 'react';
import { generateBagQRDataURL, printBagLabel } from '@shared/utils/qrBagUtils';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * QRCodeDisplay — Renders a QR code image for a given bagId.
 *
 * Props:
 *  bagId         — the bag identifier string to encode
 *  size          — display size in px (default 160)
 *  showActions   — show Download + Print buttons (default true)
 *  labelData     — order info for label printing { orderId, customerName, paymentMethod, total }
 *  className     — extra class names
 */
const QRCodeDisplay = ({
    bagId,
    size = 160,
    showActions = true,
    labelData,
    className,
}) => {
    const [dataUrl, setDataUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!bagId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        generateBagQRDataURL(bagId)
            .then((url) => {
                setDataUrl(url);
            })
            .catch((err) => {
                setError('Failed to generate QR');
                console.error(err);
            })
            .finally(() => setLoading(false));
    }, [bagId]);

    const handleDownload = () => {
        if (!dataUrl) return;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${bagId}.png`;
        a.click();
    };

    const handlePrint = async () => {
        if (!dataUrl) return;
        await printBagLabel(
            {
                bagId,
                orderId: labelData?.orderId || 'N/A',
                customerName: labelData?.customerName || 'Customer',
                paymentMethod: labelData?.paymentMethod || 'PREPAID',
                total: labelData?.total || 0,
            },
            dataUrl
        );
    };

    const handleRegenerate = () => {
        setLoading(true);
        generateBagQRDataURL(bagId)
            .then(setDataUrl)
            .catch(() => setError('Failed to generate QR'))
            .finally(() => setLoading(false));
    };

    if (!bagId) {
        return (
            <div
                className={cn('flex items-center justify-center bg-slate-100 rounded-xl text-slate-400 text-xs font-medium', className)}
                style={{ width: size, height: size }}
            >
                No Bag ID
            </div>
        );
    }

    return (
        <div className={cn('flex flex-col items-center gap-2', className)}>
            {/* QR image */}
            <div
                className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white p-2 shadow-sm"
                style={{ width: size + 16, height: size + 16 }}
            >
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                        <RefreshCw size={20} className="text-slate-400 animate-spin" />
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 text-xs font-bold text-center p-2">
                        <span>{error}</span>
                        <button
                            onClick={handleRegenerate}
                            className="mt-2 text-xs underline text-red-500"
                        >
                            Retry
                        </button>
                    </div>
                )}
                {dataUrl && !loading && (
                    <img
                        src={dataUrl}
                        alt={`QR for ${bagId}`}
                        width={size}
                        height={size}
                        className="object-contain"
                    />
                )}
            </div>

            {/* Bag ID label */}
            <p className="text-xs font-black text-slate-700 tracking-wider font-mono">
                {bagId}
            </p>

            {/* Action buttons */}
            {showActions && dataUrl && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                    >
                        <Download size={13} />
                        PNG
                    </button>
                    {labelData && (
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xs font-bold transition-colors"
                        >
                            <Printer size={13} />
                            Label
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default QRCodeDisplay;
