import mongoose from "mongoose";
import User from "../../models/customer.js";
import Order from "../../models/order.js";

export async function getUsersData({ page, limit, skip, search, status }) {
  const matchQuery = { role: "user" };

  if (status && status !== "all") {
    if (status === "active") {
      matchQuery.isActive = { $ne: false };
    } else if (status === "inactive") {
      matchQuery.isActive = false;
    }
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    const escapedSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const digitsOnly = trimmedSearch.replace(/\D/g, "");

    const orConditions = [
      { name: { $regex: escapedSearch, $options: "i" } },
      { email: { $regex: escapedSearch, $options: "i" } },
      { phone: { $regex: escapedSearch, $options: "i" } },
    ];

    if (digitsOnly.length > 0 && digitsOnly !== escapedSearch) {
      orConditions.push({ phone: { $regex: digitsOnly, $options: "i" } });
    }

    matchQuery.$or = orConditions;
  }

  const pipeline = [
    { $match: matchQuery },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "customer",
        as: "userOrders",
      },
    },
    {
      $project: {
        id: { $toString: "$_id" },
        name: { $ifNull: ["$name", "Unnamed Customer"] },
        email: 1,
        phone: 1,
        joinedDate: "$createdAt",
        status: {
          $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
        },
        totalOrders: {
          $size: {
            $filter: {
              input: "$userOrders",
              as: "order",
              cond: { $eq: ["$$order.status", "delivered"] }
            }
          }
        },
        totalSpent: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: "$userOrders",
                  as: "order",
                  cond: { $eq: ["$$order.status", "delivered"] }
                }
              },
              as: "deliveredOrder",
              in: "$$deliveredOrder.pricing.total"
            }
          }
        },
        lastOrderDate: { $max: "$userOrders.createdAt" },
        avatar: {
          $concat: [
            "https://api.dicebear.com/7.x/avataaars/svg?seed=",
            { $ifNull: ["$name", "Customer"] },
          ],
        },
      },
    },
    { $sort: { totalOrders: -1 } },
  ];

  const [result] = await User.aggregate([
    ...pipeline,
    {
      $facet: {
        totalCount: [{ $count: "count" }],
        items: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ]);

  const total = result?.totalCount?.[0]?.count ?? 0;
  const items = result?.items ?? [];

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getUserByIdData(id) {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
        role: "user",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "customer",
        as: "userOrders",
      },
    },
    {
      $project: {
        id: { $toString: "$_id" },
        name: { $ifNull: ["$name", "Unnamed Customer"] },
        email: 1,
        phone: 1,
        joinedDate: "$createdAt",
        status: {
          $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
        },
        totalOrders: {
          $size: {
            $filter: {
              input: "$userOrders",
              as: "order",
              cond: { $eq: ["$$order.status", "delivered"] }
            }
          }
        },
        totalSpent: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: "$userOrders",
                  as: "order",
                  cond: { $eq: ["$$order.status", "delivered"] }
                }
              },
              as: "deliveredOrder",
              in: "$$deliveredOrder.pricing.total"
            }
          }
        },
        lastOrderDate: { $max: "$userOrders.createdAt" },
        avatar: {
          $concat: [
            "https://api.dicebear.com/7.x/avataaars/svg?seed=",
            { $ifNull: ["$name", "Customer"] },
          ],
        },
        addresses: { $ifNull: ["$addresses", []] },
      },
    },
  ]);

  if (!user || user.length === 0) {
    return null;
  }

  const recentOrders = await Order.find({ customer: id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("items.product", "name mainImage");

  const selectedUser = user[0];
  const addresses = Array.isArray(selectedUser.addresses)
    ? selectedUser.addresses
    : [];

  return {
    ...selectedUser,
    addresses,
    recentOrders: recentOrders.map((order) => ({
      id: order.orderId,
      _id: order._id,
      itemsCount: order.items.length,
      amount: order.pricing.total,
      date: order.createdAt,
      status: order.status,
    })),
  };
}
