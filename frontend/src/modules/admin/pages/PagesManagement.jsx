import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import { Plus, Edit3, Trash2, Save, FileText, CheckCircle2 } from 'lucide-react';
import { useToast } from '@shared/components/ui/Toast';
import adminContentApi from '../services/api/contentApi';
import JoditEditor from 'jodit-react';
import { useRef } from 'react';

const PagesManagement = () => {
    const { showToast } = useToast();
    const [pages, setPages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPageId, setEditingPageId] = useState(null);
    const editor = useRef(null);

    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        content: '',
        isPublished: false,
        targetApp: 'global'
    });

    useEffect(() => {
        fetchPages();
    }, []);

    const fetchPages = async () => {
        setIsLoading(true);
        try {
            const response = await adminContentApi.getPages();
            setPages(response.data.result || []);
        } catch (error) {
            showToast('Failed to fetch pages', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (page = null) => {
        if (page) {
            setFormData({
                title: page.title,
                slug: page.slug,
                content: page.content,
                isPublished: page.isPublished,
                targetApp: page.targetApp || 'global'
            });
            setEditingPageId(page._id);
        } else {
            setFormData({ title: '', slug: '', content: '', isPublished: false, targetApp: 'global' });
            setEditingPageId(null);
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (editingPageId) {
                await adminContentApi.updatePage(editingPageId, formData);
                showToast('Page updated successfully', 'success');
            } else {
                await adminContentApi.createPage(formData);
                showToast('Page created successfully', 'success');
            }
            fetchPages();
            setIsModalOpen(false);
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to save page', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this page?')) return;
        try {
            await adminContentApi.deletePage(id);
            fetchPages();
            showToast('Page deleted successfully', 'success');
        } catch (error) {
            showToast('Failed to delete page', 'error');
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in pb-12">
            <div className="flex justify-between items-center px-1 mb-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Legal Pages Management
                        <div className="p-2 bg-brand-100 rounded-xl">
                            <FileText className="h-5 w-5 text-brand-600" />
                        </div>
                    </h1>
                    <p className="ds-description mt-1">Manage Terms & Conditions, Privacy Policy, etc.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-5 py-3 bg-brand-600 text-white rounded-2xl text-xs font-bold hover:bg-brand-700 transition-all shadow-lg active:scale-95"
                >
                    <Plus className="h-4 w-4" />
                    CREATE PAGE
                </button>
            </div>

            <div className="space-y-4">
                {isLoading ? (
                    <div className="text-center py-10 text-slate-500">Loading pages...</div>
                ) : pages.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">No pages found. Create one to get started.</div>
                ) : (
                    pages.map(page => (
                        <Card key={page._id} className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white">
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-black text-slate-900">{page.title}</h3>
                                        {(() => {
                                            switch(page.targetApp) {
                                                case 'seller': return <Badge variant="warning" className="text-[9px] font-black uppercase bg-orange-100 text-orange-700 border-none">Seller App</Badge>;
                                                case 'driver': return <Badge variant="info" className="text-[9px] font-black uppercase bg-blue-100 text-blue-700 border-none">Driver App</Badge>;
                                                case 'customer': return <Badge variant="primary" className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 border-none">Customer App</Badge>;
                                                default: return <Badge variant="secondary" className="text-[9px] font-black uppercase border-none">Global</Badge>;
                                            }
                                        })()}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">Slug: {page.slug}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Badge variant={page.isPublished ? 'success' : 'secondary'} className="text-[10px] font-black uppercase">
                                        {page.isPublished ? 'Published' : 'Draft'}
                                    </Badge>
                                    <button onClick={() => handleOpenModal(page)} className="p-2 text-slate-400 hover:text-brand-600 rounded-lg transition-all">
                                        <Edit3 className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => handleDelete(page._id)} className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-all">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingPageId ? 'Edit Page' : 'Create Page'}
                size="xl"
            >
                <form onSubmit={handleSave} className="space-y-6 text-left">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Target App</label>
                            <select
                                value={formData.targetApp}
                                onChange={(e) => setFormData({ ...formData, targetApp: e.target.value })}
                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-brand-500/10"
                            >
                                <option value="global">Global / Website</option>
                                <option value="customer">Customer App</option>
                                <option value="seller">Seller App</option>
                                <option value="driver">Driver App</option>
                            </select>
                        </div>
                        <div className="md:col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Page Title</label>
                            <input
                                type="text"
                                required
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-brand-500/10"
                                placeholder="e.g. Terms and Conditions"
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Slug</label>
                            <input
                                type="text"
                                required
                                value={formData.slug}
                                onChange={(e) => setFormData({ ...formData, slug: e.target.value.trim().toLowerCase().replace(/\s+/g, '-') })}
                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-brand-500/10"
                                placeholder="e.g. terms-and-conditions"
                            />
                        </div>
                    </div>
                    
                    <div className="mb-10">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Content</label>
                        <div className="bg-white rounded-2xl overflow-hidden border border-slate-200">
                            <JoditEditor
                                ref={editor}
                                value={formData.content}
                                onBlur={(newContent) => setFormData({ ...formData, content: newContent })}
                                tabIndex={1}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                        <input
                            type="checkbox"
                            id="isPublished"
                            checked={formData.isPublished}
                            onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                            className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                        />
                        <label htmlFor="isPublished" className="text-sm font-bold text-slate-700 cursor-pointer">
                            Publish this page publicly
                        </label>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                            CANCEL
                        </button>
                        <button type="submit" className="flex-1 bg-[#116A29] hover:bg-[#0e5621] text-white rounded-2xl font-bold uppercase shadow-md transition-all flex items-center justify-center gap-2 py-3 active:scale-95 text-sm">
                            <Save className="h-4 w-4" /> SAVE PAGE
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default PagesManagement;
