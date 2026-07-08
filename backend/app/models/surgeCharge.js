import mongoose from 'mongoose';

const surgeChargeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  ruleType: {
    type: String,
    enum: ['Peak Hours', 'Rain', 'Festivals', 'Night', 'High Demand', 'Other'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  calculationType: {
    type: String,
    enum: ['Fixed', 'Percentage'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  applyTo: {
    type: String,
    enum: ['All', 'Category', 'Seller', 'City'],
    required: true
  },
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  sellers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  }],
  cities: [{
    type: String
  }],
  priority: {
    type: Number,
    default: 0,
    description: "Higher number means higher priority when multiple rules conflict"
  }
}, { timestamps: true });

const SurgeCharge = mongoose.model('SurgeCharge', surgeChargeSchema);
export default SurgeCharge;
