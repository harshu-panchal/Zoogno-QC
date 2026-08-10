import handleResponse from "../../utils/helper.js";
import Zone from "../../models/zone.js";

export const getZones = async (req, res) => {
  try {
    const zones = await Zone.find().sort({ createdAt: -1 });
    return handleResponse(res, 200, "Zones fetched successfully", zones);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createZone = async (req, res) => {
  try {
    const { name, coordinates } = req.body;

    if (!name) {
      return handleResponse(res, 400, "Zone name is required");
    }
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
      return handleResponse(res, 400, "At least 3 coordinates are required to define a zone");
    }

    // Ensure GeoJSON Polygon format: outer ring must be closed
    const outerRing = [...coordinates];
    const first = outerRing[0];
    const last = outerRing[outerRing.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      outerRing.push(first);
    }

    const newZone = new Zone({
      name,
      location: {
        type: "Polygon",
        coordinates: [outerRing],
      },
    });

    await newZone.save();
    return handleResponse(res, 201, "Zone created successfully", newZone);
  } catch (error) {
    if (error.code === 11000) {
      return handleResponse(res, 400, "A zone with this name already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

export const updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, coordinates, isActive } = req.body;

    const zone = await Zone.findById(id);
    if (!zone) {
      return handleResponse(res, 404, "Zone not found");
    }

    if (name !== undefined) {
      zone.name = name;
    }
    if (isActive !== undefined) {
      zone.isActive = isActive;
    }
    if (coordinates !== undefined) {
      if (!Array.isArray(coordinates) || coordinates.length < 3) {
        return handleResponse(res, 400, "At least 3 coordinates are required to define a zone");
      }
      const outerRing = [...coordinates];
      const first = outerRing[0];
      const last = outerRing[outerRing.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        outerRing.push(first);
      }
      zone.location = {
        type: "Polygon",
        coordinates: [outerRing],
      };
    }

    await zone.save();
    return handleResponse(res, 200, "Zone updated successfully", zone);
  } catch (error) {
    if (error.code === 11000) {
      return handleResponse(res, 400, "A zone with this name already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

export const deleteZone = async (req, res) => {
  try {
    const { id } = req.params;
    const zone = await Zone.findByIdAndDelete(id);
    if (!zone) {
      return handleResponse(res, 404, "Zone not found");
    }
    return handleResponse(res, 200, "Zone deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
