import { jest } from "@jest/globals";

const mockTicketFindById = jest.fn();
const mockTicketFind = jest.fn();
const mockTicketCountDocuments = jest.fn();
const mockTicketConstructor = jest.fn();
const mockOrderFindOne = jest.fn();
const mockAdminFind = jest.fn();
const mockSaveTicketMessage = jest.fn();
const mockEmitTicketCreated = jest.fn();
const mockEmitTicketMessage = jest.fn();

function TicketModel(data) {
  mockTicketConstructor(data);
  return {
    _id: "507f1f77bcf86cd799439011",
    ...data,
    messages: [],
    status: "open",
    save: jest.fn().mockResolvedValue(undefined),
  };
}
TicketModel.findById = mockTicketFindById;
TicketModel.find = mockTicketFind;
TicketModel.countDocuments = mockTicketCountDocuments;

jest.unstable_mockModule("../app/models/ticket.js", () => ({ default: TicketModel }));
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne },
}));
jest.unstable_mockModule("../app/models/admin.js", () => ({
  default: { find: mockAdminFind },
}));
jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: { find: jest.fn() },
}));
jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { find: jest.fn() },
}));
jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: { find: jest.fn() },
}));
jest.unstable_mockModule("../app/services/firebaseService.js", () => ({
  saveTicketMessage: mockSaveTicketMessage,
}));
jest.unstable_mockModule("../app/services/ticketSocketEmitter.js", () => ({
  emitTicketCreated: mockEmitTicketCreated,
  emitTicketMessage: mockEmitTicketMessage,
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

const { createTicket, replyToTicket } = await import("../app/controller/ticketController.js");
const {
  addTicketMessageSchema,
  createTicketSchema,
  updateTicketStatusSchema,
} = await import("../app/validation/ticketValidation.js");

function responseDouble() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("ticket controller authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveTicketMessage.mockResolvedValue(null);
    mockAdminFind.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
  });

  test("derives ticket user type from the authenticated role", async () => {
    const req = {
      user: { id: "507f191e810c19729de860ea", role: "seller" },
      body: {
        subject: "Payout problem",
        description: "My payout has not arrived",
        priority: "medium",
        userType: "Customer",
      },
    };
    const res = responseDouble();

    await createTicket(req, res);

    expect(mockTicketConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: req.user.id,
        userType: "Seller",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("rejects a reply to another user's ticket", async () => {
    const ticket = {
      _id: "507f1f77bcf86cd799439011",
      userId: "507f191e810c19729de860eb",
      messages: [],
      save: jest.fn(),
    };
    mockTicketFindById.mockResolvedValue(ticket);
    const req = {
      params: { id: ticket._id },
      user: { id: "507f191e810c19729de860ea", role: "customer" },
      body: { text: "Forged reply", isAdmin: true },
    };
    const res = responseDouble();

    await replyToTicket(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(ticket.save).not.toHaveBeenCalled();
    expect(mockSaveTicketMessage).not.toHaveBeenCalled();
  });

  test("ignores a forged isAdmin flag on an owner's reply", async () => {
    const userId = "507f191e810c19729de860ea";
    const ticket = {
      _id: "507f1f77bcf86cd799439011",
      userId,
      subject: "Order issue",
      status: "open",
      messages: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockTicketFindById.mockResolvedValue(ticket);
    const req = {
      params: { id: ticket._id },
      user: { id: userId, role: "customer", name: "Customer" },
      body: { text: "Please help", isAdmin: true },
    };
    const res = responseDouble();

    await replyToTicket(req, res);

    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]).toEqual(
      expect.objectContaining({
        senderType: "User",
        isAdmin: false,
      }),
    );
    expect(ticket.status).toBe("open");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("ticket request validation", () => {
  test("accepts the complete order-linked issue payload", () => {
    const { error } = createTicketSchema.validate({
      subject: "Order #ORD-1: Product missing",
      description: "The milk was missing from the bag",
      priority: "high",
      userType: "Customer",
      orderId: "ORD-1",
      issueType: "MISSING_PRODUCT",
      attachments: ["https://cdn.example.com/evidence.jpg"],
    });

    expect(error).toBeUndefined();
  });

  test("keeps legacy isAdmin input valid while authorization ignores it", () => {
    const { error } = addTicketMessageSchema.validate({
      text: "A reply",
      isAdmin: true,
    });

    expect(error).toBeUndefined();
  });

  test("uses the same ticket statuses as the persistence model", () => {
    expect(updateTicketStatusSchema.validate({ status: "processing" }).error).toBeUndefined();
    expect(updateTicketStatusSchema.validate({ status: "resolved" }).error).toBeDefined();
  });
});
