import mongoose from "mongoose";

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Polygon"],
        required: true,
        default: "Polygon",
      },
      coordinates: {
        type: [[[Number]]], // array of rings (GeoJSON [[[lng, lat], [lng, lat], ...]])
        required: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

zoneSchema.index({ location: "2dsphere" });

const Zone = mongoose.model("Zone", zoneSchema);
export default Zone;
