import SurgeCharge from '../../models/surgeCharge.js';

// Create a new surge charge
export const createSurgeCharge = async (req, res) => {
  try {
    const surgeCharge = new SurgeCharge(req.body);
    await surgeCharge.save();
    res.status(201).json({ success: true, message: 'Surge charge created successfully', data: surgeCharge });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all surge charges
export const getAllSurgeCharges = async (req, res) => {
  try {
    const surgeCharges = await SurgeCharge.find()
      .populate('categories', 'name')
      .populate('sellers', 'shopName name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: surgeCharges });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single surge charge
export const getSurgeChargeById = async (req, res) => {
  try {
    const surgeCharge = await SurgeCharge.findById(req.params.id)
      .populate('categories', 'name')
      .populate('sellers', 'shopName name');
    if (!surgeCharge) {
      return res.status(404).json({ success: false, message: 'Surge charge not found' });
    }
    res.status(200).json({ success: true, data: surgeCharge });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update surge charge
export const updateSurgeCharge = async (req, res) => {
  try {
    const surgeCharge = await SurgeCharge.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!surgeCharge) {
      return res.status(404).json({ success: false, message: 'Surge charge not found' });
    }
    res.status(200).json({ success: true, message: 'Surge charge updated successfully', data: surgeCharge });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Toggle active status
export const toggleSurgeChargeStatus = async (req, res) => {
  try {
    const surgeCharge = await SurgeCharge.findById(req.params.id);
    if (!surgeCharge) {
      return res.status(404).json({ success: false, message: 'Surge charge not found' });
    }
    surgeCharge.isActive = !surgeCharge.isActive;
    await surgeCharge.save();
    res.status(200).json({ success: true, message: `Surge charge ${surgeCharge.isActive ? 'enabled' : 'disabled'}`, data: surgeCharge });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete surge charge
export const deleteSurgeCharge = async (req, res) => {
  try {
    const surgeCharge = await SurgeCharge.findByIdAndDelete(req.params.id);
    if (!surgeCharge) {
      return res.status(404).json({ success: false, message: 'Surge charge not found' });
    }
    res.status(200).json({ success: true, message: 'Surge charge deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
