import mongoose from "mongoose";

/**
 * GstExportTemplate - admin-configurable field mapping for a GST report's JSON/CSV export.
 *
 * The underlying data (GstTransaction / Invoice documents) never changes shape when a
 * template changes: a template only says which stored fields to include, what label to show
 * for each, and in what order - so updating the export format for a new GST Portal / accounting
 * tool requirement never requires touching the reporting code itself.
 */
const REPORT_TYPES = [
  "seller_sales",
  "documents_issued",
  "service_invoice",
  "commission",
  "commission_summary",
  "seller_commission_summary",
  "settlement",
  "reconciliation",
];

const templateFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // canonical field name on the source document
    label: { type: String, required: true }, // display name in the export
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const gstExportTemplateSchema = new mongoose.Schema(
  {
    reportType: { type: String, enum: REPORT_TYPES, required: true, index: true },
    name: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    fields: [templateFieldSchema],
    createdBy: { type: String },
  },
  { timestamps: true },
);

gstExportTemplateSchema.index({ reportType: 1, name: 1 }, { unique: true });

export const GST_EXPORT_REPORT_TYPES = REPORT_TYPES;

export default mongoose.model("GstExportTemplate", gstExportTemplateSchema);
