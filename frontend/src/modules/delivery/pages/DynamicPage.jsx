import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { ArrowLeft } from 'lucide-react';
import axiosInstance from '@core/api/axios'; // Or use deliveryApi if available

const DynamicPage = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [pageContent, setPageContent] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPage = async () => {
            try {
                const response = await axiosInstance.get(`/pages/public/${slug}`);
                if (response.data.success && response.data.result) {
                    setPageContent(response.data.result);
                } else {
                    setError('Page not found');
                }
            } catch (err) {
                setError('Failed to load content');
            } finally {
                setIsLoading(false);
            }
        };

        if (slug) fetchPage();
    }, [slug]);

    return (
        <div className="min-h-screen bg-[#F0F4FF] font-['Poppins',_sans-serif]">
            {/* Header */}
            <div className="bg-white px-5 py-4 flex items-center shadow-sm sticky top-0 z-50">
                <button 
                    onClick={() => navigate(-1)} 
                    className="p-2 -ml-2 text-slate-700 active:bg-slate-100 rounded-full transition-colors"
                >
                    <ArrowLeft className="h-6 w-6" />
                </button>
                <h1 className="text-lg font-bold text-slate-800 ml-2">
                    {pageContent?.title || (isLoading ? 'Loading...' : 'Page')}
                </h1>
            </div>

            {/* Content Container */}
            <div className="p-5">
                <div className="bg-white rounded-2xl shadow-sm p-6 min-h-[70vh]">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1950A3]"></div>
                        </div>
                    ) : error ? (
                        <div className="text-center text-red-500 font-medium py-10">
                            {error}
                        </div>
                    ) : (
                        <div 
                            className="prose prose-sm max-w-none prose-p:text-slate-600 prose-headings:text-slate-800 prose-a:text-[#1950A3]"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(pageContent.content) }} 
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default DynamicPage;
