import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileCheck, UploadCloud, XCircle, Clock, AlertCircle } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";
import { deliveryApi } from "../../services/deliveryApi";

const Documents = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState(null);
  
  const [docs, setDocs] = useState([
    {
      id: "aadhar",
      title: "Aadhar Card",
      status: "Missing",
      url: null,
    },
    {
      id: "pan",
      title: "PAN Card",
      status: "Missing",
      url: null,
    },
    {
      id: "drivingLicense",
      title: "Driving License",
      status: "Missing",
      url: null,
    }
  ]);

  const fetchProfile = async () => {
    try {
      const res = await deliveryApi.getProfile();
      if (res.data.success) {
        const profile = res.data.result;
        const documents = profile.documents || {};
        const isVerified = profile.isVerified;

        setDocs(prev => prev.map(doc => {
          const url = documents[doc.id];
          let status = "Missing";
          if (url) {
            status = isVerified ? "Verified" : "Pending";
          }
          return { ...doc, url, status };
        }));
      }
    } catch (error) {
      console.error("Failed to fetch profile documents", error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleUploadClick = (id) => {
    setActiveUploadId(id);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeUploadId) return;

    // Reset input so the same file can be selected again if needed
    e.target.value = null;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    try {
      setUploading(true);
      const toastId = toast.loading(`Uploading ${activeUploadId}...`);
      
      const formData = new FormData();
      formData.append(activeUploadId, file);

      const res = await deliveryApi.updateProfile(formData);
      
      if (res.data.success) {
        toast.success("Document uploaded successfully", { id: toastId });
        await fetchProfile(); // Refresh document status
      }
    } catch (error) {
      toast.error("Failed to upload document");
      console.error(error);
    } finally {
      setUploading(false);
      setActiveUploadId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Verified":
        return (
          <span className="flex items-center text-brand-600 bg-brand-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            <FileCheck size={12} className="mr-1" /> Verified
          </span>
        );
      case "Pending":
        return (
          <span className="flex items-center text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            <Clock size={12} className="mr-1" /> Pending
          </span>
        );
      case "Missing":
        return (
          <span className="flex items-center text-red-600 bg-red-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            <AlertCircle size={12} className="mr-1" /> Missing
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,application/pdf"
      />

      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">My Documents</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {loading ? (
          <div className="text-center py-10 text-gray-400 font-bold text-sm animate-pulse">
            Loading your documents...
          </div>
        ) : (
          docs.map((doc) => (
            <Card key={doc.id} className={`p-4 border ${doc.status === 'Missing' ? 'border-red-100 bg-red-50/30' : 'border-gray-100'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-bold text-gray-800">{doc.title}</h4>
                  {doc.url && (
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-black">Document Uploaded</p>
                  )}
                </div>
                {getStatusBadge(doc.status)}
              </div>

              <div className="flex space-x-2 mt-4">
                {doc.status !== "Verified" && (
                  <Button 
                    size="sm" 
                    className={`w-full text-xs h-9 ${doc.status === 'Missing' ? 'bg-primary' : ''}`} 
                    onClick={() => handleUploadClick(doc.id)}
                    disabled={uploading}
                  >
                    <UploadCloud size={14} className="mr-1.5" /> 
                    {uploading && activeUploadId === doc.id ? "Uploading..." : doc.status === "Missing" ? "Upload File" : "Update File"}
                  </Button>
                )}
                {doc.url && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs h-9 font-bold"
                    onClick={() => window.open(doc.url, "_blank")}
                  >
                    View File
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
        
        <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-xs font-medium leading-relaxed border border-blue-100 mt-6">
          <p className="font-bold mb-1 flex items-center text-sm"><FileCheck size={16} className="mr-1.5" /> Note on Verification</p>
          <p>Please ensure all uploaded documents are clear and readable. PDF or Image formats are accepted. Max file size is 5MB.</p>
        </div>
      </div>
    </div>
  );
};

export default Documents;
