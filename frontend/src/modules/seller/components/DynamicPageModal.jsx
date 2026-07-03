import React, { useState, useEffect } from 'react';
import { X, FileText } from 'lucide-react';
import { sellerApi } from '../services/sellerApi';
import Loader from '../../../shared/components/ui/Loader';
import DOMPurify from 'dompurify';

const DynamicPageModal = ({ isOpen, onClose, slug, title }) => {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && slug) {
            fetchPageContent();
        }
    }, [isOpen, slug]);

    const fetchPageContent = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await sellerApi.getPublicPage(slug);
            const rawContent = response.data?.result?.content || 'No content available for this page.';
            // Sanitize the HTML content before rendering to prevent XSS
            setContent(DOMPurify.sanitize(rawContent));
        } catch (err) {
            console.error('Failed to fetch page:', err);
            setError('This page is currently unavailable. Please try again later.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
            <div 
                className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white/50 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
                            <FileText size={20} className="stroke-[2.5]" />
                        </div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">{title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar bg-slate-50/50 flex-1 relative">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader size="md" />
                            <p className="text-sm font-bold text-slate-400 animate-pulse">Loading {title}...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-20 px-6">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText size={28} />
                            </div>
                            <h3 className="text-lg font-black text-slate-800 mb-2">Unavailable</h3>
                            <p className="text-slate-500 font-medium">{error}</p>
                        </div>
                    ) : (
                        <div 
                            className="prose prose-slate prose-sm md:prose-base max-w-none 
                            prose-headings:font-black prose-headings:tracking-tight prose-headings:text-slate-800
                            prose-p:text-slate-600 prose-p:leading-relaxed prose-p:font-medium
                            prose-a:text-brand-600 prose-a:font-bold prose-a:no-underline hover:prose-a:underline
                            prose-strong:text-slate-800 prose-strong:font-black
                            prose-ul:list-disc prose-ol:list-decimal prose-li:text-slate-600 prose-li:font-medium"
                            dangerouslySetInnerHTML={{ __html: content }}
                        />
                    )}
                </div>
                
                {/* Footer */}
                <div className="p-5 border-t border-slate-100 bg-white flex justify-end sticky bottom-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white text-sm font-black uppercase tracking-wider rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DynamicPageModal;
