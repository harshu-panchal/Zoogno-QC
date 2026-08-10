import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import Zone from "../../models/zone.js";
import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";

function isPointInPolygon(point, polygonCoordinates) {
  if (!point || !Array.isArray(point) || point.length < 2) return false;
  if (!polygonCoordinates || !Array.isArray(polygonCoordinates) || !polygonCoordinates[0]) return false;
  const [lng, lat] = point;
  const ring = polygonCoordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export const getDeliveryPartners = async (req, res) => {
  try {
    const { status, verified, zone = "all" } = req.query;
    const query = {};

    if (status === "online") {
      query.isOnline = true;
    } else if (status === "offline") {
      query.isOnline = false;
    }

    if (verified === "true") {
      query.isVerified = true;
    } else if (verified === "false") {
      query.isVerified = false;
    }

    const [deliveryPartners, zones] = await Promise.all([
      Delivery.find(query)
        .sort({ createdAt: -1 })
        .lean(),
      Zone.find({ isActive: true }).lean(),
    ]);

    const mapped = deliveryPartners.map((rider) => {
      const coords = Array.isArray(rider.location?.coordinates)
        ? rider.location.coordinates
        : [];
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      const locationValid = coords.length >= 2 && Number.isFinite(lng) && Number.isFinite(lat);

      const matchedZone = zones.find((z) => {
        if (!locationValid) return false;
        return isPointInPolygon([lng, lat], z.location?.coordinates);
      });

      return {
        ...rider,
        zoneName: matchedZone ? matchedZone.name : "No Zone",
        zoneId: matchedZone ? String(matchedZone._id) : null,
      };
    });

    const filtered = mapped.filter((rider) => {
      if (!zone || zone === "all") return true;
      return rider.zoneId === zone || rider.zoneName === zone;
    });

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const paginatedItems = filtered.slice(skip, skip + limit);
    const total = filtered.length;

    return handleResponse(res, 200, "Delivery partners fetched successfully", {
      items: paginatedItems,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      filters: {
        zones: zones.map((z) => ({ id: String(z._id), name: z.name })),
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndUpdate(
      id,
      { isVerified: true },
      { new: true },
    );

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider approved successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndDelete(id);

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(
      res,
      200,
      "Rider application rejected and removed",
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveFleet = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = {
      deliveryBoy: { $ne: null },
      status: {
        $in: ["confirmed", "packed", "shipped", "out_for_delivery"],
      },
    };

    const [activeOrders, total] = await Promise.all([
      Order.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("deliveryBoy", "name phone documents vehicleType emergencyContacts")
        .populate("seller", "shopName address name")
        .populate("customer", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    const fleetData = activeOrders.map((order) => ({
      id: order.orderId,
      status:
        order.status === "out_for_delivery"
          ? "On the Way"
          : order.status === "packed"
            ? "At Pickup"
            : order.status === "shipped"
              ? "In Transit"
              : "Assigned",
      deliveryBoy: {
        name: order.deliveryBoy?.name || "Unknown",
        phone: order.deliveryBoy?.phone || "N/A",
        id: order.deliveryBoy?._id || "N/A",
        vehicle: order.deliveryBoy?.vehicleType || "N/A",
        image:
          order.deliveryBoy?.documents?.profileImage ||
          "https://via.placeholder.com/200",
      },
      seller: {
        name: order.seller?.shopName || order.seller?.name || "Unknown",
      },
      customer: {
        name: order.customer?.name || "Guest",
        phone: order.customer?.phone || "N/A",
      },
      lastUpdate: order.updatedAt,
    }));

    return handleResponse(res, 200, "Active fleet fetched successfully", {
      items: fleetData,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
