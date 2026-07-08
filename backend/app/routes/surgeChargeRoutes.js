import express from 'express';
import {
  createSurgeCharge,
  getAllSurgeCharges,
  getSurgeChargeById,
  updateSurgeCharge,
  toggleSurgeChargeStatus,
  deleteSurgeCharge
} from '../controller/admin/surgeChargeController.js';

const router = express.Router();

// All routes are protected by admin auth middleware in the main app.js or adminRoutes.js
router.post('/', createSurgeCharge);
router.get('/', getAllSurgeCharges);
router.get('/:id', getSurgeChargeById);
router.put('/:id', updateSurgeCharge);
router.patch('/:id/toggle', toggleSurgeChargeStatus);
router.delete('/:id', deleteSurgeCharge);

export default router;
