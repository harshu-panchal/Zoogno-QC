import { jest } from "@jest/globals";

const mockSellerFindOne = jest.fn();
const mockSellerCreate = jest.fn();
const mockVerifySellerVerificationToken = jest.fn();
const mockUploadToCloudinary = jest.fn();
const mockZoneFindOne = jest.fn();
const mockVerifyIdToken = jest.fn();

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findOne: mockSellerFindOne,
    create: mockSellerCreate,
  },
}));

jest.unstable_mockModule("../app/models/zone.js", () => ({
  default: {
    findOne: mockZoneFindOne,
  },
}));

jest.unstable_mockModule("../app/services/sellerVerificationService.js", () => ({
  issueSellerVerificationOtp: jest.fn(),
  verifySellerOtpCode: jest.fn(),
  verifySellerVerificationToken: mockVerifySellerVerificationToken,
  issueSellerForgotPasswordOtp: jest.fn(),
  verifySellerForgotPasswordOtp: jest.fn(),
}));

jest.unstable_mockModule("../app/services/mediaService.js", () => ({
  uploadToCloudinary: mockUploadToCloudinary,
}));

jest.unstable_mockModule("../app/config/firebaseAdmin.js", () => ({
  getFirebaseAdminApp: () => ({}),
}));

jest.unstable_mockModule("firebase-admin", () => ({
  default: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

const { signupSeller } = await import("../app/controller/sellerAuthController.js");

describe("sellerAuthController signupSeller", () => {
  let req;
  let res;
  const zoneId = "64b000000000000000000001";

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {
        name: "Seller Owner",
        email: "seller@example.com",
        phone: "9876543210",
        password: "secret123",
        emailVerificationToken: "email-token",
        phoneVerificationToken: "phone-token",
        shopName: "Noyo Mart",
        category: "Groceries",
        address: "MG Road",
        lat: 12.9716,
        lng: 77.5946,
        zone: zoneId,
        documents: JSON.stringify({
          tradeLicense: "https://example.com/trade-license.pdf",
          gstCertificate: "https://example.com/gst.pdf",
          idProof: "https://example.com/id-proof.pdf",
          sellerImage: "https://example.com/seller.jpg",
        }),
      },
      files: [],
      ip: "127.0.0.1",
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockSellerFindOne.mockImplementation((query) => {
      if (query?.sellerId) {
        return {
          sort: () => ({
            exec: async () => null,
          }),
        };
      }
      return Promise.resolve(null);
    });
    mockSellerCreate.mockImplementation(async (payload) => ({
      _id: "seller-1",
      ...payload,
    }));
    mockVerifyIdToken.mockResolvedValue({ phone_number: "+919876543210" });
    mockZoneFindOne.mockResolvedValue({
      _id: zoneId,
      name: "Central Zone",
      isActive: true,
    });
  });

  it("requires both verified email and phone tokens before creating the seller", async () => {
    await signupSeller(req, res);

    expect(mockVerifySellerVerificationToken).toHaveBeenCalledTimes(1);
    expect(mockVerifySellerVerificationToken).toHaveBeenNthCalledWith(1, {
      channel: "email",
      rawValue: "seller@example.com",
      token: "email-token",
    });
    expect(mockVerifyIdToken).toHaveBeenCalledWith("phone-token");
    expect(mockSellerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        emailVerified: true,
        phoneVerified: true,
        isVerified: false,
        isActive: false,
        applicationStatus: "pending",
        zone: zoneId,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects signup when no delivery zone is selected", async () => {
    req.body.zone = "";
    await signupSeller(req, res);

    expect(mockSellerCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Please select a delivery zone",
      }),
    );
  });
});
