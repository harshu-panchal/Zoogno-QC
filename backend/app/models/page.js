import mongoose from "mongoose";

const pageSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    default: ''
  },
  targetApp: {
    type: String,
    enum: ['global', 'customer', 'seller', 'driver'],
    default: 'global'
  },
  isPublished: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

export default mongoose.model("Page", pageSchema);
